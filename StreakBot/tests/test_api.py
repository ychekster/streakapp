"""HTTP API целиком: авторизация, изоляция данных пользователей, лимиты, формат ошибок."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import AuthUser
from tests.helpers import sign_init_data
from tma.backend.constants import MAX_DB_INT, MAX_REQUEST_BODY_BYTES
from tma.backend.ratelimit import RateLimiter


def _habit(name: str = "Зарядка", **fields: object) -> dict[str, object]:
    return {"name": name, "frequency_type": "daily", **fields}


def _create(client: TestClient, user: AuthUser, name: str = "Зарядка") -> dict:
    response = client.post("/tasks", json=_habit(name), headers=user.headers)
    assert response.status_code == 201, response.text
    return response.json()["habit"]


# --------------------------------------------------------------------------- #
#  Авторизация
# --------------------------------------------------------------------------- #


def test_request_without_init_data_is_401(client: TestClient) -> None:
    response = client.get("/tasks")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "missing_init_data"


def test_request_with_forged_init_data_is_401(client: TestClient) -> None:
    forged = sign_init_data(1, token="999:not-our-bot")
    response = client.get("/tasks", headers={"Authorization": f"tma {forged}"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_init_data"


# --------------------------------------------------------------------------- #
#  Привычки
# --------------------------------------------------------------------------- #


def test_habit_lifecycle(client: TestClient, user: AuthUser) -> None:
    habit = _create(client, user)
    assert habit["done_today"] is False
    assert habit["scheduled_today"] is True

    toggled = client.post(f"/tasks/{habit['id']}/toggle", headers=user.headers).json()["habit"]
    assert toggled["done_today"] is True
    assert toggled["history"][-1] is True
    assert toggled["current_streak"] == toggled["total_done"] == 1

    listed = client.get("/tasks", headers=user.headers).json()["habits"]
    assert [item["id"] for item in listed] == [habit["id"]]
    assert listed[0]["done_today"] is True

    untoggled = client.post(f"/tasks/{habit['id']}/toggle", headers=user.headers).json()["habit"]
    assert untoggled["done_today"] is False
    assert untoggled["total_done"] == 0

    updated = client.put(
        f"/tasks/{habit['id']}",
        json=_habit("Бег", frequency_type="specific_days", days=["fri", "mon"],
                    reminder_time="07:30", color="green"),
        headers=user.headers,
    ).json()["habit"]
    assert (updated["name"], updated["days"], updated["reminder_time"], updated["color"]) == (
        "Бег", ["mon", "fri"], "07:30", "green",
    )

    assert client.delete(f"/tasks/{habit['id']}", headers=user.headers).status_code == 204
    assert client.get("/tasks", headers=user.headers).json()["habits"] == []


def test_other_users_habit_is_not_accessible(
    client: TestClient, user: AuthUser, other_user: AuthUser
) -> None:
    habit = _create(client, user)
    path = f"/tasks/{habit['id']}"
    for response in (
        client.post(f"{path}/toggle", headers=other_user.headers),
        client.put(path, json=_habit("Чужая"), headers=other_user.headers),
        client.delete(path, headers=other_user.headers),
    ):
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "task_not_found"
    assert client.get("/tasks", headers=other_user.headers).json()["habits"] == []
    # Привычка владельца не тронута.
    assert client.get("/tasks", headers=user.headers).json()["habits"][0]["name"] == "Зарядка"


def test_duplicate_name_is_case_insensitive_for_cyrillic(
    client: TestClient, user: AuthUser
) -> None:
    _create(client, user, "Чтение")
    response = client.post("/tasks", json=_habit("  чТЕНИЕ "), headers=user.headers)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "duplicate_name"


def test_control_characters_are_removed_from_name(client: TestClient, user: AuthUser) -> None:
    habit = _create(client, user, "Читать\n\tкнигу\x00  ")
    assert habit["name"] == "Читать книгу"


def test_habit_limit(client: TestClient, user: AuthUser, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("tma.backend.services.MAX_HABITS_PER_USER", 2)
    _create(client, user, "Первая")
    _create(client, user, "Вторая")
    response = client.post("/tasks", json=_habit("Третья"), headers=user.headers)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "habit_limit"


def test_failed_commit_is_reported_to_client(
    client: TestClient, user: AuthUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    """commit выполняется до отправки ответа: его сбой — это 500, а не ложный 201."""
    client.get("/settings", headers=user.headers)  # пользователь уже создан

    async def failing_commit(self: AsyncSession) -> None:
        raise RuntimeError("database is locked")

    with monkeypatch.context() as patch:
        patch.setattr(AsyncSession, "commit", failing_commit)
        response = client.post("/tasks", json=_habit(), headers=user.headers)
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "internal_error"
    assert client.get("/tasks", headers=user.headers).json()["habits"] == []


# --------------------------------------------------------------------------- #
#  Настройки и справочники
# --------------------------------------------------------------------------- #


def test_settings_update(client: TestClient, user: AuthUser) -> None:
    settings = client.get("/settings", headers=user.headers).json()
    assert settings["timezone"] is None
    updated = client.put(
        "/settings", json={"timezone": "europe/moscow", "theme": "dark"}, headers=user.headers
    ).json()
    # Имя зоны сохраняется каноническим, как бы его ни написали.
    assert updated["timezone"] == "Europe/Moscow"
    assert updated["theme"] == "dark"
    invalid = client.put("/settings", json={"timezone": "Mars/Olympus"}, headers=user.headers)
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "invalid_timezone"


def test_timezone_search(client: TestClient, user: AuthUser) -> None:
    response = client.get("/meta/timezones", params={"q": "питер", "language": "ru"},
                          headers=user.headers)
    assert response.status_code == 200
    assert response.json()["timezones"][0]["zone"] == "Europe/Moscow"


# --------------------------------------------------------------------------- #
#  Защита и инфраструктура
# --------------------------------------------------------------------------- #


def test_oversized_body_is_rejected(client: TestClient, user: AuthUser) -> None:
    big = b'{"name": "' + b"x" * MAX_REQUEST_BODY_BYTES + b'"}'
    declared = client.post(
        "/tasks", content=big, headers={**user.headers, "Content-Type": "application/json"}
    )
    assert declared.status_code == 413
    assert declared.json()["error"]["code"] == "payload_too_large"

    # Без Content-Length (chunked) тело считается по мере чтения.
    chunked = client.post(
        "/tasks",
        content=(big[i : i + 4096] for i in range(0, len(big), 4096)),
        headers={**user.headers, "Content-Type": "application/json"},
    )
    assert chunked.status_code == 413
    assert chunked.json()["error"]["code"] == "payload_too_large"


def test_rate_limit(client: TestClient, user: AuthUser) -> None:
    app = client.app
    original = app.state.rate_limiter
    app.state.rate_limiter = RateLimiter(burst=3, per_second=0.01)
    try:
        statuses = [client.get("/settings", headers=user.headers).status_code for _ in range(4)]
    finally:
        app.state.rate_limiter = original
    assert statuses == [200, 200, 200, 429]


def test_rate_limited_response_has_retry_after(client: TestClient, user: AuthUser) -> None:
    app = client.app
    original = app.state.rate_limiter
    app.state.rate_limiter = RateLimiter(burst=1, per_second=0.5)
    try:
        client.get("/settings", headers=user.headers)
        response = client.get("/settings", headers=user.headers)
    finally:
        app.state.rate_limiter = original
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "rate_limited"
    assert response.headers["Retry-After"] == "2"


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json"])
def test_api_docs_are_not_public(client: TestClient, path: str) -> None:
    response = client.get(path)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_responses_are_not_cached_and_not_sniffed(client: TestClient, user: AuthUser) -> None:
    response = client.get("/tasks", headers=user.headers)
    assert response.headers["Cache-Control"] == "no-store"
    assert response.headers["X-Content-Type-Options"] == "nosniff"


def test_cors_preflight_allows_delete(client: TestClient) -> None:
    response = client.options(
        "/tasks/1",
        headers={
            "Origin": "https://mini-app.example.com",
            "Access-Control-Request-Method": "DELETE",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert response.status_code == 200
    assert "DELETE" in response.headers["Access-Control-Allow-Methods"]


# Идентификатор длиннее 64 бит колонка базы не принимает: без проверки параметра он
# доходил до запроса и падал ошибкой драйвера (500) вместо ответа о плохом параметре.
_HUGE_IDS = [str(MAX_DB_INT + 1), "9" * 30]


@pytest.mark.parametrize("task_id", _HUGE_IDS)
def test_huge_task_id_is_rejected_not_crashed(
    client: TestClient, user: AuthUser, task_id: str
) -> None:
    for response in (
        client.post(f"/tasks/{task_id}/toggle", headers=user.headers),
        client.delete(f"/tasks/{task_id}", headers=user.headers),
        client.put(f"/tasks/{task_id}", json=_habit(), headers=user.headers),
    ):
        assert response.status_code == 422, response.text
        assert response.json()["error"]["code"] == "validation_error"


def test_largest_supported_task_id_is_just_not_found(client: TestClient, user: AuthUser) -> None:
    """Граница проверки не отсекает идентификаторы, которые база принимает."""
    response = client.post(f"/tasks/{MAX_DB_INT}/toggle", headers=user.headers)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "task_not_found"


def test_health_checks_database(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
