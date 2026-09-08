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

// Detect turnkey renovation + area in any of 12 supported languages, then return a
// deterministic decomposition bypassing the AI. This is much more reliable than
// hoping the LLM produces the full 20-line breakdown from a system prompt.
const TURNKEY_PATTERNS = [
  /под\s*ключ/i,          // ru, uk
  /turnkey|turn[-\s]?key/i, // en
  /pod\s*klju[cč]/i,       // sr
  /llave\s*en\s*mano/i,    // es
  /cl[eé]\s*en\s*main/i,   // fr
  /chiavi\s*in\s*mano/i,   // it
  /schl[üu]sselfertig/i,   // de
  /chave\s*na\s*m[aã]o/i,  // pt
  /anahtar\s*teslim/i,     // tr
  /تسليم\s*المفتاح/,      // ar
  /交\s*钥\s*匙|全包/,      // zh
  /повний\s*ремонт/i,       // uk alt
  /капитальный\s*ремонт/i,   // ru alt
  /полный\s*ремонт/i         // ru alt
];
function isTurnkey(text) {
  return TURNKEY_PATTERNS.some(re => re.test(text));
}
function detectAreaFromText(text) {
  const patterns = [
    /(\d+(?:[\.,]\d+)?)\s*(?:м2|м²|m2|m²|кв\.?\s*м|sq\.?\s*m|квадрат)/i,
    /(\d+(?:[\.,]\d+)?)\s*(?:метр|meter|метар)/i
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = parseFloat(m[1].replace(',', '.'));
      if (isFinite(n) && n > 0 && n < 10000) return n;
    }
  }
  // bare number 10-500 assumed to be m²
  const bare = text.match(/\b(\d{2,3})\b/);
  if (bare) {
    const n = parseInt(bare[1], 10);
    if (n >= 10 && n <= 500) return n;
  }
  return null;
}
function turnkeyDecomposition(area, langCode) {
  const N = area;
  const r = (x) => Math.round(x);
  const items = [
    { work_key: 'demo_floor',      unit: 'm2',       quantity: N,           conf: 'high' },
    { work_key: 'demo_screed',     unit: 'm2',       quantity: N,           conf: 'high' },
    { work_key: 'waste_removal',   unit: 'trip',     quantity: Math.max(1, r(N/15)), conf: 'high' },
    { work_key: 'floor_screed',    unit: 'm2',       quantity: N,           conf: 'high' },
    { work_key: 'wall_plaster',    unit: 'm2',       quantity: r(N*3),      conf: 'high' },
    { work_key: 'wall_putty',      unit: 'm2',       quantity: r(N*3),      conf: 'high' },
    { work_key: 'wall_prime',      unit: 'm2',       quantity: r(N*3),      conf: 'high' },
    { work_key: 'wall_paint',      unit: 'm2',       quantity: r(N*2.4),    conf: 'high' },
    { work_key: 'ceiling_stretch', unit: 'm2',       quantity: N,           conf: 'high' },
    { work_key: 'tile_floor',      unit: 'm2',       quantity: Math.max(3, r(N*0.1)), conf: 'high' },
    { work_key: 'tile_wall',       unit: 'm2',       quantity: Math.max(8, r(N*0.5)), conf: 'high' },
    { work_key: 'tile_grout',      unit: 'm2',       quantity: Math.max(11, r(N*0.6)), conf: 'high' },
    { work_key: 'floor_laminate',  unit: 'm2',       quantity: r(N*0.9),    conf: 'high' },
    { work_key: 'floor_skirting',  unit: 'linear_m', quantity: r(N*1.2),    conf: 'high' },
    { work_key: 'elec_socket',     unit: 'point',    quantity: Math.max(20, r(N*0.8)), conf: 'high' },
    { work_key: 'elec_light',      unit: 'point',    quantity: Math.max(6,  r(N/6)),   conf: 'high' },
    { work_key: 'elec_cable',      unit: 'linear_m', quantity: r(N*3),      conf: 'high' },
    { work_key: 'elec_panel',      unit: 'piece',    quantity: 1,           conf: 'high' },
    { work_key: 'plumb_water',     unit: 'point',    quantity: 4,           conf: 'high' },
    { work_key: 'plumb_sewer',     unit: 'point',    quantity: 3,           conf: 'high' },
    { work_key: 'plumb_toilet',    unit: 'piece',    quantity: 1,           conf: 'high' },
    { work_key: 'plumb_bathtub',   unit: 'piece',    quantity: 1,           conf: 'high' },
    { work_key: 'plumb_sink',      unit: 'piece',    quantity: 2,           conf: 'high' },
    { work_key: 'door_install',    unit: 'piece',    quantity: Math.max(3, r(N/12)), conf: 'high' },
    { work_key: 'vent_hood',       unit: 'piece',    quantity: 1,           conf: 'high' }
  ];
  // Localized names by language (fallback to Russian)
  const nameByLang = {
    ru: {
      demo_floor: 'Демонтаж старого напольного покрытия',
      demo_screed: 'Демонтаж старой стяжки',
      waste_removal: 'Вывоз строительного мусора',
      floor_screed: 'Устройство новой стяжки пола',
      wall_plaster: 'Штукатурка стен',
      wall_putty: 'Шпаклёвка стен',
      wall_prime: 'Грунтовка стен',
      wall_paint: 'Покраска стен',
      ceiling_stretch: 'Натяжной потолок',
      tile_floor: 'Укладка плитки на пол (санузел)',
      tile_wall: 'Укладка плитки на стены (санузел)',
      tile_grout: 'Затирка плиточных швов',
      floor_laminate: 'Укладка ламината',
      floor_skirting: 'Установка плинтуса',
      elec_socket: 'Электроточка (розетка/выключатель)',
      elec_light: 'Точка освещения',
      elec_cable: 'Прокладка электрокабеля',
      elec_panel: 'Монтаж электрощита',
      plumb_water: 'Разводка водопровода (точка)',
      plumb_sewer: 'Разводка канализации (точка)',
      plumb_toilet: 'Установка унитаза',
      plumb_bathtub: 'Установка ванны',
      plumb_sink: 'Установка раковины',
      door_install: 'Установка межкомнатной двери',
      vent_hood: 'Установка вытяжки'
    },
    en: {
      demo_floor: 'Old floor demolition', demo_screed: 'Old screed demolition',
      waste_removal: 'Construction waste removal', floor_screed: 'New floor screed',
      wall_plaster: 'Wall plastering', wall_putty: 'Wall putty', wall_prime: 'Wall priming',
      wall_paint: 'Wall painting', ceiling_stretch: 'Stretch ceiling',
      tile_floor: 'Floor tiling (bathroom)', tile_wall: 'Wall tiling (bathroom)',
      tile_grout: 'Tile grouting', floor_laminate: 'Laminate installation',
      floor_skirting: 'Skirting installation', elec_socket: 'Socket/switch point',
      elec_light: 'Lighting point', elec_cable: 'Electric cable routing',
      elec_panel: 'Electric panel installation', plumb_water: 'Water pipe point',
      plumb_sewer: 'Sewer pipe point', plumb_toilet: 'Toilet installation',
      plumb_bathtub: 'Bathtub installation', plumb_sink: 'Sink installation',
      door_install: 'Interior door installation', vent_hood: 'Kitchen hood installation'
    }
  };
  const names = nameByLang[langCode] || nameByLang.ru;
  return items.map(it => ({
    work_key: it.work_key,
    work_name: names[it.work_key] || it.work_key,
    unit: it.unit,
    quantity: it.quantity,
    confidence: it.conf
  }));
}

export async function parseTaskWithAI(userText, langCode, country, city) {
  if (!userText || !userText.trim()) return { ...EMPTY_RESULT };

  // Fast path: turnkey renovation with detectable area -> deterministic decomposition
  if (isTurnkey(userText)) {
    const area = detectAreaFromText(userText);
    if (area) {
      const works = turnkeyDecomposition(area, langCode);
      return {
        works,
        clarifying_questions: [],
        detected_area: area,
        detected_object_type: 'apartment',
        needs_manual: false
      };
    }
  }

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
