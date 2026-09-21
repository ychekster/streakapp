# Переход с SQLite на PostgreSQL

Благодаря SQLAlchemy и async-драйверам смена СУБД не требует изменений в коде —
только конфигурации и зависимостей. С базой данных работает только API-сервер
(`tma/backend`); бот к ней не обращается.

## Шаги

1. **Изменить `DATABASE_URL`** в `.env`:
   ```
   DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/streakbot
   ```

2. **Добавить драйвер** в `tma/backend/requirements.txt` и установить:
   ```
   asyncpg>=0.29.0
   ```
   ```bash
   pip install -r tma/backend/requirements.txt
   ```

3. **Создать базу данных** в PostgreSQL:
   ```sql
   CREATE DATABASE streakbot;
   ```

4. **Применить миграции** (из корня репозитория):
   ```bash
   alembic upgrade head
   ```

5. **Запустить API**:
   ```bash
   python -m tma.backend.main
   ```

Больше ничего менять не нужно — SQLAlchemy абстрагирует диалект СУБД, а весь
доступ к данным идёт через `Repository`.

## Замечания

- Тип `BigInteger` для `telegram_id` корректно отображается и в SQLite, и в
  PostgreSQL.
- Enum'ы хранятся как `VARCHAR` (`native_enum=False`), что переносимо между
  диалектами.
- API не хранит состояния в памяти процесса, поэтому его можно запускать в
  несколько воркеров (`uvicorn --workers N`) поверх PostgreSQL.
