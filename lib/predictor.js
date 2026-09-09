'use strict';

const TAROT = [
  ['Шут', 'новое начало, доверие пути', 'остановись и проверь детали перед первым шагом'],
  ['Маг', 'инициатива, способности, действие', 'используй то, что уже есть под рукой'],
  ['Верховная Жрица', 'интуиция, тишина, скрытое знание', 'не торопись с выводами'],
  ['Императрица', 'рост, забота, творчество', 'дай внимание тому, что хочешь развить'],
  ['Император', 'порядок, границы, ответственность', 'составь простой план и следуй ему'],
  ['Иерофант', 'опыт, ценности, наставничество', 'обратись к проверенному источнику знаний'],
  ['Влюблённые', 'выбор, близость, согласование ценностей', 'выбирай то, что не противоречит твоим ценностям'],
  ['Колесница', 'движение, воля, направление', 'выбери один приоритет и двигайся к нему'],
  ['Сила', 'смелость, выдержка, мягкая уверенность', 'действуй спокойно, без давления'],
  ['Отшельник', 'поиск смысла, пауза, внутренний голос', 'выдели время, чтобы услышать себя'],
  ['Колесо Фортуны', 'перемены, цикл, поворот', 'будь гибким к изменениям'],
  ['Правосудие', 'баланс, честность, последствия решений', 'сверь решение с фактами и договорённостями'],
  ['Повешенный', 'новый взгляд, пауза, переоценка', 'посмотри на ситуацию с другой стороны'],
  ['Смерть', 'завершение, освобождение, обновление', 'отпусти то, что уже не работает'],
  ['Умеренность', 'гармония, постепенность, восстановление', 'выбери умеренный темп'],
  ['Дьявол', 'зависимость, искушение, ограничение', 'заметь привычку, которая отнимает свободу'],
  ['Башня', 'резкая ясность, слом старого, освобождение', 'не держись за план, который перестал быть реальным'],
  ['Звезда', 'надежда, вдохновение, ориентир', 'сделай небольшой шаг в сторону своей цели'],
  ['Луна', 'эмоции, неопределённость, воображение', 'отдели ощущения от проверенных фактов'],
  ['Солнце', 'ясность, радость, открытость', 'поделись хорошим результатом'],
  ['Суд', 'осознание, итог, новый этап', 'сделай вывод и возьми его дальше'],
  ['Мир', 'завершение, целостность, результат', 'отметь завершённое и освободи место для нового']
];

const HOROSCOPES = {
  aries: ['Овен', 'Сосредоточься на одном деле: спокойная настойчивость сегодня сильнее спешки.'],
  taurus: ['Телец', 'День подходит для наведения порядка в делах и бюджете. Не торопи события.'],
  gemini: ['Близнецы', 'Разговор может многое прояснить. Слушай внимательно и уточняй детали.'],
  cancer: ['Рак', 'Позаботься о своём ритме. Маленький шаг в важном деле будет достаточным.'],
  leo: ['Лев', 'Прояви инициативу, но оставь место для мнения других. Это укрепит результат.'],
  virgo: ['Дева', 'Практичный план принесёт больше пользы, чем попытка сделать всё сразу.'],
  libra: ['Весы', 'Выбирай ясные договорённости. В отношениях полезно назвать свои ожидания.'],
  scorpio: ['Скорпион', 'Не делай выводов на эмоциях. Дай ситуации немного времени раскрыться.'],
  sagittarius: ['Стрелец', 'Новое знание или идея может дать направление. Зафиксируй её и сделай первый шаг.'],
  capricorn: ['Козерог', 'Твоя последовательность работает. Закрой одну важную задачу до конца.'],
  aquarius: ['Водолей', 'Необычное решение стоит обсудить с теми, кого оно затрагивает.'],
  pisces: ['Рыбы', 'Интуиция полезна, если дополнить её конкретными фактами и простым планом.']
};

function hash(value) {
  let result = 0;
  for (const char of String(value)) result = ((result << 5) - result + char.charCodeAt(0)) | 0;
  return Math.abs(result);
}

function isoDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function draw(count, seed = Date.now()) {
  const pool = TAROT.map((_, index) => index);
  const cards = [];
  let state = hash(seed) || 1;
  while (cards.length < count && pool.length) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const index = state % pool.length;
    cards.push(TAROT[pool.splice(index, 1)[0]]);
  }
  return cards;
}

function formatCard(card, position) {
  return `*${position} — ${card[0]}*\nЗначение: ${card[1]}.\nСовет: ${card[2]}.`;
}

function moonToday(date = new Date()) {
  const synodicMonth = 29.53058867;
  const reference = Date.UTC(2000, 0, 6, 18, 14, 0);
  const age = ((((date.getTime() - reference) / 86400000) % synodicMonth) + synodicMonth) % synodicMonth;
  const illumination = Math.round(((1 - Math.cos((2 * Math.PI * age) / synodicMonth)) / 2) * 100);
  const phases = [
    [1.85, '🌑 Новолуние', 'время выбрать намерение и не перегружать планы'],
    [5.54, '🌒 Растущий серп', 'подходит для первых небольших действий'],
    [9.23, '🌓 Первая четверть', 'полезно принять решение и продолжить начатое'],
    [12.92, '🌔 Растущая Луна', 'подходит для развития и обучения'],
    [16.61, '🌕 Полнолуние', 'заметь результаты и бережно отнесись к эмоциям'],
    [20.30, '🌖 Убывающая Луна', 'время завершать и делиться результатами'],
    [23.99, '🌗 Последняя четверть', 'полезно пересмотреть приоритеты'],
    [27.68, '🌘 Убывающий серп', 'подходит для отдыха и спокойного подведения итогов'],
    [29.54, '🌑 Новолуние', 'время выбрать намерение и не перегружать планы']
  ];
  const phase = phases.find(([limit]) => age < limit) || phases[0];
  return { age: Math.floor(age) + 1, illumination, title: phase[1], advice: phase[2] };
}

function mainKeyboard() {
  return { inline_keyboard: [
    [{ text: '🃏 Карта дня', callback_data: 'predictor:daily' }, { text: '🔮 Расклад на 3 карты', callback_data: 'predictor:spread' }],
    [{ text: '🌙 Луна сегодня', callback_data: 'predictor:moon' }, { text: '☀️ Гороскоп', callback_data: 'predictor:horoscope' }],
    [{ text: '🏠 К сметам', callback_data: 'predictor:back' }]
  ] };
}

function horoscopeKeyboard() {
  const signs = Object.entries(HOROSCOPES);
  const rows = [];
  for (let index = 0; index < signs.length; index += 2) {
    rows.push(signs.slice(index, index + 2).map(([key, value]) => ({ text: value[0], callback_data: `predictor:sign:${key}` })));
  }
  rows.push([{ text: '◀️ Назад', callback_data: 'predictor:menu' }]);
  return { inline_keyboard: rows };
}

function getResponse(action, userId = 'guest', now = new Date()) {
  if (action === 'menu' || action === 'start') return { text: '🔮 *Предсказатель*\n\nВыбери, что хочешь узнать. Это развлекательный инструмент для размышлений, а не гарантия событий.', reply_markup: mainKeyboard() };
  if (action === 'daily') {
    const card = draw(1, `${userId}:${isoDate(now)}`)[0];
    return { text: `🃏 *Карта дня*\n\n${formatCard(card, 'Тема дня')}\n\nКарта не меняется до конца дня.`, reply_markup: mainKeyboard() };
  }
  if (action === 'spread') {
    const cards = draw(3, `${userId}:${Date.now()}:${Math.random()}`);
    const positions = ['Ситуация', 'Совет', 'Вероятное направление'];
    return { text: `🔮 *Расклад на 3 карты*\n\n${cards.map((card, index) => formatCard(card, positions[index])).join('\n\n')}\n\nВоспринимай расклад как повод взглянуть на ситуацию под другим углом.`, reply_markup: mainKeyboard() };
  }
  if (action === 'moon') {
    const moon = moonToday(now);
    return { text: `🌙 *Луна сегодня*\n\n${moon.title}\nОсвещённость: ${moon.illumination}%\nЛунный день: ${moon.age}-й\n\n${moon.advice}.`, reply_markup: mainKeyboard() };
  }
  if (action === 'horoscope') return { text: '☀️ *Гороскоп на сегодня*\n\nВыбери свой знак:', reply_markup: horoscopeKeyboard() };
  if (action.startsWith('sign:')) {
    const sign = HOROSCOPES[action.slice(5)];
    if (!sign) return getResponse('horoscope', userId, now);
    return { text: `☀️ *${sign[0]} — гороскоп на сегодня*\n\n${sign[1]}\n\nЭто общий развлекательный прогноз; опирайся на факты и свои решения.`, reply_markup: mainKeyboard() };
  }
  return getResponse('menu', userId, now);
}

function handleCallback(callbackData, userId, now) {
  if (!String(callbackData || '').startsWith('predictor:')) return null;
  return getResponse(String(callbackData).slice('predictor:'.length), userId, now);
}

module.exports = { TAROT, HOROSCOPES, draw, moonToday, mainKeyboard, horoscopeKeyboard, getResponse, handleCallback };
