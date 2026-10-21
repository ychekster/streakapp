"""Снимок участника групповой привычки за дни, когда он был в группе

- `habit_group_marks` — что вышедший участник сделал в дни закрытого периода (выполнил,
  сколько раз, был ли заморожен). Прошлое группы считается по нему и больше не меняется,
  когда кто-то уходит или правит привычку, оставшуюся у него обычной.

Существующим закрытым периодам снимок собирается из отметок и заморозок их привычек.

Revision ID: 0030
Revises: 0029
Create Date: 2026-10-21 18:00:00

"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0030"
down_revision: Union[str, None] = "0029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _day(value: object) -> date:
    return value if isinstance(value, date) else date.fromisoformat(str(value)[:10])


def upgrade() -> None:
    marks = op.create_table(
        "habit_group_marks",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "member_id", sa.Integer(), sa.ForeignKey("habit_group_members.id"), nullable=False
        ),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("done", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("units", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("frozen", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.UniqueConstraint("member_id", "day", name="uq_group_mark_day"),
    )
    op.create_index("ix_habit_group_marks_member_id", "habit_group_marks", ["member_id"])

    bind = op.get_bind()
    periods = bind.execute(
        sa.text(
            "SELECT p.member_id, p.start_on, p.end_on, m.task_id, t.frozen_since "
            "FROM habit_group_periods p "
            "JOIN habit_group_members m ON m.id = p.member_id "
            "JOIN tasks t ON t.id = m.task_id "
            "WHERE p.end_on IS NOT NULL"
        )
    ).fetchall()
    rows: list[dict[str, object]] = []
    for member_id, start_on, end_on, task_id, frozen_since in periods:
        start, end = _day(start_on), _day(end_on)
        done: set[date] = set()
        units: dict[date, int] = {}
        for day, status, count in bind.execute(
            sa.text(
                "SELECT scheduled_date, status, count FROM task_logs "
                "WHERE task_id = :task AND scheduled_date >= :start AND scheduled_date < :end"
            ),
            {"task": task_id, "start": start, "end": end},
        ):
            if status == "done":
                done.add(_day(day))
            elif count:
                units[_day(day)] = int(count)
        frozen_ranges = [
            (_day(first), _day(last))
            for first, last in bind.execute(
                sa.text("SELECT start_date, end_date FROM task_freezes WHERE task_id = :task"),
                {"task": task_id},
            )
        ]
        if frozen_since is not None:
            frozen_ranges.append((_day(frozen_since), end))
        day = start
        while day < end:
            frozen = any(first <= day < last for first, last in frozen_ranges)
            if day in done or day in units or frozen:
                rows.append(
                    {
                        "member_id": member_id,
                        "day": day,
                        "done": day in done,
                        "units": units.get(day, 0),
                        "frozen": frozen,
                    }
                )
            day += timedelta(days=1)
    if rows:
        op.bulk_insert(marks, rows)


def downgrade() -> None:
    op.drop_index("ix_habit_group_marks_member_id", table_name="habit_group_marks")
    op.drop_table("habit_group_marks")
