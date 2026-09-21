# Переход с SQLite на PostgreSQL

Благодаря SQLAlchemy и async-драйверам смена СУБД не требует изменений в коде —
только конфигурации и зависимостей. Базу данных ведёт API-сервер (`tma/backend`);
бот только читает из неё напоминания — через тот же слой данных и тот же
`DATABASE_URL`, поэтому драйвер нужен и ему.

## Шаги

1. **Изменить `DATABASE_URL`** в `.env`:
   ```
   DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/streakbot
   ```

2. **Добавить драйвер** в `tma/backend/requirements.txt` и `requirements.txt`
   (бот) и установить:
   ```
   asyncpg>=0.29.0
   ```
   ```bash
   pip install -r tma/backend/requirements.txt -r requirements.txt
   ```

3. **Создать базу данных** в PostgreSQL:
   ```sql
   CREATE DATABASE streakbot;
   ```

4. **Применить миграции** (из корня репозитория):
   ```bash
   alembic upgrade head
   ```

5. **Запустить API и бота**:
   ```bash
   python -m tma.backend.main
   python -m bot.main
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
- Бот должен быть в одном экземпляре: его получает один long polling, и он же
  рассылает напоминания — второй экземпляр прислал бы их повторно.
- Напоминания каждую минуту перебирают все привычки с напоминанием. При большом
  числе пользователей стоит отбирать в запросе только привычки, чьё время в поясе
  владельца совпадает с текущей минутой.
