// api/checkprices.js — check what prices exist for Moscow / RUB
import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const provided = req.query?.secret || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (secret && provided !== secret) return res.status(401).json({ ok: false });

  const out = {};
  // Discover schema — try to list all tables via a data query
  const tableTests = ['estimate_plans', 'estimate_price_ranges', 'estimate_material_price_ranges', 'estimate_works', 'estimate_work_catalog', 'estimate_works_catalog', 'estimate_materials', 'estimate_users', 'estimate_estimates', 'estimate_subscriptions', 'estimate_payments'];
  out.tables_found = {};
  for (const tbl of tableTests) {
    const { data, error, count } = await supabase.from(tbl).select('*', { count: 'exact', head: false }).limit(1);
    if (error) {
      out.tables_found[tbl] = `err: ${error.message}`;
    } else {
      out.tables_found[tbl] = { rows: count, sample: data?.[0] || null };
    }
  }

  // What countries do we have labor for?
  const { data: labor, error: le } = await supabase.from('estimate_price_ranges')
    .select('work_key,country,city,currency,labor_recommended,is_active');
  out.labor_all_count = labor?.length;
  out.labor_error = le?.message;
  out.labor_countries = [...new Set((labor||[]).map(r=>r.country))];
  out.labor_RU = (labor||[]).filter(r=>r.country==='Russia' || r.country==='RU');
  out.labor_sample = labor?.slice(0, 5);

  const { data: mat, error: me } = await supabase.from('estimate_material_price_ranges')
    .select('work_key,country,city,currency,materials_recommended,is_active');
  out.materials_all_count = mat?.length;
  out.materials_error = me?.message;
  out.materials_countries = [...new Set((mat||[]).map(r=>r.country))];

  const { data: works, error: we } = await supabase.from('estimate_works').select('*');
  out.works_count = works?.length;
  out.works_error = we?.message;
  out.works_sample = works?.slice(0, 5);
  // Full catalog
  const { data: catalog } = await supabase.from('estimate_work_catalog').select('work_key,work_name,unit,category');
  out.catalog = catalog;
  return res.status(200).json(out);
}
