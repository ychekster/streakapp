# StreakApp

Трекер привычек: пользователь создаёт привычки, отмечает выполнение и следит за
прогрессом на сетке. Одно и то же приложение работает в двух видах:

- **Telegram Mini App** — открывается из бота [@onStreakBot](https://t.me/onStreakBot);
- **веб-приложение (PWA)** — ставится на рабочий стол телефона со страницы установки,
  работает без Telegram (гостевой аккаунт, вход через Telegram, push-напоминания).

Бот приветствует пользователя, открывает приложение, присылает напоминания и рассылки.
Для администраторов в приложении есть админ-панель (аналитика, пользователи, отзывы,
рассылки).

## Из чего состоит

| Часть | Папка | Что делает | Документация |
|---|---|---|---|
| API | `backend/` | FastAPI: привычки, настройки, отзывы, админ-панель, аккаунты веб-приложения; **владеет базой** (модели, репозиторий) | [docs/BACKEND.md](docs/BACKEND.md) |
| Фронтенд | `frontend/` | React + TypeScript + Vite: одна сборка для Mini App, веб-приложения и страницы установки | [docs/FRONTEND.md](docs/FRONTEND.md) |
| Бот | `bot/` | aiogram: `/start`, напоминания (Telegram или push), рассылки, вход в веб-приложение через Telegram | [docs/BOT.md](docs/BOT.md) |
| Миграции | `alembic/` | Схема базы (alembic) | [docs/BACKEND.md](docs/BACKEND.md#миграции) |

API и бот — два процесса с общим `.env` и общей базой; бот работает с базой через слой
данных `backend/`. Почему всё устроено так — [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Структура

```
streakapp/
├── backend/              # API-сервер и слой данных (models, repository, services)
│   ├── routers/          # HTTP-эндпоинты
│   └── data/             # справочник городов (cities.tsv.gz)
├── frontend/             # клиент: Mini App + веб-приложение + страница установки
│   ├── public/           # иконки приложения
│   └── src/              # см. docs/FRONTEND.md («Структура src/»)
├── bot/                  # Telegram-бот
│   └── handlers/         # /start, вход через Telegram, блокировка бота
├── alembic/              # миграции схемы БД
├── scripts/              # служебные скрипты: копия базы, воронка, ключи push, города
├── tests/                # pytest: API, админ-панель, авторизация, напоминания, веб-приложение
├── docs/                 # документация (см. ниже)
├── .env.example          # шаблон общего .env (бот + API)
├── requirements.txt      # зависимости бота
├── requirements-dev.txt  # всё для разработки и тестов
└── CLAUDE.md             # краткая карта проекта для Claude Code
```

Не в git (создаются локально): `.env`, `streakbot.db*` (база SQLite), `backups/`
(копии базы), `logs/`, `venv/`, `frontend/node_modules/`, `frontend/dist/`,
`frontend/.env`, `frontend/.env.production`.

## Локальный запуск

Все команды — из корня репозитория (относительный путь SQLite в `DATABASE_URL`
считается от рабочей директории). На Windows вместо `python` — `venv\Scripts\python`.

```bash
python -m venv venv
pip install -r requirements-dev.txt      # бот + API + тесты
cp .env.example .env                     # заполнить BOT_TOKEN и TMA_URL
python -m alembic upgrade head           # миграции базы

python -m backend.main                   # API на 127.0.0.1:8000
python -m bot.main                       # бот (в отдельном терминале)

cd frontend && npm install
cp .env.example .env                     # VITE_API_BASE_URL=/api
npm run build && npm run preview         # сборка и раздача на :4173
```

Telegram открывает Mini App только по HTTPS, поэтому локально фронтенд публикуется
туннелем (`cloudflared tunnel --url http://127.0.0.1:4173`), а адрес туннеля
записывается в `TMA_URL` (и бот перезапускается). Vite проксирует `/api` в API, так что
туннеля хватает одного.

## Тесты

```bash
python -m pytest                 # бэкенд и бот (временная база, настоящий .env не трогают)
cd frontend && npm test          # vitest
cd frontend && npm run typecheck # проверка типов
```

## Документация

| Документ | О чём |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Компоненты, поток данных, ключевые решения и их причины |
| [docs/BACKEND.md](docs/BACKEND.md) | API: как работает, эндпоинты, миграции, переменные окружения |
| [docs/FRONTEND.md](docs/FRONTEND.md) | Фронтенд: режимы запуска, структура, экраны, админ-панель, Android |
| [docs/BOT.md](docs/BOT.md) | Бот: приветствие, напоминания, рассылки, анимированные эмодзи |
| [docs/WEB_APP_SETUP.md](docs/WEB_APP_SETUP.md) | Что настроить руками для веб-приложения (секрет, VAPID, домен) |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Сервер: nginx, HTTPS, systemd, резервные копии, обновление |
| [docs/SCALING.md](docs/SCALING.md) | Переход с SQLite на PostgreSQL |

## Резервная копия базы

База SQLite работает в режиме WAL, поэтому копировать `streakbot.db` при запущенных API
и боте нельзя. Копию снимает скрипт (backup API SQLite, согласованный снимок):

```bash
python scripts/backup_db.py      # → backups/streakbot_backup_<дата-время>.db
```
