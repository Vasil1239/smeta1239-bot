# Инструкция по деплою @smeta1239_bot

Пошаговое руководство: от чистого репозитория до работающего бота.

## 0. Требования

- Node.js 20+ локально (только для `vercel` CLI и проверок)
- Аккаунт [Vercel](https://vercel.com)
- Аккаунт [Supabase](https://supabase.com)
- Telegram-бот `@smeta1239_bot` от [@BotFather](https://t.me/BotFather) → сохрани `TELEGRAM_BOT_TOKEN`
- (Опц.) API-ключ [Groq](https://console.groq.com) — бесплатно
- (Опц.) API-ключ OpenAI как fallback

## 1. База данных (Supabase)

1. Создай новый проект в Supabase.
2. Открой SQL Editor и выполни файл `db/schema.sql` целиком.
3. В Settings → API скопируй:
   - `Project URL` → `SUPABASE_URL`
   - `service_role secret` → `SUPABASE_SERVICE_ROLE_KEY`
   > **Внимание:** `service_role` даёт полный доступ. Никогда не публикуй его в клиенте.

## 2. Локали

Файлы `locales/*.json` должны быть в корне проекта (12 языков: `ru, en, sr, es, de, fr, it, pt, tr, ar, zh, uk`). Они генерируются отдельно и включаются в git.

Быстрая проверка:
```bash
ls locales/ | wc -l    # должно быть 12
```

## 3. Секретные переменные

Скопируй `.env.example` в `.env.local`. Заполни все значения:

| Переменная | Значение |
|------------|----------|
| `TELEGRAM_BOT_TOKEN` | токен от BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | любая случайная строка (минимум 32 символа) |
| `SUPABASE_URL` | из шага 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | из шага 1 |
| `ADMIN_TELEGRAM_CHAT_ID` | твой Telegram-ID (узнай через @userinfobot) |
| `SUPPORT_USERNAME` | `@fortyna1239` |
| `STARS_PRICE_BASIC` | `299` |
| `STARS_PRICE_PRO` | `799` |
| `STARS_PRICE_LIFETIME` | `4999` |
| `FREE_TRIAL_DAYS` | `30` |
| `FIRST_REMINDER_DAYS` | `7` |
| `SECOND_REMINDER_DAYS` | `2` |
| `AI_MODE` | `hybrid` |
| `GROQ_API_KEY` | ключ Groq (рекомендуется) |
| `OPENAI_API_KEY` | ключ OpenAI (fallback, необязателен) |
| `CRON_SECRET` | любая случайная строка (защищает /api/cron и /api/setup) |

## 4. Деплой на Vercel

```bash
npm i -g vercel
vercel login
vercel link          # свяжи с проектом (или создай новый)
vercel env pull      # (опц.) подтянуть переменные
vercel --prod
```

Или через дашборд:
1. Import Git Repository.
2. Framework Preset: **Other**.
3. Build & Development Settings: оставь по умолчанию (Vercel сам подхватит `/api/*.js`).
4. Environment Variables: добавь все из шага 3.
5. Deploy.

После первого деплоя Vercel выдаст URL вида `https://smeta1239-bot.vercel.app`.

## 5. Регистрация webhook (одноразовый)

Открой в браузере (замени `<...>` на свои значения):

```
https://<app>.vercel.app/api/setup?secret=<CRON_SECRET>&base_url=https://<app>.vercel.app
```

В ответе увидишь:
- `getMe` — подтверждение токена
- `setWebhook: https://<app>.vercel.app/api/webhook`
- `setMyCommands` — команды на 12 языках

## 6. Cron

`vercel.json` уже содержит расписание `0 9 * * *` (09:00 UTC ежедневно). Vercel запустит его сам после деплоя. Проверить: Vercel dashboard → Settings → Cron Jobs.

## 7. Проверка

1. Открой `@smeta1239_bot` в Telegram, отправь `/start`.
2. Должно прийти приветствие + главное меню.
3. Кнопка "New estimate" → введи текст работы → страну и город → получи расчёт.
4. Проверь `/admin` (только с `ADMIN_TELEGRAM_CHAT_ID`).

## 8. Обновления

При изменении кода: `git push` → Vercel сделает re-deploy автоматически.
При изменении команд/языков: снова открой `/api/setup?secret=...`.

## Troubleshooting

- **401 на webhook** → проверь `TELEGRAM_WEBHOOK_SECRET` в Vercel и то, что setWebhook установил тот же секрет.
- **AI не парсит** → добавь `GROQ_API_KEY` или `OPENAI_API_KEY`; без них бот попросит ввести работы вручную.
- **PDF без кириллицы** → это ожидаемо, кириллица транслитерируется. Word (`.docx`) поддерживает кириллицу нативно.
- **Идемпотентность** — старые записи чистятся кроном раз в сутки.

## Поддержка

Пиши @fortyna1239.
