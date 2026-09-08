// lib/supabase.js
// Single Supabase service-role client. Reused across serverless invocations.

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  // eslint-disable-next-line no-console
  console.warn('[supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing');
}

export const supabase = createClient(url || 'http://localhost', key || 'anon', {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { 'x-application': 'smeta1239-bot' } }
});

export default supabase;
