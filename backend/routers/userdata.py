"""«Экспорт данных» / «Импорт данных» (настройки, backend/userdata.py).

    GET  /export          — всё о пользователе одним JSON-файлом (schemas.DataExport)
    POST /export/telegram — тот же файл присылает бот в чат пользователя (в Telegram, где
                            нет системного окна «Поделиться»)
    POST /import          — добавить привычки и папки из такого файла, взять настройки
"""

from __future__ import annotations

from fastapi import APIRouter, Body, Depends, Request, Response

from backend import userdata
from backend.constants import IMPORT_PATH
from backend.dependencies import RepositoryDep, get_bot, get_db_user
from backend.errors import ApiError
from backend.messaging import send_document
from backend.models import User
from backend.repository import Repository
from backend.routers.auth import limit
from backend.schemas import DataExport, ImportResult
from backend.services import user_today

router = APIRouter(tags=["userdata"])


@router.get("/export", response_model=DataExport)
async def export_data(
    db_user: User = Depends(get_db_user),
    repo: Repository = RepositoryDep,
) -> Response:
    """Файл экспорта (с заголовком «скачать как файл»)."""
    data = await userdata.build_export(repo, db_user)
    name = userdata.file_name(user_today(db_user))
    return Response(
        content=data.model_dump_json(indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.post("/export/telegram", status_code=204, response_class=Response)
async def send_export(
    request: Request,
    db_user: User = Depends(get_db_user),
    repo: Repository = RepositoryDep,
) -> Response:
    """Прислать файл экспорта в чат пользователя с ботом."""
    limit(request, request.app.state.user_data_limiter, str(db_user.telegram_id))
    data = await userdata.build_export(repo, db_user)
    content = data.model_dump_json(indent=2).encode("utf-8")
    name, chat_id, text = (
        userdata.file_name(user_today(db_user)),
        db_user.telegram_id,
        userdata.caption(db_user),
    )
    # Сети — только после commit (см. Repository.commit).
    await repo.commit()
    if await send_document(get_bot(request), chat_id, name, content, text) is not None:
        raise ApiError(409, "export_chat_unavailable", "Запустите бота: файл придёт в чат с ним")
    return Response(status_code=204)


@router.post(IMPORT_PATH, response_model=ImportResult)
async def import_data(
    request: Request,
    body: object = Body(...),
    db_user: User = Depends(get_db_user),
    repo: Repository = RepositoryDep,
) -> ImportResult:
    """Импорт файла экспорта: всё или ничего (ошибка откатывает весь запрос)."""
    limit(request, request.app.state.user_data_limiter, str(db_user.telegram_id))
    return await userdata.import_data(repo, db_user, userdata.parse_import(body))
