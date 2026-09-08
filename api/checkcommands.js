// api/checkcommands.js — read what Telegram thinks our commands are, per language.
import { _rawCall } from '../lib/telegram.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const provided = req.query?.secret || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (secret && provided !== secret) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const langs = ['', 'ru', 'en', 'sr', 'es', 'de'];
  const out = {};
  for (const l of langs) {
    const key = l || '(default)';
    try {
      const cmds = await _rawCall('getMyCommands', l ? { language_code: l } : {});
      out[key] = cmds;
    } catch (e) {
      out[key] = `err: ${e.message}`;
    }
  }
  return res.status(200).json({ ok: true, commands: out });
}
