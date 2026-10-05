"""Эндпоинт отзывов пользователя.

    POST /reviews — оставить отзыв (настройки → «Написать отзыв»); он появится в
                    разделе отзывов админ-панели

Доступ к данным — только через репозиторий.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.dependencies import RepositoryDep, get_db_user
from backend.models import User
from backend.repository import Repository
from backend.schemas import ReviewCreate, ReviewCreated
from backend.services import create_review

router = APIRouter(prefix="/reviews", tags=["reviews"])


@router.post("", response_model=ReviewCreated, status_code=201)
async def post_review(
    payload: ReviewCreate,
    db_user: User = Depends(get_db_user),
    repo: Repository = RepositoryDep,
) -> ReviewCreated:
    """Сохранить отзыв (не больше MAX_REVIEWS_PER_DAY за сутки)."""
    return await create_review(repo, db_user, payload)
