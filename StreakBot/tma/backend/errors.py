"""Единый формат ошибок API и его обработчики.

Все ошибки уходят клиенту в одинаковой форме:

    {"error": {"code": "<машинный_код>", "message": "<человекочитаемо>"}}

с осмысленным HTTP-статусом. Фронтенду достаточно прочитать `error.message` для
показа и `error.code` для логики, не разбирая разные форматы ответов.
"""

from __future__ import annotations

from collections.abc import Mapping

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from loguru import logger
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    """Прикладная ошибка с HTTP-статусом, машинным кодом и текстом для пользователя."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.headers = headers


# Ошибки маршрутизации и протокола (неизвестный путь, не тот метод, слишком большое
# тело) поднимает сам Starlette — им нужны машинные коды в том же формате.
_HTTP_ERROR_CODES: dict[int, tuple[str, str]] = {
    404: ("not_found", "Не найдено"),
    405: ("method_not_allowed", "Метод не поддерживается"),
    413: ("payload_too_large", "Слишком большой запрос"),
}


def error_response(
    status_code: int,
    code: str,
    message: str,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    """Собрать JSON-ответ в едином формате ошибки."""
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message}},
        headers=headers,
    )


def register_error_handlers(app: FastAPI) -> None:
    """Подключить обработчики, приводящие любые ошибки к единому формату."""

    @app.exception_handler(ApiError)
    async def _on_api_error(_: Request, exc: ApiError) -> JSONResponse:
        return error_response(exc.status_code, exc.code, exc.message, exc.headers)

    @app.exception_handler(StarletteHTTPException)
    async def _on_http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code, message = _HTTP_ERROR_CODES.get(exc.status_code, ("http_error", str(exc.detail)))
        return error_response(exc.status_code, code, message, exc.headers)

    @app.exception_handler(RequestValidationError)
    async def _on_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Невалидные параметры запроса — 422 с компактным описанием первой проблемы.
        first = exc.errors()[0] if exc.errors() else {}
        message = first.get("msg", "Некорректные параметры запроса")
        return error_response(422, "validation_error", message)

    @app.exception_handler(Exception)
    async def _on_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        # Непредвиденная ошибка: логируем со стеком, наружу — обезличенное сообщение.
        logger.opt(exception=exc).error(
            "Unhandled error while processing {} {}: {}",
            request.method,
            request.url.path,
            exc,
        )
        return error_response(500, "internal_error", "Внутренняя ошибка сервера")
