# Веб-приложение (PWA): что настроить руками

StreakApp теперь работает не только в Telegram, но и как приложение на рабочем столе
телефона. Код уже готов; здесь — то, что нужно создать или вписать руками. Всё бесплатно.

Все значения вписываются в файл `.env` в корне проекта (образец — `.env.example`).
После изменения `.env` перезапустите API и бота.

> **Адрес сайта.** Google и Telegram проверяют, что вход идёт с «своего» адреса. Адрес
> локального туннеля `*.trycloudflare.com` меняется при каждом перезапуске — тогда шаги 3 и
> 4 придётся повторять. Если хотите постоянный адрес и для теста — см. раздел «Постоянный
> адрес туннеля» в конце.

---

## 1. Секрет для входа (обязательно на сервере)

Им защищаются сессии веб-приложения и одноразовые ссылки входа. Локально можно не задавать
(тогда он выводится из токена бота), на сервере — задайте свой.

1. Выполните в папке проекта:
   ```
   venv\Scripts\python -c "import secrets; print(secrets.token_urlsafe(48))"
   ```
2. Впишите результат в `.env`: `WEB_AUTH_SECRET=...`

Не меняйте его потом: смена секрета разлогинит всех пользователей веб-приложения.

## 2. Ключи для уведомлений (VAPID)

Без них напоминания по-прежнему приходят только через бота.

1. Выполните один раз:
   ```
   venv\Scripts\python scripts\generate_vapid_keys.py
   ```
2. Скопируйте обе строки (`VAPID_PUBLIC_KEY=...` и `VAPID_PRIVATE_KEY=...`) в `.env`.
3. Впишите свою почту: `VAPID_SUBJECT=mailto:ваша@почта`.

Ключи создаются **один раз** и переносятся на сервер как есть. Новые ключи отключат все
уже выданные разрешения на уведомления.

## 3. Вход через Google

1. Откройте https://console.cloud.google.com и войдите своим Google-аккаунтом.
2. Сверху — «Select a project» → **New project** → имя `StreakApp` → **Create**.
3. Меню слева → **APIs & Services** → **OAuth consent screen** (в новой консоли —
   **Google Auth Platform** → **Branding**):
   - App name: `StreakApp`, User support email: ваша почта;
   - Audience: **External**;
   - Contact information: ваша почта → **Create**.
   - Пока приложение в режиме «Testing», войти могут только тестовые пользователи:
     **Audience** → **Test users** → **Add users** → впишите свои адреса. Чтобы входили
     все — **Publish app** (для входа только по имени и почте проверка Google не нужна).
4. **Clients** (или **Credentials** → **Create credentials**) → **OAuth client ID**:
   - Application type: **Web application**, Name: `StreakApp web`;
   - **Authorized JavaScript origins** → Add URI: адрес сайта без пути, например
     `https://tma.streakapp.io` (и для теста — адрес туннеля, например
     `https://abc-def.trycloudflare.com`);
   - **Authorized redirect URIs** → Add URI: тот же адрес + `/api/auth/google/callback`,
     например `https://tma.streakapp.io/api/auth/google/callback` (и для туннеля
     `https://abc-def.trycloudflare.com/api/auth/google/callback`);
   - **Create**.
5. Скопируйте **Client ID** и **Client secret** в `.env`:
   ```
   GOOGLE_CLIENT_ID=....apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=...
   ```
6. `PUBLIC_BASE_URL` в `.env` должен совпадать с адресом из шага 4 (без `/` в конце).

Без `GOOGLE_CLIENT_ID` строка Google в «Аккаунте» просто не показывается.

## 4. Вход через Telegram на сайте

Работает **сразу, без настройки**: кнопка «Привязать» у Telegram открывает бота, человек
нажимает «Подтвердить вход» — и приложение само подхватывает вход.

Дополнительно есть официальный вход через сайт Telegram («Войти через сайт Telegram»). Он
работает, только если у бота указан домен:

1. В Telegram откройте @BotFather → `/setdomain` → выберите **тестового бота** (Botishna,
   @botishnabot) → отправьте адрес туннеля, например `abc-def.trycloudflare.com`.
2. Для боевого бота @onStreakBot — то же самое, но **только при выкладке на сервер** и с
   доменом сервера (`tma.streakapp.io`). Локально боевого бота не трогайте.

## 5. Ссылка «Открыть в Telegram» на странице установки

Задаётся при сборке фронтенда: в `tma/frontend/.env` (локально) и
`tma/frontend/.env.production` (сервер) впишите
`VITE_TELEGRAM_BOT_URL=https://t.me/onStreakBot` (для теста — `https://t.me/botishnabot`).

## 6. Видео-инструкция для iPhone

На экране установки для iPhone есть место под короткое зацикленное видео (сейчас там
заглушка). Запишите экран iPhone: Safari → «Поделиться» → «На экран „Домой“» → «Добавить»,
сохраните как `tma/frontend/public/install-ios.mp4` и в
`tma/frontend/src/landing/config.ts` замените `video: null` на
`video: "/install-ios.mp4"`. Там же — тексты шагов, если на новой iOS кнопки называются
иначе, и список встроенных браузеров (Threads, Instagram…).

---

## Ссылки для проверки

| Что | Адрес |
|---|---|
| Страница для всех (ставится в профиль Threads) | `https://<адрес>/?src=threads` |
| Сразу экран установки | `https://<адрес>/install` |
| Само приложение (как с рабочего стола) | `https://<адрес>/app?pwa=1` |
| Воронка | бот → «Открыть приложение» → Настройки → Админ-панель → Аналитика → «Веб-приложение», или `venv\Scripts\python scripts\funnel.py` |

Обычная вкладка браузера по адресу `/app` (без установки) показывает страницу установки —
так и задумано: приложение работает только с рабочего стола или в Telegram.

## Выкладка на сервер (когда решите)

Порядок — как обычно (docs/DEPLOYMENT.md §11): копия базы → `git pull` →
`pip install -r requirements.txt -r tma/backend/requirements.txt` (добавился `pywebpush`) →
`python -m alembic upgrade head` (миграция `0010`: новые таблицы, существующие данные не
меняются) → `npm ci && npm run build` → перезапуск API и бота. До этого впишите в `.env`
сервера переменные из шагов 1–3 (`PUBLIC_BASE_URL=https://tma.streakapp.io`).

nginx менять не нужно: он уже отдаёт `index.html` для любых путей (`/install`, `/app`).
Файлы `sw.js` и `manifest.webmanifest` лежат в корне сборки — их не надо кешировать надолго
(в текущем конфиге долгий кеш только у `/assets/`, так что всё в порядке).

## Постоянный адрес туннеля (по желанию)

Быстрый туннель (`cloudflared tunnel --url ...`) каждый раз даёт новый адрес. Бесплатный
постоянный вариант — «именованный» туннель Cloudflare на своём домене (например,
`dev.streakapp.io`), если домен обслуживается в Cloudflare:
`cloudflared tunnel login` → `cloudflared tunnel create streak-dev` →
`cloudflared tunnel route dns streak-dev dev.streakapp.io` →
`cloudflared tunnel run --url http://127.0.0.1:4173 streak-dev`. Тогда шаги 3–4 делаются
один раз.
