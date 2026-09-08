// lib/ai.js
// AI-powered free-text parser for renovation task descriptions.
//
// Order:
//   1) Groq (llama-3.3-70b-versatile) — free tier, fast.
//   2) OpenAI (gpt-4o-mini)          — fallback if OPENAI_API_KEY is set.
//   3) { works: [], needs_manual: true } — if neither succeeds.
//
// Always requests strict JSON via response_format=json_object.

const SYSTEM_PROMPT = [
  'You are a construction estimator assistant. Given a user description of renovation work in any language, extract structured work items.',
  'Return ONLY valid JSON: {"works": [{"work_key": string|null, "work_name": string, "unit": "m2"|"linear_m"|"piece"|"point"|"m3"|"trip", "quantity": number|null, "confidence": "high"|"medium"|"low"}], "clarifying_questions": [string], "detected_area": number|null, "detected_object_type": string|null}.',
  'Use work_key from this catalog if match found: tile_floor, tile_wall, wall_paint, wall_plaster, wall_putty, floor_screed, floor_laminate, floor_parquet, elec_socket, elec_light, plumb_water, plumb_sewer, plumb_bathtub, plumb_toilet, plumb_shower, plumb_sink, door_install, window_install, ceiling_paint, ceiling_gypsum, demo_tile, demo_screed, gypsum_partition, waste_removal, heat_floor_elec, heat_floor_water.',
  'If no match, set work_key to null. Reply in the user\'s language for work_name.'
].join(' ');

const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const GROQ_MODEL   = 'llama-3.3-70b-versatile';
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
