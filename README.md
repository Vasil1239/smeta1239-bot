# @smeta1239_bot

Autonomous multilingual Telegram bot for renovation cost estimation, deployed on Vercel Serverless Functions with Supabase backend.

## Features

- 12 UI languages (ru, en, sr, es, de, fr, it, pt, tr, ar, zh, uk)
- Multi-currency (EUR, USD, RUB, RSD, TRY) auto-selected by country
- Free 30-day trial → Telegram Stars subscription (basic / pro / lifetime)
- AI free-text parsing (Groq `llama-3.3-70b-versatile`, OpenAI `gpt-4o-mini` fallback)
- Word (`.docx`) & PDF exports
- Referral program (+14 days for both sides)
- Idempotent webhook, rate-limits, promo codes, admin panel

## Stack

- Node.js 20, ES Modules
- Vercel Serverless Functions (`/api/*.js`)
- Supabase (PostgreSQL) via `@supabase/supabase-js`
- Telegram Bot API through raw `fetch`
- `docx`, `pdfkit`

## Deploy

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for a step-by-step guide.

TL;DR:

1. `supabase db push db/schema.sql`
2. `vercel --prod`
3. Set env vars from `.env.example` in Vercel dashboard
4. Open `https://<your-app>.vercel.app/api/setup?secret=<CRON_SECRET>` once to register the webhook.

## License

Proprietary. All rights reserved.
