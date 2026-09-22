"""Админ-панель через HTTP: права, пользователи, отзывы, сообщения, администраторы,
рассылки и аналитика. Bot API подменён (FakeTelegram)."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from tests.conftest import AuthUser, auth_user, new_user
from tests.fake_telegram import FakeTelegram
from tma.backend.constants import BROADCAST_SEGMENTS, SEED_ADMIN_IDS


@pytest.fixture
def telegram(client: TestClient) -> Iterator[FakeTelegram]:
    """Бот API подменён на время теста."""
    fake = FakeTelegram()
    original = client.app.state.bot
    client.app.state.bot = fake
    yield fake
    client.app.state.bot = original


@pytest.fixture
def admin(client: TestClient) -> AuthUser:
    """Новый администратор на каждый тест (его добавляет первый) — у каждого свой лимит
    частоты запросов."""
    fresh = new_user("Admin")
    seed = auth_user(SEED_ADMIN_IDS[0])
    response = client.post("/admin/admins", json={"telegram_id": fresh.id}, headers=seed.headers)
    assert response.status_code == 201, response.text
    return fresh


def _open_app(client: TestClient, user: AuthUser) -> None:
    """Пользователь открыл приложение (запись в базе создаётся первым запросом)."""
    assert client.get("/settings", headers=user.headers).status_code == 200


def _profile(client: TestClient, admin: AuthUser, user_id: int) -> dict:
    response = client.get(f"/admin/users/{user_id}", headers=admin.headers)
    assert response.status_code == 200, response.text
    return response.json()["user"]


# --------------------------------------------------------------------------- #
#  Права
# --------------------------------------------------------------------------- #

_ADMIN_ROUTES = [
    ("GET", "/admin/analytics"),
    ("GET", "/admin/users"),
    ("GET", "/admin/users/1"),
    ("PUT", "/admin/users/1/block"),
    ("DELETE", "/admin/users/1"),
    ("POST", "/admin/users/1/message"),
    ("GET", "/admin/reviews"),
    ("POST", "/admin/reviews/1/reply"),
    ("GET", "/admin/admins"),
    ("POST", "/admin/admins"),
    ("DELETE", "/admin/admins/1"),
    ("GET", "/admin/broadcasts/segments"),
    ("POST", "/admin/broadcasts"),
    ("GET", "/admin/broadcasts/1"),
]


@pytest.mark.parametrize(("method", "path"), _ADMIN_ROUTES)
def test_admin_routes_require_admin(
    client: TestClient, user: AuthUser, method: str, path: str
) -> None:
    anonymous = client.request(method, path)
    assert anonymous.status_code == 401
    regular = client.request(method, path, headers=user.headers, json={})
    assert regular.status_code == 403
    assert regular.json()["error"]["code"] == "admin_required"


def test_settings_show_admin_flag(client: TestClient, user: AuthUser, admin: AuthUser) -> None:
    assert client.get("/settings", headers=user.headers).json()["is_admin"] is False
    assert client.get("/settings", headers=admin.headers).json()["is_admin"] is True


def test_anonymous_upload_is_not_read(client: TestClient) -> None:
    """Большое тело на путь рассылки без авторизации — 401, а не загрузка файла."""
    response = client.post(
        "/admin/broadcasts",
        files={"media": ("big.mp4", b"0" * 200_000, "video/mp4")},
        data={"segment": "all"},
    )
    assert response.status_code == 401


# --------------------------------------------------------------------------- #
#  Отзывы
# --------------------------------------------------------------------------- #


def test_review_reply_flow(
    client: TestClient, user: AuthUser, admin: AuthUser, telegram: FakeTelegram
) -> None:
    created = client.post(
        "/reviews", json={"text": "  Отличное\r\nприложение\x00 "}, headers=user.headers
    )
    assert created.status_code == 201, created.text
    review_id = created.json()["id"]

    page = client.get("/admin/reviews", headers=admin.headers).json()
    newest = page["reviews"][0]
    assert newest["id"] == review_id
    assert newest["text"] == "Отличное\nприложение"
    assert newest["user"]["telegram_id"] == user.id
    assert newest["created_at"].endswith("Z")
    assert [item["id"] for item in _profile(client, admin, user.id)["reviews"]] == [review_id]

    reply = client.post(
        f"/admin/reviews/{review_id}/reply", json={"text": "Спасибо!"}, headers=admin.headers
    ).json()
    assert reply["delivered"] is True
    assert reply["review"]["reply_text"] == "Спасибо!"
    message = telegram.sent[-1]
    assert message.chat_id == user.id
    # Заголовок на языке пользователя, цитата отзыва и ответ.
    assert message.text == "💬 Ответ на ваш отзыв\nОтличное\nприложение\nСпасибо!"
    assert [entity.type for entity in message.extra["entities"]] == [
        "bold",
        "expandable_blockquote",
    ]

    telegram.blocked.add(user.id)
    undelivered = client.post(
        f"/admin/reviews/{review_id}/reply", json={"text": "Ещё"}, headers=admin.headers
    ).json()
    assert undelivered["delivered"] is False
    assert undelivered["reason"] == "bot_blocked"
    # Недошедший ответ не запоминается, а блокировка бота — отмечается.
    assert undelivered["review"]["reply_text"] == "Спасибо!"
    assert _profile(client, admin, user.id)["bot_blocked_at"] is not None


def test_review_pages(client: TestClient, user: AuthUser, admin: AuthUser) -> None:
    for text in ("первый", "второй", "третий"):
        client.post("/reviews", json={"text": text}, headers=user.headers)
    first = client.get("/admin/reviews", params={"limit": 2}, headers=admin.headers).json()
    assert [item["text"] for item in first["reviews"]] == ["третий", "второй"]
    assert first["next_cursor"] is not None
    second = client.get(
        "/admin/reviews", params={"limit": 2, "cursor": first["next_cursor"]}, headers=admin.headers
    ).json()
    assert second["reviews"][0]["text"] == "первый"


def test_review_validation_and_daily_limit(
    client: TestClient, user: AuthUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    empty = client.post("/reviews", json={"text": " \n "}, headers=user.headers)
    assert empty.status_code == 422
    assert empty.json()["error"]["code"] == "invalid_review"

    monkeypatch.setattr("tma.backend.services.MAX_REVIEWS_PER_DAY", 2)
    statuses = [
        client.post("/reviews", json={"text": f"отзыв {i}"}, headers=user.headers).status_code
        for i in range(3)
    ]
    assert statuses == [201, 201, 429]


# --------------------------------------------------------------------------- #
#  Пользователи
# --------------------------------------------------------------------------- #


def test_user_search_and_pages(client: TestClient, admin: AuthUser) -> None:
    zhanna = new_user("Жанна")
    _open_app(client, zhanna)
    other = new_user("Олег")
    _open_app(client, other)

    def search(q: str) -> list[int]:
        page = client.get("/admin/users", params={"q": q}, headers=admin.headers).json()
        return [item["telegram_id"] for item in page["users"]]

    # Без учёта регистра — и для кириллицы.
    assert search("жАН") == [zhanna.id]
    assert search(f"@user{zhanna.id}") == [zhanna.id]
    assert search(str(zhanna.id)) == [zhanna.id]
    assert search("100%_") == []  # % и _ в запросе — обычные символы

    def ids(page: dict) -> list[int]:
        return [item["telegram_id"] for item in page["users"]]

    everyone = ids(client.get("/admin/users", params={"limit": 100}, headers=admin.headers).json())
    # Новые сначала.
    assert everyone.index(other.id) < everyone.index(zhanna.id)
    first = client.get("/admin/users", params={"limit": 2}, headers=admin.headers).json()
    second = client.get(
        "/admin/users", params={"limit": 2, "cursor": first["next_cursor"]}, headers=admin.headers
    ).json()
    assert ids(first) + ids(second) == everyone[:4]


def test_profile(client: TestClient, user: AuthUser, admin: AuthUser) -> None:
    client.post("/tasks", json={"name": "Бег", "frequency_type": "daily"}, headers=user.headers)
    client.put("/settings", json={"timezone": "Europe/Moscow"}, headers=user.headers)
    profile = _profile(client, admin, user.id)
    assert profile["habits"] == 1
    # Пояс подписан на языке администратора (в тестах Telegram на русском).
    assert profile["timezone"] == "Москва"
    client.put("/settings", json={"language": "en"}, headers=admin.headers)
    assert _profile(client, admin, user.id)["timezone"] == "Moscow"
    assert profile["is_admin"] is False
    assert profile["app_opened_at"] is not None
    assert profile["last_seen_at"] is not None
    assert profile["blocked_at"] is None

    missing = client.get("/admin/users/1", headers=admin.headers)
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "user_not_found"


def test_block_and_unblock(client: TestClient, user: AuthUser, admin: AuthUser) -> None:
    _open_app(client, user)
    blocked = client.put(
        f"/admin/users/{user.id}/block", json={"blocked": True}, headers=admin.headers
    )
    assert blocked.json()["user"]["blocked_at"] is not None
    denied = client.get("/tasks", headers=user.headers)
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "user_blocked"

    client.put(f"/admin/users/{user.id}/block", json={"blocked": False}, headers=admin.headers)
    assert client.get("/tasks", headers=user.headers).status_code == 200

    own = client.put(f"/admin/users/{admin.id}/block", json={"blocked": True}, headers=admin.headers)
    assert own.status_code == 409
    assert own.json()["error"]["code"] == "user_is_admin"


def test_delete_user(client: TestClient, user: AuthUser, admin: AuthUser) -> None:
    habit = client.post(
        "/tasks", json={"name": "Бег", "frequency_type": "daily"}, headers=user.headers
    ).json()["habit"]
    client.post(f"/tasks/{habit['id']}/toggle", headers=user.headers)
    client.post("/reviews", json={"text": "пока"}, headers=user.headers)

    assert client.delete(f"/admin/users/{user.id}", headers=admin.headers).status_code == 204
    assert client.get(f"/admin/users/{user.id}", headers=admin.headers).status_code == 404
    # Открыв приложение снова, пользователь начинает с чистого листа.
    assert client.get("/tasks", headers=user.headers).json()["habits"] == []

    own = client.delete(f"/admin/users/{admin.id}", headers=admin.headers)
    assert own.status_code == 409


def test_personal_message(
    client: TestClient, user: AuthUser, admin: AuthUser, telegram: FakeTelegram
) -> None:
    _open_app(client, user)
    path = f"/admin/users/{user.id}/message"
    sent = client.post(path, json={"text": "Привет!\nКак дела?"}, headers=admin.headers)
    assert sent.json() == {"delivered": True, "reason": None}
    assert (telegram.sent[-1].chat_id, telegram.sent[-1].text) == (user.id, "Привет!\nКак дела?")

    for text in ("  ", "x" * 4097):
        invalid = client.post(path, json={"text": text}, headers=admin.headers)
        assert invalid.status_code == 422
        assert invalid.json()["error"]["code"] == "invalid_message"

    telegram.blocked.add(user.id)
    undelivered = client.post(path, json={"text": "Ау"}, headers=admin.headers).json()
    assert undelivered == {"delivered": False, "reason": "bot_blocked"}


# --------------------------------------------------------------------------- #
#  Администраторы
# --------------------------------------------------------------------------- #


def test_manage_admins(client: TestClient, user: AuthUser, admin: AuthUser) -> None:
    listed = client.get("/admin/admins", headers=admin.headers).json()["admins"]
    ids = {item["telegram_id"]: item for item in listed}
    assert SEED_ADMIN_IDS[0] in ids
    assert ids[admin.id]["is_self"] is True
    assert ids[admin.id]["first_name"] == "Admin"

    added = client.post("/admin/admins", json={"telegram_id": user.id}, headers=admin.headers)
    assert added.status_code == 201
    assert client.get("/admin/admins", headers=user.headers).status_code == 200
    again = client.post("/admin/admins", json={"telegram_id": user.id}, headers=admin.headers)
    assert again.json()["error"]["code"] == "admin_exists"

    own = client.delete(f"/admin/admins/{admin.id}", headers=admin.headers)
    assert own.json()["error"]["code"] == "cannot_remove_self"

    removed = client.delete(f"/admin/admins/{user.id}", headers=admin.headers)
    assert user.id not in {item["telegram_id"] for item in removed.json()["admins"]}
    assert client.get("/admin/admins", headers=user.headers).status_code == 403


# --------------------------------------------------------------------------- #
#  Рассылки
# --------------------------------------------------------------------------- #


def test_text_broadcast_is_queued_and_copied_to_author(
    client: TestClient, user: AuthUser, admin: AuthUser, telegram: FakeTelegram
) -> None:
    _open_app(client, user)
    segments = client.get("/admin/broadcasts/segments", headers=admin.headers).json()["segments"]
    assert [segment["key"] for segment in segments] == list(BROADCAST_SEGMENTS)
    everyone = next(segment["recipients"] for segment in segments if segment["key"] == "all")

    response = client.post(
        "/admin/broadcasts", data={"segment": "all", "text": "Новости"}, headers=admin.headers
    )
    assert response.status_code == 201, response.text
    broadcast = response.json()["broadcast"]
    assert (broadcast["status"], broadcast["total"], broadcast["sent"]) == ("pending", everyone, 0)
    assert (telegram.sent[-1].chat_id, telegram.sent[-1].text) == (admin.id, "Новости")

    status = client.get(f"/admin/broadcasts/{broadcast['id']}", headers=admin.headers).json()
    assert status["broadcast"]["id"] == broadcast["id"]

    for data, code in (
        ({"segment": "vip", "text": "x"}, "invalid_segment"),
        ({"segment": "all", "text": " "}, "invalid_message"),
    ):
        invalid = client.post("/admin/broadcasts", data=data, headers=admin.headers)
        assert invalid.status_code == 422
        assert invalid.json()["error"]["code"] == code


def test_photo_broadcast_uploads_file_once(
    client: TestClient, user: AuthUser, admin: AuthUser, telegram: FakeTelegram
) -> None:
    _open_app(client, user)
    photo = b"\xff\xd8" + b"0" * 200_000  # больше общего предела тела запроса (64 КБ)
    response = client.post(
        "/admin/broadcasts",
        data={"segment": "all", "text": ""},
        files={"media": ("photo.jpg", photo, "image/jpeg")},
        headers=admin.headers,
    )
    assert response.status_code == 201, response.text
    copy = telegram.sent[-1]
    assert (copy.kind, copy.chat_id, copy.text, copy.media) == ("photo", admin.id, None, photo)

    wrong = client.post(
        "/admin/broadcasts",
        data={"segment": "all", "text": "x"},
        files={"media": ("doc.pdf", b"%PDF", "application/pdf")},
        headers=admin.headers,
    )
    assert wrong.status_code == 422
    assert wrong.json()["error"]["code"] == "invalid_media"


# --------------------------------------------------------------------------- #
#  Аналитика
# --------------------------------------------------------------------------- #


def test_analytics(client: TestClient, user: AuthUser, admin: AuthUser) -> None:
    habit = client.post(
        "/tasks", json={"name": "Бег", "frequency_type": "daily"}, headers=user.headers
    ).json()["habit"]
    client.post(f"/tasks/{habit['id']}/toggle", headers=user.headers)

    data = client.get("/admin/analytics", params={"days": 7}, headers=admin.headers).json()
    assert data["period_days"] == 7
    assert len(data["days"]) == 7
    today = data["days"][-1]
    assert today["completed"] >= 1
    assert today["scheduled"] >= today["completed"]
    assert today["active_users"] >= 2  # пользователь и администратор
    assert today["total_users"] == data["users"]["total"]
    assert data["activity"]["dau"] == today["active_users"]
    assert data["users"]["active_now"] >= 2
    assert sum(data["audience"].values()) == data["users"]["total"]
    assert [bucket["habits"] for bucket in data["habits"]["distribution"]] == [0, 1, 2, 3, 4, 5]
    assert data["habits"]["distribution"][-1]["open_ended"] is True
    assert 0 < data["completion_rate"] <= 1

    invalid = client.get("/admin/analytics", params={"days": 12}, headers=admin.headers)
    assert invalid.json()["error"]["code"] == "invalid_period"
