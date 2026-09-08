// api/setup.js
// One-shot setup: registers the Telegram webhook and per-language bot commands.
// Protected by CRON_SECRET (?secret=...).

import { setWebhook, setMyCommands, getMe } from '../lib/telegram.js';
import { SUPPORTED_LANGUAGES } from '../lib/constants.js';
import { t } from '../lib/i18n.js';

export const config = { runtime: 'nodejs20.x' };

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const provided = req.query?.secret || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (secret && provided !== secret) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const baseUrl = req.query?.base_url
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (!baseUrl) {
    return res.status(400).json({ ok: false, error: 'no_base_url', hint: 'pass ?base_url=https://yourapp.vercel.app' });
  }
  const webhookUrl = `${baseUrl.replace(/\/$/, '')}/api/webhook`;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || '';

  const result = { steps: [] };

  try {
    const me = await getMe();
    result.steps.push({ getMe: { id: me.id, username: me.username } });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'getMe_failed', message: e.message });
  }

  try {
    await setWebhook(webhookUrl, webhookSecret);
    result.steps.push({ setWebhook: webhookUrl });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'setWebhook_failed', message: e.message });
  }

  const perLangResults = {};
  for (const lang of SUPPORTED_LANGUAGES) {
    const commands = [
      { command: 'start',    description: t(lang, 'commands.start') },
      { command: 'lang',     description: t(lang, 'commands.lang') },
      { command: 'plans',    description: t(lang, 'commands.plans') },
      { command: 'status',   description: t(lang, 'commands.status') },
      { command: 'promo',    description: t(lang, 'commands.promo') },
      { command: 'referral', description: t(lang, 'commands.referral') },
      { command: 'help',     description: t(lang, 'commands.help') }
    ];
    try {
      await setMyCommands(commands, lang);
      perLangResults[lang] = 'ok';
    } catch (e) {
      perLangResults[lang] = `err: ${e.message}`;
    }
  }
  result.steps.push({ setMyCommands: perLangResults });

  return res.status(200).json({ ok: true, result });
}
