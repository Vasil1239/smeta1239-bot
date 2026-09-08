// lib/payments.js
// Telegram Stars (XTR) invoice creation and payment handling.

import { supabase } from './supabase.js';
import { sendInvoice, answerPreCheckoutQuery, sendMessage } from './telegram.js';
import { t } from './i18n.js';
import { PLANS } from './constants.js';
import { extendSubscription } from './subscription.js';

function planStars(planKey) {
  const p = PLANS[planKey];
  if (!p) return null;
  return Number(process.env[p.stars_env]) || p.default_stars;
}

function planDays(planKey) {
  const p = PLANS[planKey];
  if (!p) return null;
  return p.days;
}

/**
 * Create and send a Telegram Stars invoice for a subscription plan.
 * Payload format: "plan:<planKey>:<telegramId>:<timestamp>"
 */
export async function createInvoice(chatId, planKey, langCode = 'en') {
  const stars = planStars(planKey);
  const days = planDays(planKey);
  if (!stars || !days) throw new Error(`Unknown plan: ${planKey}`);

  const payload = `plan:${planKey}:${chatId}:${Date.now()}`;

  return await sendInvoice(chatId, {
    title:       t(langCode, `invoice.${planKey}.title`),
    description: t(langCode, `invoice.${planKey}.description`, { days }),
    payload,
    currency: 'XTR',
    prices: [{
      label: t(langCode, `invoice.${planKey}.title`),
      amount: stars
    }],
    // Stars invoices don't need provider_token / need_email / etc.
    start_parameter: `buy_${planKey}`
  });
}

export async function handlePreCheckout(query) {
  if (!query) return;
  const payload = String(query.invoice_payload || '');
  const parts = payload.split(':');
  if (parts[0] !== 'plan' || !PLANS[parts[1]]) {
    return answerPreCheckoutQuery(query.id, false, 'Invalid invoice payload.');
  }
  return answerPreCheckoutQuery(query.id, true);
}

/**
 * Record the payment and extend subscription.
 * Idempotent by telegram_payment_charge_id.
 */
export async function handleSuccessfulPayment(msg, langCode = 'en') {
  const sp = msg?.successful_payment;
  if (!sp) return;

  const chargeId = sp.telegram_payment_charge_id;
  if (!chargeId) return;

  // Idempotency: skip if we already recorded this charge.
  const { data: existing } = await supabase
    .from('estimate_payments')
    .select('id')
    .eq('telegram_payment_charge_id', chargeId)
    .maybeSingle();
  if (existing) return;

  const payload = String(sp.invoice_payload || '');
  const parts = payload.split(':');
  const planKey = parts[1];
  const plan = PLANS[planKey];
  if (!plan) return;

  const days = plan.days;
  const chatId = msg.from?.id || msg.chat?.id;

  await supabase.from('estimate_payments').insert({
    telegram_id: chatId,
    telegram_payment_charge_id: chargeId,
    provider_payment_charge_id: sp.provider_payment_charge_id || null,
    currency: sp.currency || 'XTR',
    total_amount: sp.total_amount,
    plan: planKey,
    days_granted: days,
    payload,
    status: 'completed'
  });

  const ext = await extendSubscription(chatId, days, planKey, chargeId, { reason: 'payment' });

  await sendMessage(chatId,
    t(langCode, 'payment.thanks', {
      plan: t(langCode, `plans.name_${planKey}`),
      days,
      expires: ext?.expires_at ? new Date(ext.expires_at).toISOString().slice(0, 10) : ''
    })
  );
}
