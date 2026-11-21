// Типы урона и их свойства (вики: Damage, Damage/*_Damage). Без DOM.

export const PHYSICAL = ['Impact', 'Puncture', 'Slash'];
export const PRIMARY = ['Heat', 'Cold', 'Electricity', 'Toxin'];
// составные стихии: какие две первичные дают
export const COMBINED = {
  Blast: ['Heat', 'Cold'],
  Radiation: ['Heat', 'Electricity'],
  Gas: ['Heat', 'Toxin'],
  Magnetic: ['Cold', 'Electricity'],
  Viral: ['Cold', 'Toxin'],
  Corrosive: ['Electricity', 'Toxin'],
};
export const ALL_TYPES = [...PHYSICAL, ...PRIMARY, ...Object.keys(COMBINED), 'Void', 'Tau', 'True'];

export const TYPE_RU = {
  Impact: 'Удар', Puncture: 'Пронзание', Slash: 'Разрез',
  Heat: 'Огонь', Cold: 'Холод', Electricity: 'Электричество', Toxin: 'Токсин',
  Blast: 'Взрыв', Radiation: 'Радиация', Gas: 'Газ', Magnetic: 'Магнетизм', Viral: 'Вирус', Corrosive: 'Коррозия',
  Void: 'Бездна', Tau: 'Тау', True: 'Чистый',
};

// Урон со временем: доля модифицированного базового урона за тик (вики, страницы типов урона).
// ignoresArmor — тик идёт сквозь броню (Разрез); bypassShields — сквозь щиты (Токсин).
export const DOT = {
  Slash: { coef: 0.35, ignoresArmor: true },
  Heat: { coef: 0.5 },
  Electricity: { coef: 0.5 },
  Gas: { coef: 0.5 },
  Toxin: { coef: 0.5, bypassShields: true },
};
export const DOT_TICKS = 6;           // 1 тик в секунду, 6 с, первый через 1 с

export function combineTypes(a, b) {
  for (const [k, [x, y]] of Object.entries(COMBINED)) {
    if ((a === x && b === y) || (a === y && b === x)) return k;
  }
  return null;
}

// семейства фракций: модификатор «Проклятие гринир» действует и на кува-гринир и т.п.
export const FACTION_FAMILY = {
  'Grineer': 'grineer', 'Kuva Grineer': 'grineer', 'Scaldra': 'grineer',
  'Corpus': 'corpus', 'Corpus Amalgam': 'corpus',
  'Infested': 'infested', 'Infested Deimos': 'infested', 'Infestation': 'infested',
  'Orokin': 'corrupted', 'Corrupted': 'corrupted',
  'The Murmur': 'murmur', 'Murmur': 'murmur',
  'Sentient': 'sentient', 'Narmer': 'narmer', 'Techrot': 'techrot', 'Anarchs': 'anarchs',
};

// кривые роста здоровья/щитов из data/manual/scaling.json по фракции врага
export const HEALTH_CURVE = {
  'Grineer': 'Grineer', 'Kuva Grineer': 'Grineer', 'Scaldra': 'Grineer', 'Narmer': 'Grineer',
  'Corpus': 'Corpus', 'Corpus Amalgam': 'Corpus',
  'Infested': 'Infested', 'Infested Deimos': 'Infested', 'Infestation': 'Infested',
  'Orokin': 'Corrupted', 'Corrupted': 'Corrupted', 'Anarchs': 'Corrupted',
  'The Murmur': 'Murmur', 'Sentient': 'Murmur', 'Unaffiliated': 'Murmur', 'Stalker': 'Murmur',
  'Techrot': 'Techrot',
};
export const SHIELD_CURVE = {
  'Corpus': 'Corpus', 'Corpus Amalgam': 'Corpus',
  'Orokin': 'Corrupted', 'Corrupted': 'Corrupted', 'Anarchs': 'Corrupted',
  'Techrot': 'Techrot',
};
