// api/getprofile.js — debug: reads current bot profile back from Telegram
import { _rawCall } from '../lib/telegram.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const provided = req.query?.secret || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (secret && provided !== secret) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const langs = ['', 'ru', 'en', 'sr'];
  const out = {};
  for (const l of langs) {
    const key = l || '(default)';
    try {
      const nameRes = await _rawCall('getMyName', l ? { language_code: l } : {});
      const shortRes = await _rawCall('getMyShortDescription', l ? { language_code: l } : {});
      const aboutRes = await _rawCall('getMyDescription', l ? { language_code: l } : {});
      out[key] = {
        name: nameRes.name,
        short_description: shortRes.short_description,
        description: aboutRes.description
      };
    } catch (e) {
      out[key] = { error: e.message };
    }
  }
  return res.status(200).json({ ok: true, profile: out });
}
