// api/testestimate.js — end-to-end test: AI parse + estimate build
import { parseTaskWithAI } from '../lib/ai.js';
import { buildEstimate } from '../lib/estimate.js';
import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const provided = req.query?.secret || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (secret && provided !== secret) return res.status(401).json({ ok: false });

  const text = req.query?.text || 'ремонт квартиры под ключ 50 м2';
  const country = req.query?.country || 'Russia';
  const city = req.query?.city || 'Moscow';
  const currency = req.query?.currency || 'RUB';
  const langCode = req.query?.lang || 'ru';

  const out = { input: { text, country, city, currency, langCode } };

  // 1. Parse with AI
  try {
    const parsed = await parseTaskWithAI(text, langCode, country, city);
    out.parsed = parsed;
  } catch (e) {
    out.parse_error = e.message;
    return res.status(200).json(out);
  }

  // 2. Build estimate
  try {
    const estimate = await buildEstimate(999999999, out.parsed.works || [], country, city, 'recommended');
    out.estimate = estimate;
  } catch (e) {
    out.estimate_error = e.message;
    out.estimate_stack = e.stack?.split('\n').slice(0, 5);
  }

  return res.status(200).json(out);
}
