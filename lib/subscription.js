// lib/subscription.js
// User provisioning, trial/paid subscription lifecycle, referrals, promos.

import { supabase } from './supabase.js';
import { normalizeLanguage } from './constants.js';

const REFERRAL_BONUS_DAYS = 14;

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d;
}

function isActive(sub) {
  if (!sub) return false;
  if (sub.status !== 'active') return false;
  return new Date(sub.expires_at).getTime() > Date.now();
}

/**
 * Ensure an estimate_users + estimate_subscriptions row exists for a Telegram user.
 * On first insert:
 *   - free trial for FREE_TRIAL_DAYS days
 *   - referredBy (if valid) → +14 days for both invitee and inviter
 * Never grants a trial twice for the same telegram_id.
 */
export async function ensureUser(tgUser, referredBy = null) {
  if (!tgUser?.id) throw new Error('ensureUser: tgUser.id required');

  const trialDays = Number(process.env.FREE_TRIAL_DAYS) || 30;
  const langCode = normalizeLanguage(tgUser.language_code);

  // 1) Upsert user row.
  const { data: existing, error: selErr } = await supabase
    .from('estimate_users')
    .select('*')
    .eq('telegram_id', tgUser.id)
    .maybeSingle();
  if (selErr) throw selErr;

  let user = existing;
  let isNewUser = false;

  if (!user) {
    isNewUser = true;
    // Validate referrer.
    let validReferrer = null;
    if (referredBy && Number(referredBy) !== Number(tgUser.id)) {
      const { data: ref } = await supabase
        .from('estimate_users')
        .select('telegram_id')
        .eq('telegram_id', referredBy)
        .maybeSingle();
      if (ref) validReferrer = ref.telegram_id;
    }

    const insertPayload = {
      telegram_id: tgUser.id,
      username: tgUser.username || null,
      first_name: tgUser.first_name || null,
      last_name: tgUser.last_name || null,
      language_code: langCode,
      referred_by: validReferrer,
      referral_bonus_days: validReferrer ? REFERRAL_BONUS_DAYS : 0
    };
    const { data: created, error: insErr } = await supabase
      .from('estimate_users')
      .insert(insertPayload)
      .select()
      .single();
    if (insErr) throw insErr;
    user = created;

    // Give inviter +14 days.
    if (validReferrer) {
      await extendSubscription(validReferrer, REFERRAL_BONUS_DAYS, null, null, { reason: 'referral' });
    }
  } else {
    // Best-effort profile refresh; never overwrite user's chosen language once set.
    await supabase
      .from('estimate_users')
      .update({
        username: tgUser.username ?? user.username,
        first_name: tgUser.first_name ?? user.first_name,
        last_name: tgUser.last_name ?? user.last_name,
        last_active_at: new Date().toISOString()
      })
      .eq('telegram_id', tgUser.id);
  }

  // 2) Ensure a subscription row exists.
  const { data: sub, error: subErr } = await supabase
    .from('estimate_subscriptions')
    .select('*')
    .eq('telegram_id', tgUser.id)
    .maybeSingle();
  if (subErr) throw subErr;

  if (!sub) {
    // Anti-abuse: only new users get trial. Existing users (rare edge case
    // where user row exists but sub row does not) get 0-day expired trial.
    const trialLength = isNewUser ? trialDays + (user.referral_bonus_days || 0) : 0;
    const expires = addDays(new Date(), trialLength);
    await supabase.from('estimate_subscriptions').insert({
      telegram_id: tgUser.id,
      plan: 'trial',
      status: trialLength > 0 ? 'active' : 'expired',
      started_at: new Date().toISOString(),
      expires_at: expires.toISOString()
    });
  }

  return { user, isNewUser };
}

/** Returns { active, plan, expires_at, days_left } */
export async function getSubscriptionStatus(telegramId) {
  // BETA MODE: unconditional free access for everyone.
  // Enabled with BETA_FREE_ACCESS=1 (or 'true'). Remove the env var
  // (or set it to 0) to restore normal paid/trial logic without
  // any code changes.
  const betaFlag = String(process.env.BETA_FREE_ACCESS || '').toLowerCase();
  if (betaFlag === '1' || betaFlag === 'true' || betaFlag === 'yes') {
    const expires = new Date(Date.now() + 365 * 86400000);
    return {
      active: true,
      plan: 'beta',
      expires_at: expires.toISOString(),
      days_left: 365,
      beta: true
    };
  }

  const { data: sub } = await supabase
    .from('estimate_subscriptions')
    .select('*')
    .eq('telegram_id', telegramId)
    .maybeSingle();
  if (!sub) return { active: false, plan: null, expires_at: null, days_left: 0 };

  const expires = new Date(sub.expires_at);
  const daysLeft = Math.max(0, Math.ceil((expires.getTime() - Date.now()) / 86400000));
  const active = isActive(sub);

  // Auto-expire if past date but still marked active.
  if (!active && sub.status === 'active') {
    await supabase
      .from('estimate_subscriptions')
      .update({ status: 'expired' })
      .eq('telegram_id', telegramId);
  }

  return {
    active,
    plan: sub.plan,
    expires_at: sub.expires_at,
    days_left: daysLeft
  };
}

/**
 * Extend (or start) a subscription.
 * If currently active → extend from current expires_at.
 * If expired/none    → extend from NOW.
 */
export async function extendSubscription(telegramId, days, plan = null, paymentChargeId = null, opts = {}) {
  if (!telegramId || !days) return null;

  const { data: sub } = await supabase
    .from('estimate_subscriptions')
    .select('*')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  const now = new Date();
  let base;
  if (sub && isActive(sub)) {
    base = new Date(sub.expires_at);
  } else {
    base = now;
  }
  const newExpires = addDays(base, days);

  const payload = {
    telegram_id: telegramId,
    plan: plan || sub?.plan || 'trial',
    status: 'active',
    expires_at: newExpires.toISOString(),
    updated_at: now.toISOString(),
    total_extensions: (sub?.total_extensions || 0) + 1,
    // Reset reminders after any extension.
    reminder_7d_sent: false,
    reminder_2d_sent: false,
    reminder_0d_sent: false
  };

  if (!sub) {
    payload.started_at = now.toISOString();
    await supabase.from('estimate_subscriptions').insert(payload);
  } else {
    await supabase.from('estimate_subscriptions').update(payload).eq('telegram_id', telegramId);
  }

  await supabase.from('estimate_audit_log').insert({
    telegram_id: telegramId,
    event_type: 'subscription_extended',
    payload: { days, plan, paymentChargeId, reason: opts.reason || null }
  });

  return { expires_at: newExpires.toISOString(), plan: payload.plan };
}

/** Activate a promo code for the user. Returns { ok, bonus_days, error? } */
export async function activatePromo(telegramId, codeRaw) {
  const code = String(codeRaw || '').trim().toUpperCase();
  if (!code) return { ok: false, error: 'empty_code' };

  const { data: promo } = await supabase
    .from('estimate_promo_codes')
    .select('*')
    .eq('code', code)
    .maybeSingle();

  if (!promo || !promo.is_active) return { ok: false, error: 'invalid_code' };
  if (promo.valid_until && new Date(promo.valid_until).getTime() < Date.now())
    return { ok: false, error: 'expired' };
  if (promo.max_uses > 0 && promo.used_count >= promo.max_uses)
    return { ok: false, error: 'exhausted' };

  // One activation per user per code.
  const { data: prev } = await supabase
    .from('estimate_promo_activations')
    .select('id')
    .eq('telegram_id', telegramId)
    .eq('promo_code', code)
    .maybeSingle();
  if (prev) return { ok: false, error: 'already_used' };

  await supabase.from('estimate_promo_activations').insert({
    telegram_id: telegramId,
    promo_code: code,
    bonus_days: promo.bonus_days
  });
  await supabase
    .from('estimate_promo_codes')
    .update({ used_count: (promo.used_count || 0) + 1 })
    .eq('code', code);

  if (promo.bonus_days > 0) {
    await extendSubscription(telegramId, promo.bonus_days, null, null, { reason: `promo:${code}` });
  }

  return { ok: true, bonus_days: promo.bonus_days };
}

/** Rate-limit check. Returns { allowed, remaining, limit }. */
export async function checkRateLimit(telegramId, action, limit) {
  const windowStart = new Date();
  windowStart.setUTCHours(0, 0, 0, 0);

  const { data: row } = await supabase
    .from('estimate_rate_limits')
    .select('*')
    .eq('telegram_id', telegramId)
    .eq('action', action)
    .eq('window_start', windowStart.toISOString())
    .maybeSingle();

  const current = row?.count || 0;
  if (current >= limit) return { allowed: false, remaining: 0, limit };

  if (row) {
    await supabase
      .from('estimate_rate_limits')
      .update({ count: current + 1 })
      .eq('id', row.id);
  } else {
    await supabase
      .from('estimate_rate_limits')
      .insert({
        telegram_id: telegramId,
        action,
        window_start: windowStart.toISOString(),
        count: 1
      });
  }
  return { allowed: true, remaining: limit - current - 1, limit };
}
