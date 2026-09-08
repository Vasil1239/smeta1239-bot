// lib/admin.js
// Admin panel: stats, custom-work requests, precise-estimate requests.
// Access is restricted to ADMIN_TELEGRAM_CHAT_ID.

import { supabase } from './supabase.js';
import { sendMessage } from './telegram.js';

export function isAdmin(telegramId) {
  const admin = process.env.ADMIN_TELEGRAM_CHAT_ID;
  return admin && String(telegramId) === String(admin);
}

function adminKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📊 Stats',            callback_data: 'admin:stats' }],
      [{ text: '🧱 Custom requests',  callback_data: 'admin:custom' }],
      [{ text: '📋 Precise requests', callback_data: 'admin:precise' }],
      [{ text: '💳 Recent payments',  callback_data: 'admin:payments' }]
    ]
  };
}

export async function handleAdminEntry(chatId) {
  if (!isAdmin(chatId)) return;
  await sendMessage(chatId, '🛠 <b>Admin panel</b>\nChoose a section:', {
    reply_markup: adminKeyboard()
  });
}

export async function handleAdminCallback(chatId, action) {
  if (!isAdmin(chatId)) return;

  if (action === 'stats') {
    const [{ count: users }, { count: pays }] = await Promise.all([
      supabase.from('estimate_users').select('*', { count: 'exact', head: true }),
      supabase.from('estimate_payments').select('*', { count: 'exact', head: true })
    ]);

    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: recentPays } = await supabase
      .from('estimate_payments').select('total_amount')
      .gte('created_at', since);
    const mrrStars = (recentPays || []).reduce((s, p) => s + Number(p.total_amount || 0), 0);

    const { count: activeSubs } = await supabase
      .from('estimate_subscriptions').select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    const { count: estimates } = await supabase
      .from('estimate_calculations').select('*', { count: 'exact', head: true });

    await sendMessage(chatId,
      `📊 <b>Stats</b>\n` +
      `Users: <b>${users || 0}</b>\n` +
      `Active subs: <b>${activeSubs || 0}</b>\n` +
      `Payments total: <b>${pays || 0}</b>\n` +
      `Stars (30d): <b>${mrrStars}</b>\n` +
      `Estimates: <b>${estimates || 0}</b>`,
      { reply_markup: adminKeyboard() }
    );
    return;
  }

  if (action === 'custom') {
    const { data: rows } = await supabase
      .from('estimate_custom_work_requests').select('*')
      .eq('status', 'new')
      .order('created_at', { ascending: false })
      .limit(20);
    if (!rows?.length) {
      await sendMessage(chatId, '✅ No new custom-work requests.', { reply_markup: adminKeyboard() });
      return;
    }
    const lines = rows.map(r =>
      `#${r.id} • ${r.work_name_raw}  (${r.country || '?'}, ${r.city || '?'})`
    );
    await sendMessage(chatId,
      `🧱 <b>New custom-work requests (${rows.length})</b>\n\n${lines.join('\n')}`,
      { reply_markup: adminKeyboard() }
    );
    return;
  }

  if (action === 'precise') {
    const { data: rows } = await supabase
      .from('estimate_precise_requests').select('*')
      .eq('status', 'new')
      .order('created_at', { ascending: false })
      .limit(20);
    if (!rows?.length) {
      await sendMessage(chatId, '✅ No new precise-estimate requests.', { reply_markup: adminKeyboard() });
      return;
    }
    const lines = rows.map(r =>
      `#${r.id} • tg:${r.telegram_id} • ${r.country || '?'}/${r.city || '?'} • ${r.area || '?'} m²`
    );
    await sendMessage(chatId,
      `📋 <b>New precise-estimate requests (${rows.length})</b>\n\n${lines.join('\n')}`,
      { reply_markup: adminKeyboard() }
    );
    return;
  }

  if (action === 'payments') {
    const { data: rows } = await supabase
      .from('estimate_payments').select('*')
      .order('created_at', { ascending: false })
      .limit(15);
    if (!rows?.length) {
      await sendMessage(chatId, '💳 No payments yet.', { reply_markup: adminKeyboard() });
      return;
    }
    const lines = rows.map(r =>
      `${r.plan} • ${r.total_amount} ${r.currency} • tg:${r.telegram_id} • ${new Date(r.created_at).toISOString().slice(0, 10)}`
    );
    await sendMessage(chatId,
      `💳 <b>Recent payments</b>\n\n${lines.join('\n')}`,
      { reply_markup: adminKeyboard() }
    );
    return;
  }
}
