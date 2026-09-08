// lib/telegram.js
// Thin fetch-based wrappers around the Telegram Bot API.
// No npm dependency; each function returns the parsed JSON `result`
// (or throws if `ok` is false — callers may catch to keep the webhook 200 OK).

const API_BASE = 'https://api.telegram.org';

function token() {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  return t;
}

async function callApi(method, payload, { silent = false } = {}) {
  const url = `${API_BASE}/bot${token()}/${method}`;
  let res, data;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    data = await res.json();
  } catch (e) {
    if (silent) return null;
    throw new Error(`telegram ${method} network error: ${e.message}`);
  }
  if (!data.ok) {
    if (silent) return null;
    const err = new Error(`telegram ${method} failed: ${data.description || 'unknown'}`);
    err.code = data.error_code;
    err.description = data.description;
    throw err;
  }
  return data.result;
}

// ---- multipart helper (used only by sendDocument with a Buffer) --------
async function callApiMultipart(method, fields, fileField, file) {
  const url = `${API_BASE}/bot${token()}/${method}`;
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    form.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  // Node 20's global FormData/Blob work with fetch.
  const blob = new Blob([file.buffer], { type: file.mime || 'application/octet-stream' });
  form.append(fileField, blob, file.filename || 'file.bin');
  const res = await fetch(url, { method: 'POST', body: form });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`telegram ${method} (multipart) failed: ${data.description || 'unknown'}`);
  }
  return data.result;
}

// ---- public API --------------------------------------------------------

export function sendMessage(chatId, text, extra = {}) {
  return callApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...extra
  }, { silent: true });
}

export function editMessageText(chatId, messageId, text, extra = {}) {
  return callApi('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...extra
  }, { silent: true });
}

export function answerCallbackQuery(callbackQueryId, text = '', extra = {}) {
  return callApi('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    ...extra
  }, { silent: true });
}

export function answerPreCheckoutQuery(preCheckoutQueryId, ok, errorMessage) {
  const payload = { pre_checkout_query_id: preCheckoutQueryId, ok: !!ok };
  if (!ok && errorMessage) payload.error_message = errorMessage;
  return callApi('answerPreCheckoutQuery', payload, { silent: true });
}

export function sendInvoice(chatId, invoice) {
  return callApi('sendInvoice', {
    chat_id: chatId,
    ...invoice
  }, { silent: true });
}

export function sendDocument(chatId, file, extra = {}) {
  // `file` = { buffer, filename, mime }
  const fields = { chat_id: chatId, ...extra };
  return callApiMultipart('sendDocument', fields, 'document', file);
}

export function setMyCommands(commands, languageCode) {
  const payload = { commands };
  if (languageCode) payload.language_code = languageCode;
  return callApi('setMyCommands', payload, { silent: true });
}

export function setWebhook(url, secretToken) {
  return callApi('setWebhook', {
    url,
    secret_token: secretToken,
    allowed_updates: ['message', 'callback_query', 'pre_checkout_query']
  });
}

export function getMe() {
  return callApi('getMe');
}

export { callApi as _rawCall };
