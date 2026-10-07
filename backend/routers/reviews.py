"""Эндпоинты отзывов пользователя.

    GET  /reviews — история своих отзывов с ответами администратора (новые сначала)
    POST /reviews — оставить отзыв (настройки → «Написать отзыв»); он появится в
                    разделе отзывов админ-панели

Доступ к данным — только через репозиторий.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.dependencies import RepositoryDep, get_db_user
from backend.models import User
from backend.repository import Repository
from backend.schemas import ReviewCreate, ReviewsResponse, UserReview
from backend.services import create_review, list_user_reviews

router = APIRouter(prefix="/reviews", tags=["reviews"])


@router.get("", response_model=ReviewsResponse)
async def get_reviews(
    db_user: User = Depends(get_db_user),
    repo: Repository = RepositoryDep,
) -> ReviewsResponse:
    """Отзывы пользователя и ответы на них, новые сначала."""
    return await list_user_reviews(repo, db_user)


@router.post("", response_model=UserReview, status_code=201)
async def post_review(
    payload: ReviewCreate,
    db_user: User = Depends(get_db_user),
    repo: Repository = RepositoryDep,
) -> UserReview:
    """Сохранить отзыв (не больше MAX_REVIEWS_PER_DAY за сутки)."""
    return await create_review(repo, db_user, payload)
