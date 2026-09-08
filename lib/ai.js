// lib/ai.js
// AI-powered free-text parser for renovation task descriptions.
//
// Order:
//   1) Groq (openai/gpt-oss-120b) — free tier, fast.
//   2) OpenAI (gpt-4o-mini)      — fallback if OPENAI_API_KEY is set.
//   3) { works: [], needs_manual: true } — if neither succeeds.
//
// Always requests strict JSON via response_format=json_object.

const SYSTEM_PROMPT = [
  'You are a construction estimator assistant. Given a user description of renovation work in any language, extract structured work items with quantities.',
  '',
  'Return ONLY valid JSON with this shape:',
  '{"works":[{"work_key":string|null,"work_name":string,"unit":"m2"|"linear_m"|"piece"|"point"|"m3"|"trip","quantity":number|null,"confidence":"high"|"medium"|"low"}],"clarifying_questions":[string],"detected_area":number|null,"detected_object_type":string|null}',
  '',
  'CATALOG (use these work_key values — never invent new ones):',
  '  Demolition: demo_tile(m2), demo_screed(m2), demo_partition(m2), demo_floor(m2)',
  '  Walls: wall_plaster(m2), wall_putty(m2), wall_prime(m2), wall_paint(m2)',
  '  Ceiling: ceiling_paint(m2), ceiling_gypsum(m2), ceiling_stretch(m2)',
  '  Tiling: tile_floor(m2), tile_wall(m2), tile_grout(m2)',
  '  Flooring: floor_screed(m2), floor_laminate(m2), floor_parquet(m2), floor_vinyl(m2), floor_skirting(linear_m)',
  '  Drywall: gypsum_partition(m2), gypsum_box(linear_m), gypsum_slope(linear_m)',
  '  Electrical: elec_socket(point), elec_light(point), elec_panel(piece), elec_cable(linear_m)',
  '  Plumbing: plumb_bathtub(piece), plumb_toilet(piece), plumb_shower(piece), plumb_sink(piece), plumb_water(point), plumb_sewer(point)',
  '  Doors: door_install(piece), door_remove(piece)',
  '  Windows: window_install(piece), window_slope(linear_m), window_sill(linear_m)',
  '  Ventilation: vent_hood(piece), vent_duct(linear_m)',
  '  Waste: waste_removal(trip)',
  '  Special: heat_floor_elec(m2), heat_floor_water(m2)',
  '',
  'IMPORTANT — TURNKEY RENOVATION ({"под ключ", "turnkey", "pod kljuc", "llave en mano", "clé en main", "chiavi in mano", "schlüsselfertig"}):',
  'When user asks for full/turnkey renovation of an apartment of N m², decompose into ALL standard works with sensible quantities. Do NOT ask clarifying questions — build a complete estimate. Use these quantity heuristics (S = floor area in m²):',
  '  - Wall area ≈ S × 3.0 (perimeter × height)',
  '  - Bathroom area ≈ S × 0.10 (10% of apartment)',
  '  - Number of doors ≈ round(S / 12)  (min 3)',
  '  - Number of electrical sockets/switches ≈ round(S × 0.8)  (min 20)',
  '  - Number of lighting points ≈ round(S / 6)  (min 6)',
  '',
  'STANDARD TURNKEY DECOMPOSITION (mid-tier / комфорт-класс) for N m² apartment:',
  '  demo_floor: N m² | demo_screed: N m² | waste_removal: round(N/15) trips',
  '  floor_screed: N m² | wall_plaster: N*3 m² | wall_putty: N*3 m² | wall_prime: N*3 m² | wall_paint: N*2.4 m²',
  '  ceiling_stretch: N m² | tile_floor: N*0.1 m² | tile_wall: N*0.5 m² | tile_grout: N*0.6 m²',
  '  floor_laminate: N*0.9 m² | floor_skirting: N*1.2 linear_m',
  '  elec_socket: round(N*0.8) points | elec_light: round(N/6) points | elec_cable: N*3 linear_m | elec_panel: 1 piece',
  '  plumb_water: 4 points | plumb_sewer: 3 points | plumb_toilet: 1 | plumb_bathtub: 1 | plumb_sink: 2',
  '  door_install: round(N/12) pieces | vent_hood: 1 piece',
  '',
  'If no clear match, set work_key to null with a work_name in the user\'s language.',
  'Write work_name in the user\'s language.',
  'Set clarifying_questions to [] when the user gave enough info (e.g. area + "под ключ"). Only ask when critical info is missing.',
  'Never leave works empty for a turnkey request with a stated area.'
].join('\n');

const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const GROQ_MODEL   = 'openai/gpt-oss-120b';
const OPENAI_MODEL = 'gpt-4o-mini';

const EMPTY_RESULT = {
  works: [],
  clarifying_questions: [],
  detected_area: null,
  detected_object_type: null,
  needs_manual: true
};

function userPrompt(userText, langCode, country, city) {
  return [
    `User language: ${langCode || 'unknown'}`,
    `Country: ${country || 'unknown'}`,
    `City: ${city || 'unknown'}`,
    '',
    'User description:',
    userText || ''
  ].join('\n');
}

async function callProvider(url, apiKey, model, userText, langCode, country, city, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userPrompt(userText, langCode, country, city) }
        ]
      }),
      signal: controller.signal
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty AI response');
    return JSON.parse(content);
  } finally {
    clearTimeout(timer);
  }
}

function normalizeResult(raw) {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_RESULT };
  const works = Array.isArray(raw.works) ? raw.works : [];
  const clean = works
    .filter(w => w && typeof w === 'object' && w.work_name)
    .map(w => ({
      work_key: w.work_key || null,
      work_name: String(w.work_name).slice(0, 200),
      unit: ['m2', 'linear_m', 'piece', 'point', 'm3', 'trip'].includes(w.unit) ? w.unit : 'piece',
      quantity: (typeof w.quantity === 'number' && isFinite(w.quantity)) ? w.quantity : null,
      confidence: ['high', 'medium', 'low'].includes(w.confidence) ? w.confidence : 'medium'
    }));
  return {
    works: clean,
    clarifying_questions: Array.isArray(raw.clarifying_questions)
      ? raw.clarifying_questions.filter(q => typeof q === 'string').slice(0, 5)
      : [],
    detected_area: typeof raw.detected_area === 'number' ? raw.detected_area : null,
    detected_object_type: typeof raw.detected_object_type === 'string' ? raw.detected_object_type : null,
    needs_manual: clean.length === 0
  };
}

export async function parseTaskWithAI(userText, langCode, country, city) {
  if (!userText || !userText.trim()) return { ...EMPTY_RESULT };

  const groqKey   = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  // 1) Try Groq
  if (groqKey) {
    try {
      const raw = await callProvider(GROQ_URL, groqKey, GROQ_MODEL, userText, langCode, country, city);
      return normalizeResult(raw);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[ai] Groq failed: ${e.message}. Falling back...`);
    }
  }

  // 2) Try OpenAI
  if (openaiKey) {
    try {
      const raw = await callProvider(OPENAI_URL, openaiKey, OPENAI_MODEL, userText, langCode, country, city);
      return normalizeResult(raw);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[ai] OpenAI failed: ${e.message}.`);
    }
  }

  // 3) No AI available
  return { ...EMPTY_RESULT };
}

export default { parseTaskWithAI };
