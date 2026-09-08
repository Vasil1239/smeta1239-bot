// lib/i18n.js
// Runtime i18n loader. Reads JSON files from ../locales/*.json at cold start.
// Supports:
//   - Nested keys separated by dots ("menu.new_estimate")
//   - Variable interpolation via {name} placeholders
//   - Fallback to English when the target locale is missing a key
//   - Fallback to the raw key string when even English lacks it

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from './constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCALES_DIR = path.resolve(__dirname, '..', 'locales');

const dictionaries = {};
let loaded = false;

function loadAll() {
  if (loaded) return;
  loaded = true;
  for (const lang of SUPPORTED_LANGUAGES) {
    const file = path.join(LOCALES_DIR, `${lang}.json`);
    try {
      const raw = fs.readFileSync(file, 'utf8');
      dictionaries[lang] = JSON.parse(raw);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[i18n] Failed to load ${lang}.json: ${e.message}`);
      dictionaries[lang] = {};
    }
  }
}

function resolveKey(dict, key) {
  if (!dict) return undefined;
  if (key in dict) return dict[key];
  const parts = key.split('.');
  let node = dict;
  for (const p of parts) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[p];
  }
  return node;
}

function interpolate(str, vars) {
  if (typeof str !== 'string' || !vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : `{${name}}`
  );
}

/**
 * Translate `key` for `langCode`.
 * Falls back to English, then to the key itself.
 */
export function t(langCode, key, vars) {
  loadAll();
  const lang = SUPPORTED_LANGUAGES.includes(langCode) ? langCode : DEFAULT_LANGUAGE;
  let value = resolveKey(dictionaries[lang], key);
  if (value === undefined && lang !== DEFAULT_LANGUAGE) {
    value = resolveKey(dictionaries[DEFAULT_LANGUAGE], key);
  }
  if (value === undefined) return key;
  if (Array.isArray(value)) value = value.join('\n');
  return interpolate(value, vars);
}

export function hasKey(langCode, key) {
  loadAll();
  return resolveKey(dictionaries[langCode], key) !== undefined
      || resolveKey(dictionaries[DEFAULT_LANGUAGE], key) !== undefined;
}

export function availableLanguages() {
  return [...SUPPORTED_LANGUAGES];
}

export default { t, hasKey, availableLanguages };
