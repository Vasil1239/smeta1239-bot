// api/webhook.js
// Main Telegram webhook. Verifies secret, idempotency, routes to handlers.

import { supabase } from '../lib/supabase.js';
import { t } from '../lib/i18n.js';
import {
  sendMessage, editMessageText, answerCallbackQuery, sendDocument
} from '../lib/telegram.js';
import {
  mainMenu, estimateView, editMenu, languageSelector,
  planSelector, backButton, cancelButton
} from '../lib/keyboards.js';
import { ensureUser, getSubscriptionStatus, activatePromo, checkRateLimit } from '../lib/subscription.js';
import { parseTaskWithAI } from '../lib/ai.js';
import { buildEstimate, recalculateEstimate, getEstimate } from '../lib/estimate.js';
import { generateWord, generatePdf, formatEstimateText } from '../lib/exports.js';
import { createInvoice, handlePreCheckout, handleSuccessfulPayment } from '../lib/payments.js';
import { handleAdminEntry, handleAdminCallback, isAdmin } from '../lib/admin.js';
import {
  SUPPORTED_LANGUAGES, STATES, RATE_LIMITS, normalizeLanguage
} from '../lib/constants.js';

// ---- Vercel-specific config ----

// ---- helpers ----

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return await new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

async function ok(res) {
  res.status(200).json({ ok: true });
}

async function markProcessed(updateId) {
  if (!updateId) return true;
  const { data, error } = await supabase
    .from('estimate_processed_updates')
    .insert({ update_id: updateId })
    .select('update_id')
    .maybeSingle();
  if (error && !`${error.code}`.startsWith('23')) {
    // 23505 = unique_violation ⇒ already processed
    console.warn('[webhook] processed_updates insert error:', error.message);
  }
  return !!data;
}

async function getUserLang(telegramId) {
  const { data } = await supabase
    .from('estimate_users').select('language_code').eq('telegram_id', telegramId).maybeSingle();
  return normalizeLanguage(data?.language_code);
}

async function setUserLang(telegramId, lang) {
  await supabase.from('estimate_users').update({ language_code: lang }).eq('telegram_id', telegramId);
}

async function getDraft(telegramId) {
  const { data } = await supabase
    .from('estimate_drafts').select('*').eq('telegram_id', telegramId).maybeSingle();
  return data;
}

async function setDraft(telegramId, state, data = {}) {
  const { data: existing } = await supabase
    .from('estimate_drafts').select('data').eq('telegram_id', telegramId).maybeSingle();
  const merged = { ...(existing?.data || {}), ...data };
  const payload = {
    telegram_id: telegramId,
    state,
    data: merged,
    updated_at: new Date().toISOString()
  };
  if (existing) {
    await supabase.from('estimate_drafts').update(payload).eq('telegram_id', telegramId);
  } else {
    await supabase.from('estimate_drafts').insert(payload);
  }
}

async function clearDraft(telegramId) {
  await supabase.from('estimate_drafts')
    .update({ state: null, data: {} })
    .eq('telegram_id', telegramId);
}

async function isPaidPlan(telegramId) {
  const s = await getSubscriptionStatus(telegramId);
  return s.active && s.plan !== 'trial';
}

// ---------- MAIN HANDLER ----------

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  // Secret header check
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const hdr = req.headers['x-telegram-bot-api-secret-token'];
  if (secret && hdr !== secret) {
    return res.status(401).json({ ok: false, error: 'bad_secret' });
  }

  const update = await readJson(req);

  // Idempotency
  const claimed = await markProcessed(update.update_id);
  if (!claimed) return ok(res);

  try {
    if (update.message?.successful_payment) {
      const lang = await getUserLang(update.message.from.id);
      await handleSuccessfulPayment(update.message, lang);
    } else if (update.pre_checkout_query) {
      await handlePreCheckout(update.pre_checkout_query);
    } else if (update.callback_query) {
      await handleCallback(update.callback_query);
    } else if (update.message) {
      await handleMessage(update.message);
    }
  } catch (err) {
    console.error('[webhook] handler error:', err);
    try {
      await supabase.from('estimate_audit_log').insert({
        telegram_id: update.message?.from?.id || update.callback_query?.from?.id || null,
        event_type: 'webhook_error',
        severity: 'error',
        payload: { message: err.message, stack: (err.stack || '').slice(0, 500) }
      });
    } catch { /* swallow */ }
  }

  return ok(res);
}

// ---------- MESSAGE ROUTER ----------

async function handleMessage(msg) {
  if (!msg.from) return;
  const chatId = msg.from.id;
  const text = (msg.text || '').trim();

  // Bootstrap user
  let refFrom = null;
  const startMatch = /^\/start(?:\s+(.*))?$/.exec(text);
  if (startMatch && startMatch[1]?.startsWith('ref_')) {
    const raw = startMatch[1].replace('ref_', '');
    if (/^\d+$/.test(raw)) refFrom = Number(raw);
  }
  const { user, isNewUser } = await ensureUser(msg.from, refFrom);
  const lang = user.language_code || normalizeLanguage(msg.from.language_code);

  // Commands
  if (text.startsWith('/')) {
    return handleCommand(msg, text, lang, isNewUser);
  }

  // Draft state routing
  const draft = await getDraft(chatId);
  const state = draft?.state;

  if (state === STATES.AWAITING_TASK) {
    return handleTaskInput(chatId, text, lang);
  }
  if (state === STATES.AWAITING_LOCATION) {
    return handleLocationInput(chatId, text, lang, draft);
  }
  if (state === STATES.AWAITING_CLARIFICATION) {
    return handleClarificationInput(chatId, text, lang, draft);
  }
  if (state === STATES.AWAITING_PROMO) {
    return handlePromoInput(chatId, text, lang);
  }
  if (state === STATES.AWAITING_PRECISE) {
    return handlePreciseInput(chatId, text, lang, draft);
  }

  // Fallback
  await sendMessage(chatId, t(lang, 'unknown_message'), { reply_markup: mainMenu(lang) });
}

async function handleCommand(msg, text, lang, isNewUser) {
  const chatId = msg.from.id;
  const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@.*$/, '');

  if (cmd === '/start') {
    await clearDraft(chatId);
    const status = await getSubscriptionStatus(chatId);
    const key = isNewUser ? 'start.new_user' : 'start.returning';
    await sendMessage(chatId,
      t(lang, key, {
        name: msg.from.first_name || '',
        days: status.days_left,
        expires: status.expires_at ? new Date(status.expires_at).toISOString().slice(0, 10) : '—'
      }),
      { reply_markup: mainMenu(lang) }
    );
    return;
  }
  if (cmd === '/help') {
    await sendMessage(chatId, t(lang, 'help.text', {
      support: process.env.SUPPORT_USERNAME || '@fortyna1239'
    }), { reply_markup: backButton(lang) });
    return;
  }
  if (cmd === '/lang') {
    await sendMessage(chatId, t(lang, 'lang.choose'), { reply_markup: languageSelector(lang) });
    return;
  }
  if (cmd === '/admin') {
    if (!isAdmin(chatId)) {
      await sendMessage(chatId, t(lang, 'errors.forbidden'));
      return;
    }
    await handleAdminEntry(chatId);
    return;
  }
  if (cmd === '/referral') {
    const url = `https://t.me/smeta1239_bot?start=ref_${chatId}`;
    await sendMessage(chatId, t(lang, 'referral.text', { url }), { reply_markup: backButton(lang) });
    return;
  }
  if (cmd === '/status') {
    return sendSubscriptionStatus(chatId, lang);
  }
  if (cmd === '/promo') {
    await setDraft(chatId, STATES.AWAITING_PROMO);
    await sendMessage(chatId, t(lang, 'promo.enter'), { reply_markup: cancelButton(lang) });
    return;
  }
  if (cmd === '/plans') {
    await sendMessage(chatId, t(lang, 'plans.pick'), { reply_markup: planSelector(lang) });
    return;
  }

  await sendMessage(chatId, t(lang, 'errors.unknown_command'), { reply_markup: mainMenu(lang) });
}

// ---------- CALLBACK ROUTER ----------

async function handleCallback(cb) {
  const chatId = cb.from.id;
  const data = cb.data || '';
  const msgId = cb.message?.message_id;

  await ensureUser(cb.from);
  const lang = await getUserLang(chatId);

  // Ack immediately so the button spinner disappears.
  await answerCallbackQuery(cb.id);

  // Simple router
  if (data === 'main') {
    await editMessageText(chatId, msgId, t(lang, 'menu.title'), { reply_markup: mainMenu(lang) });
    return;
  }
  if (data === 'cancel') {
    await clearDraft(chatId);
    await editMessageText(chatId, msgId, t(lang, 'common.cancelled'), { reply_markup: mainMenu(lang) });
    return;
  }
  if (data === 'help') {
    await editMessageText(chatId, msgId, t(lang, 'help.text', {
      support: process.env.SUPPORT_USERNAME || '@fortyna1239'
    }), { reply_markup: backButton(lang) });
    return;
  }
  if (data === 'lang') {
    await editMessageText(chatId, msgId, t(lang, 'lang.choose'), { reply_markup: languageSelector(lang) });
    return;
  }
  if (data.startsWith('setlang:')) {
    const newLang = data.split(':')[1];
    if (SUPPORTED_LANGUAGES.includes(newLang)) {
      await setUserLang(chatId, newLang);
      await editMessageText(chatId, msgId,
        t(newLang, 'lang.set'),
        { reply_markup: mainMenu(newLang) }
      );
    }
    return;
  }
  if (data === 'new_estimate') {
    return startNewEstimate(chatId, lang, msgId);
  }
  if (data === 'my_estimates') {
    return showMyEstimates(chatId, lang, msgId);
  }
  if (data === 'sub_status') {
    return sendSubscriptionStatus(chatId, lang, msgId);
  }
  if (data === 'plans') {
    await editMessageText(chatId, msgId, t(lang, 'plans.pick'), { reply_markup: planSelector(lang) });
    return;
  }
  if (data === 'referral') {
    const url = `https://t.me/smeta1239_bot?start=ref_${chatId}`;
    await editMessageText(chatId, msgId, t(lang, 'referral.text', { url }), { reply_markup: backButton(lang) });
    return;
  }
  if (data === 'promo') {
    await setDraft(chatId, STATES.AWAITING_PROMO);
    await editMessageText(chatId, msgId, t(lang, 'promo.enter'), { reply_markup: cancelButton(lang) });
    return;
  }
  if (data.startsWith('buy:')) {
    const planKey = data.split(':')[1];
    try {
      await createInvoice(chatId, planKey, lang);
    } catch (e) {
      await sendMessage(chatId, t(lang, 'errors.invoice_failed'));
    }
    return;
  }
  if (data.startsWith('mode:')) {
    const [, id, mode] = data.split(':');
    await recalculateEstimate(Number(id), mode);
    return renderEstimate(chatId, lang, Number(id), msgId);
  }
  if (data.startsWith('export:')) {
    const [, id, kind] = data.split(':');
    return exportEstimate(chatId, lang, Number(id), kind);
  }
  if (data.startsWith('show:')) {
    const id = Number(data.split(':')[1]);
    return renderEstimate(chatId, lang, id, msgId);
  }
  if (data.startsWith('edit:')) {
    const id = Number(data.split(':')[1]);
    await editMessageText(chatId, msgId, t(lang, 'edit.title'), { reply_markup: editMenu(lang, id) });
    return;
  }
  if (data.startsWith('precise:')) {
    const id = Number(data.split(':')[1]);
    await setDraft(chatId, STATES.AWAITING_PRECISE, { estimateId: id });
    await editMessageText(chatId, msgId, t(lang, 'precise.enter'), { reply_markup: cancelButton(lang) });
    return;
  }
  if (data.startsWith('admin:')) {
    const action = data.split(':')[1];
    await handleAdminCallback(chatId, action);
    return;
  }
}

// ---------- FLOW HELPERS ----------

async function startNewEstimate(chatId, lang, msgId) {
  const sub = await getSubscriptionStatus(chatId);
  if (!sub.active) {
    await editMessageText(chatId, msgId, t(lang, 'subscription.expired'), { reply_markup: planSelector(lang) });
    return;
  }
  const paid = sub.plan !== 'trial';
  const limit = paid ? RATE_LIMITS.paid.create_estimate : RATE_LIMITS.trial.create_estimate;
  const rl = await checkRateLimit(chatId, 'create_estimate', limit);
  if (!rl.allowed) {
    await editMessageText(chatId, msgId, t(lang, 'errors.rate_limit', { limit }), { reply_markup: backButton(lang) });
    return;
  }

  await setDraft(chatId, STATES.AWAITING_TASK, { });
  await editMessageText(chatId, msgId, t(lang, 'new_estimate.ask_task'), { reply_markup: cancelButton(lang) });
}

async function handleTaskInput(chatId, text, lang) {
  if (!text) {
    await sendMessage(chatId, t(lang, 'new_estimate.ask_task'));
    return;
  }
  await setDraft(chatId, STATES.AWAITING_LOCATION, { raw_user_text: text });
  await sendMessage(chatId, t(lang, 'new_estimate.ask_location'), { reply_markup: cancelButton(lang) });
}

async function handleLocationInput(chatId, text, lang, draft) {
  // Parse "Country, City" or just "Country"
  const parts = text.split(',').map(s => s.trim()).filter(Boolean);
  const country = parts[0] || '';
  const city = parts[1] || '';
  if (!country) {
    await sendMessage(chatId, t(lang, 'new_estimate.ask_location'));
    return;
  }
  await supabase.from('estimate_users').update({ country, city }).eq('telegram_id', chatId);

  const raw = draft?.data?.raw_user_text || '';
  await sendMessage(chatId, t(lang, 'new_estimate.parsing'));

  const parsed = await parseTaskWithAI(raw, lang, country, city);
  if (parsed.needs_manual || !parsed.works.length) {
    await sendMessage(chatId, t(lang, 'new_estimate.no_parse'), { reply_markup: mainMenu(lang) });
    await clearDraft(chatId);
    return;
  }

  if (parsed.clarifying_questions?.length) {
    await setDraft(chatId, STATES.AWAITING_CLARIFICATION, {
      country, city,
      parsed_works: parsed.works,
      questions: parsed.clarifying_questions
    });
    await sendMessage(chatId,
      t(lang, 'new_estimate.clarify', { questions: parsed.clarifying_questions.map((q, i) => `${i + 1}. ${q}`).join('\n') }),
      { reply_markup: cancelButton(lang) }
    );
    return;
  }

  await finalizeEstimate(chatId, lang, country, city, parsed.works, raw, parsed);
}

async function handleClarificationInput(chatId, text, lang, draft) {
  const d = draft?.data || {};
  const raw = (d.raw_user_text || '') + '\n\nClarifications: ' + text;

  // Re-parse with the extra info.
  await sendMessage(chatId, t(lang, 'new_estimate.parsing'));
  const parsed = await parseTaskWithAI(raw, lang, d.country, d.city);
  if (parsed.needs_manual || !parsed.works.length) {
    // Use previous parse if new fails.
    const works = d.parsed_works || [];
    if (!works.length) {
      await sendMessage(chatId, t(lang, 'new_estimate.no_parse'), { reply_markup: mainMenu(lang) });
      await clearDraft(chatId);
      return;
    }
    await finalizeEstimate(chatId, lang, d.country, d.city, works, raw, { detected_area: null, detected_object_type: null });
    return;
  }
  await finalizeEstimate(chatId, lang, d.country, d.city, parsed.works, raw, parsed);
}

async function finalizeEstimate(chatId, lang, country, city, works, rawText, parsed) {
  const built = await buildEstimate(chatId, works, country, city, 'recommended', {
    raw_user_text: rawText,
    object_area: parsed?.detected_area || null,
    object_type: parsed?.detected_object_type || null
  });
  await setDraft(chatId, STATES.SHOWING_ESTIMATE, { estimateId: built.estimateId });
  await renderEstimate(chatId, lang, built.estimateId);
}

async function renderEstimate(chatId, lang, estimateId, messageIdToEdit = null) {
  const e = await getEstimate(estimateId);
  if (!e) {
    await sendMessage(chatId, t(lang, 'errors.not_found'));
    return;
  }
  const c = e.calc.currency;
  const lines = [];
  lines.push(t(lang, 'estimate.header', {
    id: e.calc.id,
    country: e.calc.country || '—',
    city: e.calc.city || '—',
    mode: e.calc.price_mode
  }));
  lines.push('');
  e.items.forEach((it, idx) => {
    const total = it.labor_total != null ? `${Number(it.labor_total).toFixed(2)} ${c}` : '—';
    lines.push(`${idx + 1}. ${it.work_name} — ${Number(it.quantity)} ${it.unit} • <b>${total}</b>`);
  });
  lines.push('');
  lines.push(t(lang, 'estimate.summary_labor',     { amount: `${Number(e.calc.total_labor).toFixed(2)} ${c}` }));
  lines.push(t(lang, 'estimate.summary_materials', { amount: `${Number(e.calc.total_materials).toFixed(2)} ${c}` }));
  lines.push(t(lang, 'estimate.summary_reserve',   { percent: e.calc.reserve_percent, amount: `${Number(e.calc.total_reserve).toFixed(2)} ${c}` }));
  lines.push(t(lang, 'estimate.summary_grand',     { amount: `${Number(e.calc.total_grand).toFixed(2)} ${c}` }));

  const kb = estimateView(lang, estimateId);
  const body = lines.join('\n');
  if (messageIdToEdit) {
    await editMessageText(chatId, messageIdToEdit, body, { reply_markup: kb });
  } else {
    await sendMessage(chatId, body, { reply_markup: kb });
  }
}

async function exportEstimate(chatId, lang, estimateId, kind) {
  const sub = await getSubscriptionStatus(chatId);
  const paid = sub.active && sub.plan !== 'trial';
  const limit = paid ? RATE_LIMITS.paid.export : RATE_LIMITS.trial.export;
  const rl = await checkRateLimit(chatId, 'export', limit);
  if (!rl.allowed) {
    await sendMessage(chatId, t(lang, 'errors.rate_limit', { limit }));
    return;
  }

  if (kind === 'copy') {
    const text = await formatEstimateText(estimateId, lang);
    await sendMessage(chatId, `<pre>${escapeHtml(text)}</pre>`);
    return;
  }
  if (kind === 'word') {
    const buf = await generateWord(estimateId, lang);
    await sendDocument(chatId,
      { buffer: buf, filename: `estimate_${estimateId}.docx`, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { caption: t(lang, 'estimate.exported_word') }
    );
    return;
  }
  if (kind === 'pdf') {
    const buf = await generatePdf(estimateId, lang);
    await sendDocument(chatId,
      { buffer: buf, filename: `estimate_${estimateId}.pdf`, mime: 'application/pdf' },
      { caption: t(lang, 'estimate.exported_pdf') }
    );
    return;
  }
}

async function showMyEstimates(chatId, lang, msgId) {
  const { data } = await supabase
    .from('estimate_calculations').select('id, city, country, total_grand, currency, created_at')
    .eq('telegram_id', chatId).eq('is_archived', false)
    .order('created_at', { ascending: false }).limit(10);
  if (!data?.length) {
    await editMessageText(chatId, msgId, t(lang, 'my_estimates.empty'), { reply_markup: backButton(lang) });
    return;
  }
  const rows = data.map(e => [{
    text: `#${e.id} • ${Number(e.total_grand).toFixed(0)} ${e.currency} • ${e.city || e.country || '—'}`,
    callback_data: `show:${e.id}`
  }]);
  rows.push([{ text: t(lang, 'common.back'), callback_data: 'main' }]);
  await editMessageText(chatId, msgId, t(lang, 'my_estimates.title'), {
    reply_markup: { inline_keyboard: rows }
  });
}

async function sendSubscriptionStatus(chatId, lang, msgId = null) {
  const s = await getSubscriptionStatus(chatId);
  const text = s.active
    ? t(lang, 'subscription.active', {
        plan: s.plan,
        days: s.days_left,
        expires: new Date(s.expires_at).toISOString().slice(0, 10)
      })
    : t(lang, 'subscription.expired');
  const kb = s.active ? backButton(lang) : planSelector(lang);
  if (msgId) {
    await editMessageText(chatId, msgId, text, { reply_markup: kb });
  } else {
    await sendMessage(chatId, text, { reply_markup: kb });
  }
}

async function handlePromoInput(chatId, text, lang) {
  const res = await activatePromo(chatId, text);
  await clearDraft(chatId);
  if (res.ok) {
    await sendMessage(chatId, t(lang, 'promo.ok', { days: res.bonus_days }), { reply_markup: mainMenu(lang) });
  } else {
    await sendMessage(chatId, t(lang, `promo.err_${res.error}`), { reply_markup: mainMenu(lang) });
  }
}

async function handlePreciseInput(chatId, text, lang, draft) {
  const id = draft?.data?.estimateId;
  const { data: calc } = await supabase
    .from('estimate_calculations').select('*').eq('id', id).maybeSingle();
  await supabase.from('estimate_precise_requests').insert({
    telegram_id: chatId,
    calculation_id: id || null,
    country: calc?.country || null,
    city: calc?.city || null,
    object_type: calc?.object_type || null,
    area: calc?.object_area || null,
    works_summary: text,
    status: 'new'
  });
  await clearDraft(chatId);
  await sendMessage(chatId, t(lang, 'precise.ok', {
    support: process.env.SUPPORT_USERNAME || '@fortyna1239'
  }), { reply_markup: mainMenu(lang) });
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
