// Загрузка данных по мере надобности. Без DOM.
const cache = new Map();

export function load(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(path).then(r => {
      if (!r.ok) throw new Error(`Не загрузился ${path}: ${r.status}`);
      return r.json();
    }));
  }
  return cache.get(path);
}

export const CATEGORIES = [
  { id: 'primary', ru: 'Основное', file: 'data/weapons/primary.json' },
  { id: 'secondary', ru: 'Вторичное', file: 'data/weapons/secondary.json' },
  { id: 'melee', ru: 'Ближний бой', file: 'data/weapons/melee.json' },
  { id: 'archgun', ru: 'Арчган', file: 'data/weapons/archgun.json' },
];

export const MOD_FILES = {
  primary: 'data/mods/primary.json', shotgun: 'data/mods/shotgun.json', secondary: 'data/mods/secondary.json',
  melee: 'data/mods/melee.json', archgun: 'data/mods/archgun.json',
};
export const ARCANE_FILES = {
  primary: 'data/arcanes/primary.json', secondary: 'data/arcanes/secondary.json', melee: 'data/arcanes/melee.json',
};

export function modGroup(weapon, cat) {
  if (cat === 'primary') return weapon.class === 'Shotgun' ? 'shotgun' : 'primary';
  return cat;
}

/** Подходит ли мод оружию: по compat из WFCD (Rifle, Sniper, Pistol, имя оружия для аугментов и т.п.). */
export function modFits(mod, weapon, cat) {
  const c = (mod.compat || '').toLowerCase();
  const own = [weapon.name, weapon.family].filter(Boolean).map(s => s.toLowerCase());
  if (c && own.some(n => n === c || n.startsWith(c + ' '))) return true;
  const cls = weapon.class;
  if (cat === 'primary') {
    if (cls === 'Shotgun') return ['shotgun', 'primary', ''].includes(c);
    if (['rifle', 'primary', ''].includes(c)) return true;
    if (c === 'assault rifle') return cls === 'Rifle';
    if (c === 'sniper') return cls === 'Sniper Rifle';
    if (c === 'bow') return cls === 'Bow' || cls === 'Crossbow';
    return false;
  }
  if (cat === 'secondary') {
    if (['pistol', 'pistol (no aoe)', ''].includes(c)) return true;
    if (c === 'thrown') return cls === 'Thrown';
    if (c === 'tome') return cls === 'Tome';
    return false;
  }
  if (cat === 'melee') return ['melee', ''].includes(c) || c === (cls || '').toLowerCase();
  if (cat === 'archgun') return ['archgun', 'arch-gun', ''].includes(c);
  return true;
}

export const ruName = x => x?.ru || x?.name || '';
