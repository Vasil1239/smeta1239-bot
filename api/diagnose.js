// api/diagnose.js — full health check
import { _rawCall } from '../lib/telegram.js';
import { supabase as sb } from '../lib/supabase.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const provided = req.query?.secret || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (secret && provided !== secret) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const out = { env: {}, telegram: {}, supabase: {}, ai: {} };

  // 1. ENV
  for (const k of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GROQ_API_KEY', 'CRON_SECRET', 'SUPPORT_USERNAME', 'ADMIN_TELEGRAM_CHAT_ID']) {
    const v = process.env[k];
    out.env[k] = v ? `set (len=${v.length})` : 'MISSING';
  }

  // 2. Telegram getMe + webhook info
  try {
    out.telegram.getMe = await _rawCall('getMe');
  } catch (e) { out.telegram.getMe = `err: ${e.message}`; }

  try {
    out.telegram.webhookInfo = await _rawCall('getWebhookInfo');
  } catch (e) { out.telegram.webhookInfo = `err: ${e.message}`; }

  // 3. Supabase — can we read a table?
  try {
    const { data, error, count } = await sb.from('estimate_plans').select('*', { count: 'exact' });
    out.supabase.plans_count = count;
    out.supabase.plans_error = error?.message || null;
    out.supabase.plans_sample = data?.[0] || null;
  } catch (e) {
    out.supabase.error = e.message;
  }

  // 4. AI — quick Groq ping
  try {
    const key = process.env.GROQ_API_KEY;
    if (!key) {
      out.ai.groq = 'no_key';
    } else {
      // ping current model
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          messages: [{ role: 'user', content: 'reply OK' }],
          max_tokens: 5
        })
      });
      const j = await r.json();
      out.ai.groq_status = r.status;
      out.ai.groq_reply = j.choices?.[0]?.message?.content || j.error?.message || JSON.stringify(j).slice(0, 200);
    }
  } catch (e) { out.ai.groq_error = e.message; }

  return res.status(200).json(out);
}
