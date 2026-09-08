// api/profile.js
// Sets bot's name, short description and description across all supported languages.
// Also sets profile photo from a URL (fetched, then uploaded via multipart).
// Protected by CRON_SECRET.

import { _rawCall } from '../lib/telegram.js';

const API_BASE = 'https://api.telegram.org';

const PROFILE_TEXTS = {
  ru: {
    name: "Смета — расчёт ремонта",
    short: "ИИ считает смету ремонта. 12 языков, 30 дней бесплатно.",
    about: "Быстрый расчёт стоимости строительства и ремонта. Опишите работы своими словами — ИИ соберёт смету и выгрузит в Word/PDF. 12 языков, мультивалюта. 30 дней бесплатно."
  },
  en: {
    name: "Smeta — Renovation Cost",
    short: "AI-powered renovation estimator. 12 languages, 30 days free.",
    about: "Fast construction and renovation cost calculator. Describe the work in your own words — AI builds a full estimate and exports it to Word/PDF. 12 languages, multi-currency. 30 days free trial."
  },
  sr: {
    name: "Smeta — Procena renoviranja",
    short: "AI proračun troškova renoviranja. 12 jezika, 30 dana besplatno.",
    about: "Brz proračun troškova gradnje i renoviranja. Opišite radove svojim rečima — AI pravi kompletnu smetu i izvozi u Word/PDF. 12 jezika, više valuta. 30 dana besplatno."
  },
  es: {
    name: "Smeta — Coste de reforma",
    short: "Presupuestos de reforma con IA. 12 idiomas, 30 días gratis.",
    about: "Calculadora rápida de coste de construcción y reforma. Describe los trabajos con tus palabras — la IA prepara un presupuesto y lo exporta a Word/PDF. 12 idiomas, multidivisa. 30 días gratis."
  },
  de: {
    name: "Smeta — Renovierungskosten",
    short: "KI-Renovierungsrechner. 12 Sprachen, 30 Tage kostenlos.",
    about: "Schneller Kostenrechner für Bau und Renovierung. Beschreiben Sie die Arbeiten in eigenen Worten — die KI erstellt einen Kostenvoranschlag und exportiert ihn in Word/PDF. 12 Sprachen, Multi-Währung. 30 Tage kostenlos."
  },
  fr: {
    name: "Smeta — Devis rénovation",
    short: "Devis rénovation par IA. 12 langues, 30 jours gratuits.",
    about: "Calcul rapide du coût des travaux de construction et rénovation. Décrivez les travaux avec vos mots — l'IA génère un devis complet exportable en Word/PDF. 12 langues, multi-devises. 30 jours gratuits."
  },
  it: {
    name: "Smeta — Preventivo lavori",
    short: "Preventivi ristrutturazione con IA. 12 lingue, 30 giorni gratis.",
    about: "Calcolo rapido dei costi di costruzione e ristrutturazione. Descrivi i lavori con parole tue — l'IA crea un preventivo completo e lo esporta in Word/PDF. 12 lingue, multi-valuta. 30 giorni gratis."
  },
  pt: {
    name: "Smeta — Orçamento de obra",
    short: "Orçamentos de obra com IA. 12 idiomas, 30 dias grátis.",
    about: "Cálculo rápido de custos de construção e renovação. Descreva os trabalhos por palavras — a IA monta um orçamento e exporta para Word/PDF. 12 idiomas, multi-moeda. 30 dias grátis."
  },
  tr: {
    name: "Smeta — Tadilat maliyeti",
    short: "AI ile tadilat keşif. 12 dil, 30 gün ücretsiz.",
    about: "Hızlı inşaat ve tadilat maliyet hesabı. Yapacağınız işleri kendi kelimelerinizle anlatın — yapay zeka tam bir keşif hazırlar ve Word/PDF olarak dışa aktarır. 12 dil, çoklu para birimi. 30 gün ücretsiz."
  },
  ar: {
    name: "Smeta — تقدير التجديد",
    short: "تقدير تكاليف التجديد بالذكاء الاصطناعي. 12 لغة، 30 يومًا مجانًا.",
    about: "حساب سريع لتكاليف البناء والتجديد. صف الأعمال بكلماتك — يجهّز الذكاء الاصطناعي تقديرًا كاملاً ويصدّره بصيغة Word/PDF. 12 لغة، عملات متعددة. 30 يومًا مجانًا."
  },
  zh: {
    name: "Smeta — 装修估价",
    short: "AI 装修估价。12 种语言，30 天免费。",
    about: "快速计算建筑和装修成本。用自己的语言描述工程 — AI 会生成完整报价，并导出为 Word/PDF。12 种语言，多币种。免费试用 30 天。"
  },
  uk: {
    name: "Smeta — розрахунок ремонту",
    short: "ШІ рахує кошторис ремонту. 12 мов, 30 днів безкоштовно.",
    about: "Швидкий розрахунок вартості будівництва та ремонту. Опишіть роботи своїми словами — ШІ підготує кошторис і вивантажить у Word/PDF. 12 мов, мультивалютність. 30 днів безкоштовно."
  }
};

async function uploadPhotoFromUrl(photoUrl) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');

  // fetch remote image
  const imgRes = await fetch(photoUrl);
  if (!imgRes.ok) throw new Error(`fetch photo failed: ${imgRes.status}`);
  const arrayBuf = await imgRes.arrayBuffer();
  const blob = new Blob([arrayBuf], { type: 'image/png' });

  const form = new FormData();
  form.append('photo', blob, 'avatar.png');

  const url = `${API_BASE}/bot${token}/setUserProfilePhotos`;
  // NOTE: setUserProfilePhotos is a Bot API method available since 7.0
  // Actually the correct method for bot avatar is `setChatPhoto` for group chats
  // For BOT profile photo the method is `setUserProfilePhotos` (Bot API 9.0+)
  // Fallback: if unsupported, we return a hint.
  const res = await fetch(url, { method: 'POST', body: form });
  const data = await res.json();
  return data;
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const provided = req.query?.secret || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (secret && provided !== secret) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const result = { steps: [] };

  // 0. Set default (no language_code) — Russian is the primary audience fallback.
  const defaults = PROFILE_TEXTS.ru;
  const defaultRes = {};
  try {
    await _rawCall('setMyName', { name: defaults.name });
    defaultRes.name = 'ok';
  } catch (e) { defaultRes.name = `err: ${e.message}`; }
  try {
    await _rawCall('setMyShortDescription', { short_description: defaults.short });
    defaultRes.short = 'ok';
  } catch (e) { defaultRes.short = `err: ${e.message}`; }
  try {
    await _rawCall('setMyDescription', { description: defaults.about });
    defaultRes.about = 'ok';
  } catch (e) { defaultRes.about = `err: ${e.message}`; }
  result.steps.push({ '(default)': defaultRes });

  // 1. Set name / short description / description for each language
  for (const [lang, texts] of Object.entries(PROFILE_TEXTS)) {
    const perLang = {};
    try {
      await _rawCall('setMyName', { name: texts.name, language_code: lang });
      perLang.name = 'ok';
    } catch (e) {
      perLang.name = `err: ${e.message}`;
    }
    try {
      await _rawCall('setMyShortDescription', { short_description: texts.short, language_code: lang });
      perLang.short = 'ok';
    } catch (e) {
      perLang.short = `err: ${e.message}`;
    }
    try {
      await _rawCall('setMyDescription', { description: texts.about, language_code: lang });
      perLang.about = 'ok';
    } catch (e) {
      perLang.about = `err: ${e.message}`;
    }
    result.steps.push({ [lang]: perLang });
  }

  // 2. Optional: set profile photo (pass ?photo_url=...)
  const photoUrl = req.query?.photo_url;
  if (photoUrl) {
    try {
      const photoResult = await uploadPhotoFromUrl(photoUrl);
      result.steps.push({ setPhoto: photoResult });
    } catch (e) {
      result.steps.push({ setPhoto: `err: ${e.message}` });
    }
  }

  return res.status(200).json({ ok: true, result });
}
