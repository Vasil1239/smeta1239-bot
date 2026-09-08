// lib/constants.js
// Global constants shared across the bot.

export const SUPPORTED_LANGUAGES = [
  'ru', 'en', 'sr', 'es', 'de', 'fr', 'it', 'pt', 'tr', 'ar', 'zh', 'uk'
];

export const DEFAULT_LANGUAGE = 'en';

export const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'RUB', 'RSD', 'TRY'];

// ISO country name (lowercase-insensitive) → default currency.
// Keys are stored lowercase; use `countryToCurrency(name)` helper.
const RAW_COUNTRY_CURRENCY = {
  // EUR
  serbia: 'EUR', // Serbia officially uses RSD, but our contractor rates are quoted in EUR
  germany: 'EUR', austria: 'EUR', france: 'EUR', italy: 'EUR', spain: 'EUR',
  portugal: 'EUR', netherlands: 'EUR', belgium: 'EUR', greece: 'EUR',
  ireland: 'EUR', finland: 'EUR', estonia: 'EUR', latvia: 'EUR', lithuania: 'EUR',
  slovakia: 'EUR', slovenia: 'EUR', croatia: 'EUR', montenegro: 'EUR',
  cyprus: 'EUR', malta: 'EUR', luxembourg: 'EUR',
  // RSD
  // (leaving Serbia mapped to EUR by default; users can override)
  // USD
  usa: 'USD', 'united states': 'USD', 'united states of america': 'USD',
  ecuador: 'USD', panama: 'USD', 'el salvador': 'USD',
  // RUB
  russia: 'RUB', 'russian federation': 'RUB',
  belarus: 'RUB', // conservative default; user can change
  // TRY
  turkey: 'TRY', türkiye: 'TRY', turkiye: 'TRY',
  // Others fall back to EUR
};

export const COUNTRY_TO_CURRENCY = RAW_COUNTRY_CURRENCY;

export function countryToCurrency(country) {
  if (!country) return 'EUR';
  const key = String(country).trim().toLowerCase();
  return RAW_COUNTRY_CURRENCY[key] || 'EUR';
}

// Telegram user's IETF language tag → our 12-language set.
export function normalizeLanguage(tag) {
  if (!tag) return DEFAULT_LANGUAGE;
  const short = String(tag).toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LANGUAGES.includes(short) ? short : DEFAULT_LANGUAGE;
}

// Rate-limits: max estimates per rolling 24h.
export const RATE_LIMITS = {
  trial: { create_estimate: 20, ai_call: 40, export: 40 },
  paid:  { create_estimate: 100, ai_call: 200, export: 200 }
};

// Subscription plans (mirrors estimate_plans table).
export const PLANS = {
  basic:    { key: 'basic',    days: 30,    stars_env: 'STARS_PRICE_BASIC',    default_stars: 299  },
  pro:      { key: 'pro',      days: 90,    stars_env: 'STARS_PRICE_PRO',      default_stars: 799  },
  lifetime: { key: 'lifetime', days: 36500, stars_env: 'STARS_PRICE_LIFETIME', default_stars: 4999 }
};

// State-machine values written to estimate_drafts.state.
export const STATES = {
  IDLE: null,
  AWAITING_TASK: 'awaiting_task',
  AWAITING_LOCATION: 'awaiting_location',
  AWAITING_CLARIFICATION: 'awaiting_clarification',
  SHOWING_ESTIMATE: 'showing_estimate',
  EDITING: 'editing',
  AWAITING_PROMO: 'awaiting_promo',
  AWAITING_LANG: 'awaiting_lang',
  AWAITING_PRECISE: 'awaiting_precise'
};

export const UNIT_KEYS = ['m2', 'linear_m', 'piece', 'point', 'm3', 'trip'];

export const PRICE_MODES = ['min', 'recommended', 'max'];

export const RESERVE_PERCENT_DEFAULT = 10;

// Reminders (days-before-expiry to notify).
export const REMINDER_OFFSETS = [
  { flag: 'reminder_7d_sent', envDays: 'FIRST_REMINDER_DAYS',  fallback: 7 },
  { flag: 'reminder_2d_sent', envDays: 'SECOND_REMINDER_DAYS', fallback: 2 },
  { flag: 'reminder_0d_sent', envDays: null,                    fallback: 0 }
];
