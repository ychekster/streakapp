"""Резервная копия базы SQLite — безопасно и на работающих API и боте.

База работает в режиме WAL (tma/backend/database.py): свежие изменения какое-то время
лежат в `streakbot.db-wal`, поэтому простое копирование `streakbot.db` при запущенных
процессах может потерять их. Здесь копия снимается через backup API SQLite — это
согласованный снимок базы вместе с WAL.

Запуск из корня репозитория:

    python scripts/backup_db.py                  # → streakbot_backup_<дата-время>.db
    python scripts/backup_db.py --output path.db

Путь к базе — из DATABASE_URL (.env), как у API.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from contextlib import closing
from datetime import datetime
from pathlib import Path

from sqlalchemy.engine import make_url

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tma.backend.config import load_settings  # noqa: E402 — после настройки sys.path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--output", type=Path, help="файл копии (по умолчанию — рядом с базой)")
    args = parser.parse_args()

    url = make_url(load_settings().database_url)
    if url.get_backend_name() != "sqlite" or not url.database:
        sys.exit("DATABASE_URL is not a SQLite file — use your DBMS backup tools (pg_dump)")
    source = Path(url.database)
    if not source.exists():
        sys.exit(f"Database not found: {source}")
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    target = args.output or source.with_name(f"{source.stem}_backup_{stamp}{source.suffix}")

    # Обычное (не read-only) соединение: только такому SQLite разрешает прочитать WAL,
    # даже если служебного файла `-shm` ещё нет. Источник при этом не меняется.
    with closing(sqlite3.connect(source)) as src, closing(sqlite3.connect(target)) as dst:
        src.backup(dst)
    print(f"{source} -> {target}")


if __name__ == "__main__":
    main()
