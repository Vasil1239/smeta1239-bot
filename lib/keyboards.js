// lib/keyboards.js
// Inline-keyboard factories. All labels go through t(lang, key).

import { t } from './i18n.js';
import { SUPPORTED_LANGUAGES } from './constants.js';

const row = (...btns) => btns;

export function mainMenu(lang) {
  return {
    inline_keyboard: [
      row({ text: t(lang, 'menu.new_estimate'),   callback_data: 'new_estimate' }),
      row({ text: t(lang, 'menu.my_estimates'),   callback_data: 'my_estimates' }),
      row(
        { text: t(lang, 'menu.subscription'),      callback_data: 'sub_status' },
        { text: t(lang, 'menu.upgrade'),           callback_data: 'plans' }
      ),
      row(
        { text: t(lang, 'menu.referral'),          callback_data: 'referral' },
        { text: t(lang, 'menu.promo'),             callback_data: 'promo' }
      ),
      row(
        { text: t(lang, 'menu.language'),          callback_data: 'lang' },
        { text: t(lang, 'menu.help'),              callback_data: 'help' }
      )
    ]
  };
}

export function estimateView(lang, estimateId) {
  return {
    inline_keyboard: [
      row(
        { text: t(lang, 'estimate.mode_min'),  callback_data: `mode:${estimateId}:min` },
        { text: t(lang, 'estimate.mode_rec'),  callback_data: `mode:${estimateId}:recommended` },
        { text: t(lang, 'estimate.mode_max'),  callback_data: `mode:${estimateId}:max` }
      ),
      row(
        { text: t(lang, 'estimate.word'),      callback_data: `export:${estimateId}:word` },
        { text: t(lang, 'estimate.pdf'),       callback_data: `export:${estimateId}:pdf` },
        { text: t(lang, 'estimate.copy'),      callback_data: `export:${estimateId}:copy` }
      ),
      row(
        { text: t(lang, 'estimate.edit'),      callback_data: `edit:${estimateId}` },
        { text: t(lang, 'estimate.precise'),   callback_data: `precise:${estimateId}` }
      ),
      row({ text: t(lang, 'common.back'),      callback_data: 'main' })
    ]
  };
}

export function editMenu(lang, estimateId) {
  return {
    inline_keyboard: [
      row({ text: t(lang, 'edit.change_quantities'), callback_data: `edit_qty:${estimateId}` }),
      row({ text: t(lang, 'edit.add_work'),          callback_data: `edit_add:${estimateId}` }),
      row({ text: t(lang, 'edit.remove_work'),       callback_data: `edit_remove:${estimateId}` }),
      row({ text: t(lang, 'edit.change_reserve'),    callback_data: `edit_reserve:${estimateId}` }),
      row({ text: t(lang, 'common.back'),            callback_data: `show:${estimateId}` })
    ]
  };
}

export function languageSelector(lang) {
  const NAMES = {
    ru: 'Русский', en: 'English', sr: 'Srpski', es: 'Español', de: 'Deutsch',
    fr: 'Français', it: 'Italiano', pt: 'Português', tr: 'Türkçe',
    ar: 'العربية',  zh: '中文',      uk: 'Українська'
  };
  const buttons = SUPPORTED_LANGUAGES.map(code => ({
    text: `${code === lang ? '✅ ' : ''}${NAMES[code] || code}`,
    callback_data: `setlang:${code}`
  }));
  // 3 columns
  const rows = [];
  for (let i = 0; i < buttons.length; i += 3) rows.push(buttons.slice(i, i + 3));
  rows.push([{ text: t(lang, 'common.back'), callback_data: 'main' }]);
  return { inline_keyboard: rows };
}

export function planSelector(lang) {
  const basic    = process.env.STARS_PRICE_BASIC    || 299;
  const pro      = process.env.STARS_PRICE_PRO      || 799;
  const lifetime = process.env.STARS_PRICE_LIFETIME || 4999;
  return {
    inline_keyboard: [
      row({ text: t(lang, 'plans.basic',    { stars: basic }),    callback_data: 'buy:basic' }),
      row({ text: t(lang, 'plans.pro',      { stars: pro }),      callback_data: 'buy:pro' }),
      row({ text: t(lang, 'plans.lifetime', { stars: lifetime }), callback_data: 'buy:lifetime' }),
      row({ text: t(lang, 'common.back'),   callback_data: 'main' })
    ]
  };
}

export function backButton(lang, target = 'main') {
  return { inline_keyboard: [[{ text: t(lang, 'common.back'), callback_data: target }]] };
}

export function cancelButton(lang) {
  return { inline_keyboard: [[{ text: t(lang, 'common.cancel'), callback_data: 'cancel' }]] };
}

export function confirmButtons(lang, yesCb, noCb = 'cancel') {
  return {
    inline_keyboard: [[
      { text: t(lang, 'common.yes'), callback_data: yesCb },
      { text: t(lang, 'common.no'),  callback_data: noCb }
    ]]
  };
}
