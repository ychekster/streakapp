# Развёртывание на сервере

Как поднять StreakBot на собственном домене: фронтенд и API за nginx с HTTPS, API и
бот — службами systemd. Все команды — для Ubuntu 22.04/24.04; на других системах
меняются только имена пакетов.

Проект состоит из трёх процессов:

| Процесс | Что делает | Как запускается |
|---|---|---|
| API (`tma/backend`) | Отвечает приложению, владеет базой | служба `streakbot-api`, слушает `127.0.0.1:8000` |
| Бот (`bot/`) | `/start`, напоминания, рассылки | служба `streakbot-bot`, long polling (входящих портов не нужно) |
| Фронтенд (`tma/frontend`) | Собранные статические файлы | раздаёт nginx из `dist/` |

Наружу смотрит только nginx (порты 80 и 443). API доступен снаружи по пути `/api/`
того же домена — иначе браузер считал бы это другим источником.

---

## 1. Что нужно заранее

- Сервер с публичным IP (хватит 1 vCPU / 1 ГБ RAM: база — файл SQLite, нагрузка —
  несколько запросов на открытие приложения).
- Домен и A-запись (и AAAA, если есть IPv6) на IP сервера. Дальше в примерах —
  `example.com`, замените на свой.
- Токен бота от [@BotFather](https://t.me/BotFather).
- Python 3.11 или новее (проект собран и протестирован на 3.13) и Node.js 20+ —
  только для сборки фронтенда.

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nginx git curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

## 2. Пользователь и код

Службы работают от отдельного пользователя без прав входа — не от `root`.

```bash
sudo adduser --system --group --home /opt/streakbot streakbot
sudo -u streakbot git clone <адрес репозитория> /opt/streakbot/app
cd /opt/streakbot/app                  # дальше всё выполняется отсюда
```

> Всё запускается **из корня проекта** (`/opt/streakbot/app`): относительный путь SQLite
> в `DATABASE_URL` отсчитывается от рабочей директории.

```bash
sudo -u streakbot python3 -m venv /opt/streakbot/venv
sudo -u streakbot /opt/streakbot/venv/bin/pip install -r requirements.txt -r tma/backend/requirements.txt
```

Чтобы обновления ставили ровно те версии, что проверены на сервере, снимите слепок
окружения и держите его рядом с кодом:

```bash
sudo -u streakbot /opt/streakbot/venv/bin/pip freeze > requirements.lock.txt
# на будущих развёртываниях: pip install -r requirements.lock.txt
```

## 3. Переменные окружения

`.env` содержит токен бота — он не должен быть доступен никому, кроме служб:

```bash
sudo -u streakbot cp .env.example .env
sudo -u streakbot nano .env
sudo chmod 600 .env                     # читает только пользователь streakbot
```

Продакшен-значения:

```dotenv
BOT_TOKEN=<токен от @BotFather>
TMA_URL=https://example.com

DATABASE_URL=sqlite+aiosqlite:///./streakbot.db

# API слушает только локальный интерфейс: снаружи к нему ходят через nginx.
TMA_HOST=127.0.0.1
TMA_PORT=8000

# Приложение живёт на своём домене — других источников быть не должно.
TMA_ALLOWED_ORIGINS=https://example.com

# Описание эндпоинтов не публикуем.
TMA_DOCS_ENABLED=false

TMA_LOG_LEVEL=INFO
TMA_LOG_FILE=logs/api.log
LOG_LEVEL=INFO
LOG_FILE=logs/bot.log
```

Остальные переменные (`TMA_AUTH_TTL_SECONDS`, `TMA_RATE_LIMIT_*`, `DB_POOL_SIZE`)
описаны в [../tma/README.md](../tma/README.md); значения по умолчанию рассчитаны на
продакшен, менять их не нужно.

## 4. База данных

> **Порядок важен.** Миграции применяются **до первого запуска API**. API при старте
> досоздаёт недостающие таблицы сам (`create_all`), и если он стартует первым на пустой
> базе, таблицы появятся без записи в `alembic_version` — `alembic upgrade head` после
> этого упадёт на попытке создать уже существующую таблицу. Если так вышло, пометьте
> схему текущей: `alembic stamp head`.

```bash
sudo -u streakbot /opt/streakbot/venv/bin/alembic upgrade head
```

Первым администратором станет Telegram-id из `SEED_ADMIN_IDS`
(`tma/backend/constants.py`) — он добавляется, только пока список администраторов пуст.
Если панель должна быть у другого аккаунта, поправьте константу **до** первого запуска;
дальше администраторов добавляют в самой панели.

## 5. Сборка фронтенда

```bash
cd tma/frontend
sudo -u streakbot npm ci
sudo -u streakbot npm run build          # tsc --noEmit + vite build → dist/
cd ../..
```

`.env.production` уже задаёт `VITE_API_BASE_URL=/api`: фронтенд обращается к API по
относительному пути на том же домене, поэтому пересобирать его при смене домена не
нужно. Исходных карт в сборке нет — раздаётся только минифицированный код.

## 6. Службы systemd

`/etc/systemd/system/streakbot-api.service`:

```ini
[Unit]
Description=StreakBot API (Telegram Mini App)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=streakbot
Group=streakbot
WorkingDirectory=/opt/streakbot/app
ExecStart=/opt/streakbot/venv/bin/python -m tma.backend.main
Restart=always
RestartSec=5

# Процессу нужны только свои файлы.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/streakbot/app

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/streakbot-bot.service` — то же самое с другими
`Description` и `ExecStart=/opt/streakbot/venv/bin/python -m bot.main`.

> Бот должен работать **в одном экземпляре**: long polling получает один процесс, и он
> же рассылает напоминания — второй прислал бы их повторно. Поэтому `Restart=always`, но
> никаких `ExecStartPre` с фоновым запуском и никаких копий службы.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now streakbot-api streakbot-bot
systemctl status streakbot-api streakbot-bot
curl -s http://127.0.0.1:8000/health      # {"status":"ok"}
```

## 7. nginx и HTTPS

Сначала — HTTP-конфиг, чтобы certbot смог выписать сертификат.
`/etc/nginx/sites-available/streakbot`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name example.com;
    root /opt/streakbot/app/tma/frontend/dist;
    index index.html;

    # Рассылка может нести видео до 50 МБ: со значением по умолчанию (1 МБ) nginx
    # отверг бы её раньше, чем запрос дойдёт до API.
    client_max_body_size 51m;

    # Сжатие статики: JS-бандл 275 КБ → около 86 КБ по сети.
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    # Имена файлов сборки содержат хеш содержимого, поэтому их можно кешировать навсегда.
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # index.html кешировать нельзя: он ссылается на текущие имена файлов сборки.
    location = /index.html {
        add_header Cache-Control "no-cache";
    }

    # API: /api/tasks → http://127.0.0.1:8000/tasks (префикс срезается слешем в proxy_pass).
    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Видео рассылки API грузит в Telegram прямо в запросе — это дольше минуты
        # (таймаут по умолчанию), поэтому ждём столько же, сколько ждёт само приложение.
        proxy_read_timeout 310s;
        proxy_send_timeout 310s;
        proxy_request_buffering off;

        # Поток анонимных запросов не должен доходить до API: подпись он всё равно не
        # пройдёт, а лимит частоты в приложении считается уже по проверенному id.
        limit_req zone=api burst=40 nodelay;
        limit_req_status 429;
    }

    # Mini App — одностраничное приложение: неизвестный путь отдаёт index.html.
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Зона лимита объявляется один раз в `/etc/nginx/nginx.conf`, в блоке `http`:

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
```

```bash
sudo ln -s /etc/nginx/sites-available/streakbot /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Сертификат Let's Encrypt (certbot сам добавит блок `listen 443 ssl`, редирект с HTTP и
продление по таймеру):

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.com
```

После выпуска сертификата добавьте в тот же `server`-блок заголовки безопасности:

```nginx
add_header Strict-Transport-Security "max-age=31536000" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "no-referrer" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors https://web.telegram.org https://*.telegram.org" always;
```

> **Не ставьте `X-Frame-Options: DENY` и `frame-ancestors 'none'`.** Mini App в
> веб-версии Telegram открывается во фрейме на `web.telegram.org` — с запретом
> встраивания приложение там покажет пустой экран. `script-src` обязан разрешать
> `https://telegram.org`: оттуда грузится официальный SDK Telegram Web Apps.
>
> `add_header` в nginx не наследуется в `location`, где есть свои `add_header`, —
> перечисленные выше заголовки объявляйте в блоке `server`, а внутри `location /assets/`
> и `location = /index.html` повторите их, если они там нужны.

## 8. Подключение к Telegram

У [@BotFather](https://t.me/BotFather):

1. `/setmenubutton` (или `/mybots` → бот → *Bot Settings* → *Menu Button*) — адрес
   `https://example.com`. Кнопку меню бот выставляет и сам при старте, но так она
   появится сразу.
2. `/setdescription` и `/setabouttext` — описание бота. Политика конфиденциальности
   обещает контакт разработчика «в описании бота» — укажите его там.
3. Проверьте: откройте бота, `/start` → «📱 Открыть приложение».

## 9. Брандмауэр

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Порт 8000 наружу не открывается: API слушает `127.0.0.1`, и снаружи он доступен только
через nginx.

## 10. Резервные копии

База — в режиме WAL, поэтому копировать `streakbot.db` на работающих службах нельзя:
свежие изменения лежат в `streakbot.db-wal`. Копию снимает скрипт (согласованный снимок
через backup API SQLite):

```bash
sudo -u streakbot /opt/streakbot/venv/bin/python scripts/backup_db.py --output /opt/streakbot/backups/streakbot-$(date +\%F).db
```

Ежедневно, в cron пользователя `streakbot` (`sudo -u streakbot crontab -e`):

```cron
0 4 * * * cd /opt/streakbot/app && /opt/streakbot/venv/bin/python scripts/backup_db.py --output /opt/streakbot/backups/streakbot-$(date +\%F).db && find /opt/streakbot/backups -name 'streakbot-*.db' -mtime +30 -delete
```

Копии стоит забирать и с сервера: диск сервера — не резервная копия.

## 11. Обновление

```bash
cd /opt/streakbot/app
sudo -u streakbot /opt/streakbot/venv/bin/python scripts/backup_db.py   # сначала копия
sudo -u streakbot git pull
sudo -u streakbot /opt/streakbot/venv/bin/pip install -r requirements.txt -r tma/backend/requirements.txt
sudo -u streakbot /opt/streakbot/venv/bin/alembic upgrade head
sudo -u streakbot bash -c 'cd tma/frontend && npm ci && npm run build'
sudo systemctl restart streakbot-api streakbot-bot
```

Фронтенд обновляется без перезапуска nginx: имена файлов сборки содержат хеш, а
`index.html` не кешируется, поэтому клиенты получают новую версию при следующем
открытии.

## 12. Наблюдение

```bash
journalctl -u streakbot-api -f                  # и streakbot-bot
tail -f /opt/streakbot/app/logs/api.log
curl -s https://example.com/api/health          # {"status":"ok"} или 503
```

Свои логи API и бот пишут с ротацией (10 МБ, хранение 14 дней) — значения переменных в
трейсбэки не попадают, поэтому токен бота и чужие `initData` в логи не утекают.
`/health` проверяет и доступность базы — его удобно опрашивать внешним мониторингом.

Запрос дольше секунды API записывает предупреждением `Slow request: …` — по нему видно,
что начало тормозить, раньше, чем это заметят пользователи.

## 13. Проверка после запуска

- [ ] `https://example.com` открывается, сертификат валиден;
- [ ] `curl https://example.com/api/health` → `{"status":"ok"}`;
- [ ] `curl -i https://example.com/api/tasks` → `401` (без подписи Telegram доступа нет);
- [ ] `curl -i https://example.com/api/docs` → `404` (документация не публикуется);
- [ ] в Telegram: `/start` → «Открыть приложение» → привычки создаются и отмечаются;
- [ ] напоминание приходит в заданную минуту;
- [ ] вход в админ-панель виден только у администратора;
- [ ] `sudo -u streakbot python scripts/backup_db.py` создаёт копию;
- [ ] `sudo systemctl restart streakbot-api streakbot-bot` — обе службы поднимаются;
- [ ] сервер перезагружается, и службы стартуют сами (`systemctl enable` уже сделан).

## Если пользователей станет много

SQLite держит одного писателя одновременно, и этого хватает надолго: запись идёт только
на отметку привычки, изменение настроек и отзыв. Когда перестанет хватать — переход на
PostgreSQL описан в [SCALING.md](SCALING.md): меняется `DATABASE_URL` и ставится
`asyncpg`, код — нет. Там же — про несколько воркеров uvicorn и про то, почему бот
остаётся в одном экземпляре.
