// api/cron.js
// Daily cron (09:00 UTC): expiry reminders, mark expired, cleanup idempotency.

import { supabase } from '../lib/supabase.js';
import { sendMessage } from '../lib/telegram.js';
import { t } from '../lib/i18n.js';
import { REMINDER_OFFSETS, normalizeLanguage } from '../lib/constants.js';
import { planSelector } from '../lib/keyboards.js';


export default async function handler(req, res) {
  // Auth: Vercel's cron sends the header `x-vercel-cron: 1`; also accept ?secret.
  const cronHdr = req.headers['x-vercel-cron'];
  const secret = process.env.CRON_SECRET;
  const providedSecret = req.query?.secret || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!cronHdr && secret && providedSecret !== secret) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const stats = { reminders: 0, expired: 0, cleaned: 0, errors: 0 };

  try {
    stats.reminders = await sendReminders();
  } catch (e) { console.error('[cron] reminders error:', e); stats.errors++; }

  try {
    stats.expired = await markExpired();
  } catch (e) { console.error('[cron] expiry error:', e); stats.errors++; }

  try {
    stats.cleaned = await cleanupProcessedUpdates();
  } catch (e) { console.error('[cron] cleanup error:', e); stats.errors++; }

  return res.status(200).json({ ok: true, stats });
}

async function sendReminders() {
  let sent = 0;
  const now = new Date();

  for (const offset of REMINDER_OFFSETS) {
    const days = offset.envDays
      ? (Number(process.env[offset.envDays]) || offset.fallback)
      : offset.fallback;

    // Look for subs expiring exactly `days` from now (within a 24h window).
    const from = new Date(now.getTime() + days * 86400000 - 12 * 3600000);
    const to   = new Date(now.getTime() + days * 86400000 + 12 * 3600000);

    const { data: subs } = await supabase
      .from('estimate_subscriptions').select('*')
      .eq('status', 'active')
      .eq(offset.flag, false)
      .gte('expires_at', from.toISOString())
      .lte('expires_at', to.toISOString())
      .limit(500);

    if (!subs?.length) continue;

    for (const sub of subs) {
      try {
        const { data: user } = await supabase
          .from('estimate_users').select('language_code').eq('telegram_id', sub.telegram_id).maybeSingle();
        const lang = normalizeLanguage(user?.language_code);

        const key = days === 0
          ? 'reminders.today'
          : days === 2 ? 'reminders.two_days' : 'reminders.seven_days';
        await sendMessage(sub.telegram_id,
          t(lang, key, {
            plan: sub.plan,
            expires: new Date(sub.expires_at).toISOString().slice(0, 10)
          }),
          { reply_markup: planSelector(lang) }
        );

        await supabase.from('estimate_subscriptions')
          .update({ [offset.flag]: true })
          .eq('telegram_id', sub.telegram_id);
        sent++;
      } catch (e) {
        console.warn('[cron] reminder send failed for', sub.telegram_id, e.message);
      }
    }
  }
  return sent;
}

async function markExpired() {
  const { data, error } = await supabase
    .from('estimate_subscriptions')
    .update({ status: 'expired' })
    .eq('status', 'active')
    .lt('expires_at', new Date().toISOString())
    .select('telegram_id');
  if (error) throw error;
  return (data || []).length;
}

async function cleanupProcessedUpdates() {
  const cutoff = new Date(Date.now() - 24 * 3600000).toISOString();
  const { data, error } = await supabase
    .from('estimate_processed_updates')
    .delete()
    .lt('processed_at', cutoff)
    .select('update_id');
  if (error) throw error;
  return (data || []).length;
}
