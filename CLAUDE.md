# Knot — guide for Claude

Habit tracker. One React frontend runs as a **Telegram Mini App** and as an installable
**web app (PWA)**; a FastAPI backend owns the database; an aiogram bot greets users,
sends reminders and broadcasts. Docs and UI copy are Russian (UI also English); the user
writes in Russian — answer in Russian.

## Layout

```
backend/            FastAPI app + the data layer for everything (bot imports it too)
  main.py           app factory, routers, /health; run: python -m backend.main
  config.py         Settings from the root .env (pydantic-settings)
  models.py         SQLAlchemy models (all tables)      repository.py  ALL DB access
  services.py       habits, streaks, toggle, settings, due reminders
  schemas.py        API contract (mirrored by frontend/src/types/*)
  dependencies.py   auth (tma initData | Bearer web session), DB session, current user
  routers/          sync (the app's changes, batched), tasks, settings, meta, reviews, admin,
                    auth (web logins), web (push, events)
  accounts.py webauth.py webpush.py funnel.py   web app: accounts/sessions, Telegram login, push, funnel
  admin.py audience.py messaging.py   admin panel logic, bot messages from the API
  analytics/        admin analytics: data.py (terms, dataset), report.py (sections),
                    people.py (people behind a number), profile.py; sources.py, clock.py (Almaty days)
  validation.py schedule.py timezones.py cities.py constants.py errors.py middleware.py ratelimit.py
bot/                main.py (entry), reminders.py, broadcasts.py, pacing.py, constants.py (texts, emoji ids)
  handlers/         start.py (/start), web_login.py (/start login_<code>), membership.py
frontend/           React + TS + Vite; vite-plugin-pwa (src/sw.ts)
  src/main.tsx      picks the mode: Telegram → App | installed PWA → App | else → landing/
  src/App.tsx       app shell: tabs, screen stack, BackButton/MainButton, admin mode (lazy)
  src/screens/      app screens          src/components/  shared UI (ListItem, Section, Screen…)
  src/data/         habits + settings kept on the device: change queue → POST /sync
                    (store.ts), what the screen shows (derive.ts — mirrors services.py)
  src/admin/        admin panel: AdminApp, screens/, components/ (charts, filters), adminStrings
  src/web/          PWA only: session, login, push, analytics, WebChrome
  src/landing/      install page (config.ts: steps, in-app browsers)
  src/api/ types/   HTTP client + typed requests per API section; types mirror backend schemas
  src/telegram/webapp.ts  window.Telegram.WebApp wrapper
  src/platform.ts   the ONLY place that decides telegram vs web / installed / device
  src/strings.ts    all app copy, ru + en          src/styles/variables.css  design tokens, dark theme
alembic/versions/   migrations <date>_<NNNN>_<slug>.py (latest: 0014)
scripts/            backup_db.py, funnel.py, generate_vapid_keys.py, build_cities.py,
                    seed_analytics.py (fake users for the local admin panel; --remove)
tests/              pytest (conftest: temp DB + fake bot token; fake_telegram.py, helpers.py)
docs/               ARCHITECTURE, BACKEND (endpoints, env, migrations), FRONTEND (screens,
                    src/ map, Android), BOT, WEB_APP_SETUP, DEPLOYMENT, SCALING
```

`TMA_*` env names (`TMA_URL`, `TMA_HOST`…) and the `Authorization: tma <initData>` scheme
are historical names — keep them; renaming breaks the server `.env` and clients.

## Hard rules

- **Mini App and web app are one app, two equal versions.** By default every change
  (settings, screens, features, habit form…) goes into **both** and must match pixel for
  pixel (sizes, colours, spacing). Only when the user explicitly says "only in the web
  app" / "only in Telegram" is a single version changed — the other must stay completely
  untouched. Branch on `usePlatform()` / `appPlatform()` from `platform.ts`, never on
  `window.Telegram` directly.
- **Two bots.** Test bot @botishnabot runs locally from this repo; production
  @onStreakBot (https://tma.streakapp.io) is updated **only on the user's explicit
  command**. Never deploy, push or commit unless asked. Commit messages: English,
  imperative, describe the user-visible change.
- **DB access only through `Repository`.** No SQL in routers/services/bot. Commit the
  session before any network call (Telegram, push) — see `Repository.commit()` uses.
- **Schema change = migration.** New column/table → `models.py` + new alembic revision
  (next number) + a line in docs/BACKEND.md «Миграции». API `create_all` does not alter
  existing tables.
- **API contract changes** touch `backend/schemas.py` and `frontend/src/types/*` (+
  `frontend/src/api/*`). The app reads and writes habits/settings only through
  `POST /sync` (`src/data/store.ts`); a new habit field or setting also needs
  `data/derive.ts` (how it looks before the server answers). Errors are `{"error": {"code", "message"}}`; the frontend shows
  text by `code` (`errors.ts`), not the server message.
- **UI copy** goes to `strings.ts` (admin: `admin/adminStrings.ts`) in **both** ru and en.
- **Constants shared by both sides** must match: `HISTORY_DAYS`, weekdays, habit colors,
  `MAX_HABITS_PER_USER`, `SYNC_BATCH_SIZE` ≤ `SYNC_MAX_OPS`, `AUDIENCE_FILTERS` (backend/constants.py ↔ frontend/src/constants.ts; audience SQL in
  `repository._audience_condition`).
- Run everything from the repo root (SQLite path in `DATABASE_URL` is relative).
- Match surrounding code: comment density, naming; older modules are commented in
  Russian, newer (PWA) ones in English — follow the file you are in.

## Commands (Windows, Git Bash)

Bare `python` hangs (Store alias) — always `venv/Scripts/python.exe`. `alembic.exe` is
silent/broken — use `python -m alembic`.

```bash
venv/Scripts/python.exe -m pytest -q                 # backend + bot tests (~10 s)
venv/Scripts/python.exe -m alembic upgrade head      # migrate local streakbot.db
venv/Scripts/python.exe scripts/backup_db.py         # → backups/ (do before migrations)
cd frontend && npm run typecheck && npm test         # tsc (app + sw) and vitest
cd frontend && npm run build                         # typecheck + vite build → dist/
```

## Local stack (what the user tests on)

Four processes from the repo root: API `venv/Scripts/python.exe -m backend.main`
(127.0.0.1:8000), bot `venv/Scripts/python.exe -m bot.main`, `npx vite preview --port
4173 --strictPort` in `frontend/` (serves `dist/`, proxies `/api` → 8000), and
`cloudflared tunnel --url http://127.0.0.1:4173`. `TMA_URL` in `.env` = the tunnel URL;
a new tunnel URL → update `.env` → restart the bot. After frontend changes: `npm run
build` (preview serves the build). After backend/bot changes: restart that process.
Logs: `logs/`. Health: `curl http://127.0.0.1:8000/health`.

## Where to look

| Task | Files |
|---|---|
| Habit fields / frequency / streaks | models.Task, schemas.Habit*, services.py, schedule.py, validation.py; frontend types/habit.ts, data/derive.ts, screens/HabitFormScreen.tsx |
| Offline / sync | routers/sync.py, services.apply_sync; frontend src/data/, api/sync.ts, sw.ts, web/bootstrap.ts |
| Settings item | models.User, schemas.Settings*, services.py; screens/SettingsScreen.tsx, hooks/useSettings.ts |
| Reminders | services.due_reminders / due_checkin_reminders, bot/reminders.py (Telegram or push) |
| Admin panel | backend/admin.py, analytics/, routers/admin.py; frontend/src/admin/ (analytics/, analyticsCopy.ts), api/admin.ts, types/admin.ts |
| Web app login / accounts | backend/accounts.py, routers/auth.py, bot/handlers/web_login.py; frontend/src/web/ |
| Push | backend/webpush.py, routers/web.py, bot/reminders.py; frontend/src/web/push.ts, src/sw.ts |
| Install page / funnel | frontend/src/landing/, src/web/analytics.ts; backend/funnel.py, scripts/funnel.py |
| Bot texts / emoji | bot/constants.py, bot/emoji.py |
| Theme / tokens / Android tweaks | frontend/src/styles/variables.css (end of file: `data-platform`) |

## Verifying a change

Backend/bot: `pytest` must stay green (add tests next to similar ones in `tests/`).
Frontend: `npm run typecheck`, `npm test`, `npm run build`. For a pure refactor, a
production build byte-identical to the previous one proves nothing changed for users.
Then restart the local stack so the user can check in Telegram (@botishnabot) and in
the installed web app.

## Deploy (only when the user says so)

docs/DEPLOYMENT.md §11: backup → `git pull` → pip install → `alembic upgrade head` →
`npm ci && npm run build` in `frontend/` → restart `streakbot-api` and `streakbot-bot`.
Check the server's real state first and stop to report if it differs from the docs. The
one-time move from `tma/` to `backend/` + `frontend/` needs systemd and nginx path
edits — see the last section of DEPLOYMENT.md.
