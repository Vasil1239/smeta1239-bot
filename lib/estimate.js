// lib/estimate.js
// Estimate calculation engine: turns parsed tasks into a full priced estimate.

import { supabase } from './supabase.js';
import { countryToCurrency, RESERVE_PERCENT_DEFAULT, PRICE_MODES } from './constants.js';

/**
 * Look up a price for a work_key given country/city/currency with a fallback:
 *   city+currency → country+currency → any city for country+currency → null.
 *
 * Returns { labor, materials, price_level, source } where labor/materials
 * are objects {min, recommended, max, currency, city, country} or null if unavailable.
 */
export async function getPriceForWork(workKey, country, city, currency) {
  if (!workKey || !country) return { labor: null, materials: null };

  // ---- Labor ----
  const laborRow = await pickPriceRow('estimate_price_ranges', workKey, country, city, currency);

  // ---- Materials ----
  const matRow = await pickPriceRow('estimate_material_price_ranges', workKey, country, city, currency);

  const shape = (r, prefix) => r ? {
    min:          Number(r[`${prefix}_min`]),
    recommended:  Number(r[`${prefix}_recommended`]),
    max:          Number(r[`${prefix}_max`]),
    currency:     r.currency,
    city:         r.city,
    country:      r.country,
    source:       r.source
  } : null;

  return {
    labor: shape(laborRow, 'labor'),
    materials: shape(matRow, 'materials')
  };
}

async function pickPriceRow(table, workKey, country, city, currency) {
  // 1) exact city + currency
  if (city) {
    const q1 = await supabase.from(table).select('*')
      .eq('work_key', workKey).eq('country', country).eq('city', city)
      .eq('currency', currency).eq('is_active', true).maybeSingle();
    if (q1.data) return q1.data;
  }
  // 2) country-level (city IS NULL) + currency
  const q2 = await supabase.from(table).select('*')
    .eq('work_key', workKey).eq('country', country).is('city', null)
    .eq('currency', currency).eq('is_active', true).maybeSingle();
  if (q2.data) return q2.data;

  // 3) any city, requested currency
  const q3 = await supabase.from(table).select('*')
    .eq('work_key', workKey).eq('country', country).eq('currency', currency)
    .eq('is_active', true).limit(1);
  if (q3.data && q3.data.length) return q3.data[0];

  // 4) any row for country
  const q4 = await supabase.from(table).select('*')
    .eq('work_key', workKey).eq('country', country)
    .eq('is_active', true).limit(1);
  if (q4.data && q4.data.length) return q4.data[0];

  return null;
}

function pickLevel(range, mode) {
  if (!range) return null;
  const key = PRICE_MODES.includes(mode) ? mode : 'recommended';
  return Number(range[key]);
}

function round2(n) { return Math.round(Number(n) * 100) / 100; }

/**
 * Build an estimate from parsed tasks.
 * @param {number} telegramId
 * @param {Array<{work_key,work_name,unit,quantity}>} tasks
 * @param {string} country
 * @param {string} city
 * @param {'min'|'recommended'|'max'} priceMode
 * @param {object} extra { title, object_type, object_area, raw_user_text, reserve_percent }
 * @returns {Promise<{estimateId:number, uuid:string, currency:string, totals:object, items:Array}>}
 */
export async function buildEstimate(telegramId, tasks, country, city, priceMode = 'recommended', extra = {}) {
  const currency = countryToCurrency(country);
  const reserve = extra.reserve_percent ?? RESERVE_PERCENT_DEFAULT;

  // Create the calculation shell first.
  const { data: calc, error: cErr } = await supabase.from('estimate_calculations').insert({
    telegram_id: telegramId,
    title: extra.title || null,
    object_type: extra.object_type || null,
    object_area: extra.object_area || null,
    country, city,
    currency,
    price_mode: priceMode,
    reserve_percent: reserve,
    raw_user_text: extra.raw_user_text || null
  }).select().single();
  if (cErr) throw cErr;

  const items = [];
  let totalLabor = 0;
  let totalMat = 0;

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i] || {};
    if (!task.work_name) continue;

    const qty = Number(task.quantity) > 0 ? Number(task.quantity) : 1;
    let priceInfo = { labor: null, materials: null };
    if (task.work_key) {
      priceInfo = await getPriceForWork(task.work_key, country, city, currency);
    }

    const laborUnit = pickLevel(priceInfo.labor, priceMode);
    const matUnit   = pickLevel(priceInfo.materials, priceMode);

    const laborTotal = laborUnit != null ? round2(laborUnit * qty) : null;
    const matTotal   = matUnit   != null ? round2(matUnit   * qty) : null;

    if (laborTotal) totalLabor += laborTotal;
    if (matTotal)   totalMat   += matTotal;

    items.push({
      calculation_id: calc.id,
      position: i,
      work_key: task.work_key || null,
      work_name: task.work_name,
      unit: task.unit || 'piece',
      quantity: qty,
      labor_price: laborUnit,
      labor_total: laborTotal,
      materials_price: matUnit,
      materials_total: matTotal,
      price_level: priceMode,
      price_needs_clarification: !task.work_key || laborUnit == null,
      notes: null
    });

    // Log custom work requests for the admin to review later.
    if (!task.work_key) {
      await supabase.from('estimate_custom_work_requests').insert({
        telegram_id: telegramId,
        work_name_raw: task.work_name,
        unit_guess: task.unit || null,
        country, city,
        language_code: null,
        status: 'new'
      });
    }
  }

  if (items.length) {
    const { error: iErr } = await supabase.from('estimate_calculation_items').insert(items);
    if (iErr) throw iErr;
  }

  const totalReserve = round2((totalLabor + totalMat) * (Number(reserve) / 100));
  const totalGrand = round2(totalLabor + totalMat + totalReserve);

  await supabase.from('estimate_calculations').update({
    total_labor: round2(totalLabor),
    total_materials: round2(totalMat),
    total_reserve: totalReserve,
    total_grand: totalGrand
  }).eq('id', calc.id);

  return {
    estimateId: calc.id,
    uuid: calc.uuid,
    currency,
    totals: {
      labor: round2(totalLabor),
      materials: round2(totalMat),
      reserve: totalReserve,
      grand: totalGrand,
      reserve_percent: Number(reserve)
    },
    items
  };
}

/** Recompute totals & item prices when the price mode changes. */
export async function recalculateEstimate(estimateId, priceMode = 'recommended') {
  if (!PRICE_MODES.includes(priceMode)) priceMode = 'recommended';

  const { data: calc } = await supabase
    .from('estimate_calculations').select('*').eq('id', estimateId).maybeSingle();
  if (!calc) return null;

  const { data: items } = await supabase
    .from('estimate_calculation_items').select('*').eq('calculation_id', estimateId)
    .order('position', { ascending: true });

  let totalLabor = 0, totalMat = 0;

  for (const it of items || []) {
    let priceInfo = { labor: null, materials: null };
    if (it.work_key) {
      priceInfo = await getPriceForWork(it.work_key, calc.country, calc.city, calc.currency);
    }
    const laborUnit = pickLevel(priceInfo.labor, priceMode);
    const matUnit   = pickLevel(priceInfo.materials, priceMode);
    const qty = Number(it.quantity) || 0;
    const laborTotal = laborUnit != null ? round2(laborUnit * qty) : null;
    const matTotal   = matUnit   != null ? round2(matUnit   * qty) : null;

    if (laborTotal) totalLabor += laborTotal;
    if (matTotal)   totalMat   += matTotal;

    await supabase.from('estimate_calculation_items').update({
      labor_price: laborUnit,
      labor_total: laborTotal,
      materials_price: matUnit,
      materials_total: matTotal,
      price_level: priceMode
    }).eq('id', it.id);
  }

  const reservePct = Number(calc.reserve_percent) || RESERVE_PERCENT_DEFAULT;
  const totalReserve = round2((totalLabor + totalMat) * (reservePct / 100));
  const totalGrand = round2(totalLabor + totalMat + totalReserve);

  await supabase.from('estimate_calculations').update({
    price_mode: priceMode,
    total_labor: round2(totalLabor),
    total_materials: round2(totalMat),
    total_reserve: totalReserve,
    total_grand: totalGrand
  }).eq('id', estimateId);

  return {
    totals: {
      labor: round2(totalLabor),
      materials: round2(totalMat),
      reserve: totalReserve,
      grand: totalGrand,
      reserve_percent: reservePct
    }
  };
}

export async function getEstimate(estimateId) {
  const { data: calc } = await supabase
    .from('estimate_calculations').select('*').eq('id', estimateId).maybeSingle();
  if (!calc) return null;
  const { data: items } = await supabase
    .from('estimate_calculation_items').select('*').eq('calculation_id', estimateId)
    .order('position', { ascending: true });
  return { calc, items: items || [] };
}
