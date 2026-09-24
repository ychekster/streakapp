"""ASGI-middleware API: предел размера тела запроса, заголовки ответа и учёт медленных
запросов.

Чистые ASGI-классы (без BaseHTTPMiddleware): не буферизуют ответ и не мешают
обработке исключений.
"""

from __future__ import annotations

import time
from collections.abc import Mapping

from loguru import logger
from starlette.datastructures import MutableHeaders
from starlette.exceptions import HTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from tma.backend.errors import error_response

# Заголовки каждого ответа API: ответы — данные конкретного пользователя, их не должны
# сохранять ни браузер, ни промежуточные прокси; тип содержимого не угадывается.
_RESPONSE_HEADERS = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
}


# Заявленное слишком большое тело не длиннее этого вычитывается (и выбрасывается) перед
# ответом 413: если ответить, не дочитав, сервер закроет соединение посреди загрузки, и
# прокси перед API (nginx, vite, туннель) вернёт клиенту не 413, а свою ошибку
# соединения. Тело больше — соединение просто обрывается.
_DRAIN_LIMIT_BYTES = 1024 * 1024


async def _drain(receive: Receive) -> None:
    """Дочитать тело запроса, ничего не сохраняя."""
    while True:
        message = await receive()
        if message["type"] != "http.request" or not message.get("more_body", False):
            return


class BodySizeLimitMiddleware:
    """Отвергнуть (413) тело запроса больше `max_bytes`, не читая его в память целиком.

    Заявленный размер (Content-Length) проверяется сразу; тело без него (chunked)
    считается по мере чтения. Так POST на гигабайт не разворачивается в памяти ещё до
    проверки авторизации (FastAPI читает тело раньше зависимостей).

    `path_limits` — свой предел для отдельных путей (загрузка медиа рассылки).
    """

    def __init__(
        self, app: ASGIApp, max_bytes: int, path_limits: Mapping[str, int] | None = None
    ) -> None:
        self.app = app
        self.max_bytes = max_bytes
        self.path_limits = dict(path_limits or {})

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        max_bytes = self.path_limits.get(scope["path"], self.max_bytes)
        declared = dict(scope["headers"]).get(b"content-length")
        if declared is not None and (not declared.isdigit() or int(declared) > max_bytes):
            if declared.isdigit() and int(declared) <= _DRAIN_LIMIT_BYTES:
                await _drain(receive)
            response = error_response(413, "payload_too_large", "Слишком большой запрос")
            await response(scope, receive, send)
            return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > max_bytes:
                    # FastAPI пробрасывает HTTPException из чтения тела как есть; её
                    # обработчик (errors.py) отвечает 413 в едином формате.
                    raise HTTPException(status_code=413)
            return message

        await self.app(scope, limited_receive, send)


class ResponseMetaMiddleware:
    """Добавить заголовки `_RESPONSE_HEADERS` к ответу и записать в лог медленный запрос
    (дольше `slow_seconds`): метод, путь, статус и длительность."""

    def __init__(self, app: ASGIApp, slow_seconds: float) -> None:
        self.app = app
        self.slow_seconds = slow_seconds

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        started = time.perf_counter()
        status = 500

        async def send_with_headers(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                headers = MutableHeaders(scope=message)
                for name, value in _RESPONSE_HEADERS.items():
                    headers.setdefault(name, value)
            await send(message)

        try:
            await self.app(scope, receive, send_with_headers)
        finally:
            elapsed = time.perf_counter() - started
            if elapsed >= self.slow_seconds:
                logger.warning(
                    "Slow request: {} {} -> {} in {:.2f}s",
                    scope["method"],
                    scope["path"],
                    status,
                    elapsed,
                )
