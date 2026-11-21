// Эталонные проверки движка. Работают и в node --test (tests/engine.test.mjs), и в браузере (tests/index.html).
// Каждый случай: { name, run(ctx) }, ctx = { data, find, near, eq } ; near(a, b, eps) / eq(a, b) бросают ошибку.
import { calc, combineElements, critInfo, enemyState } from '../js/engine/index.js';

const SILKEN = pct => ({ name: 'Шёлковая поступь', pct, type: 'Toxin', statusChance: 1, ability: true });
const DEVOURING = { name: 'Devouring Attrition', effects: [{ stat: 'final_mult', value: 21, bucket: 'final_mult' }] };
const buff = (name, stat, value, bucket = stat) => ({ name, effects: [{ stat, value, bucket }] });
const shown = x => Math.round(x);

export const cases = [
  // ---------- замеры в Симулякре (2026-11-20), Ораксия без модов, выстрел с земли ----------
  {
    name: 'Лекс Прайм → Тяжёлая Пулемётчица 115, тело: 19 / 7 / 4',
    run({ data, find, eq, near }) {
      const r = calc({ weapon: find.weapon('Lex Prime'), extraHits: [SILKEN(0.4)] },
        { enemy: find.enemy('Heavy Gunner'), level: 115 }, data, { part: 'body' });
      near(r.enemy.dr, 0.9, 1e-9);
      eq(shown(r.hit.health), 19); eq(shown(r.extra[0].damage), 7); eq(shown(r.extra[0].tick), 4);
    },
  },
  {
    name: 'Летум (Devouring Attrition ×21) → Пулемётчица 115, тело: 404 / 134 / 67',
    run({ data, find, eq }) {
      const r = calc({ weapon: find.weapon('Laetum'), buffs: [DEVOURING], extraHits: [SILKEN(0.4)] },
        { enemy: find.enemy('Heavy Gunner'), level: 115 }, data, { part: 'body' });
      eq(shown(r.hit.health), 404); eq(shown(r.extra[0].damage), 134); eq(shown(r.extra[0].tick), 67);
    },
  },
  {
    name: 'Пророк → Пулемётчица 115, голова: тик 6 (доп. удар 12–13, см. TODO_VERIFY)',
    run({ data, find, eq, near }) {
      const r = calc({ weapon: find.weapon('Seer'), extraHits: [SILKEN(0.4)] },
        { enemy: find.enemy('Heavy Gunner'), level: 115 }, data, { part: 'head' });
      eq(shown(r.extra[0].tick), 6);
      near(r.extra[0].damage, 12.3, 0.3);
    },
  },
  {
    name: 'Лекс Прайм → Древний Разрушитель 115, тело: 188 / 36 (защита от способностей 0,5)',
    run({ data, find, eq }) {
      const r = calc({ weapon: find.weapon('Lex Prime'), extraHits: [SILKEN(0.4)] },
        { enemy: find.enemy('Ancient Disruptor'), level: 115 }, data, { part: 'body' });
      eq(shown(r.hit.health), 188); eq(shown(r.extra[0].damage), 36);
    },
  },
  {
    name: 'Пророк → Древний Разрушитель 115, тело: 122 (квантование)',
    run({ data, find, eq }) {
      const r = calc({ weapon: find.weapon('Seer') }, { enemy: find.enemy('Ancient Disruptor'), level: 115 }, data, { part: 'body' });
      eq(shown(r.hit.health), 122);
    },
  },
  {
    name: 'Супра Вандал → Бегун 210, тело: 43 (Разрез ×1,5)',
    run({ data, find, eq }) {
      const r = calc({ weapon: find.weapon('Supra Vandal') }, { enemy: find.enemy('Runner'), level: 210 }, data, { part: 'body' });
      eq(shown(r.hit.health), 43);
    },
  },

  {
    name: 'Летум + 1 стак Вторичной Безжалостности → Пулемётчица 115, тело: 25 (загадочный ×1,3 из замеров)',
    run({ data, find, eq, near }) {
      const arc = find.arcane('secondary', 'Secondary Merciless');
      const r = calc({ weapon: find.weapon('Laetum'), arcanes: [{ item: arc, rank: 5 }], stacks: { ['arc:' + arc.id]: 1 } },
        { enemy: find.enemy('Heavy Gunner'), level: 115 }, data, { part: 'body' });
      near(r.hit.health, 19.25 * 1.3, 1e-9); eq(shown(r.hit.health), 25);
    },
  },

  // ---------- пресеты калькулятора Ораксии ----------
  {
    name: 'Пресет Ораксии: Летум, 138%, Элементалист R5, таукованый осколок, DR 0,87 → 28,7 / 33,73',
    run({ data, find, near }) {
      const el = find.mod('secondary', 'Pistol Elementalist');
      const r = calc({
        weapon: find.weapon('Laetum'), mods: [{ item: el, rank: 5 }],
        buffs: [buff('Таукованый изумрудный осколок', 'status_damage', 0.45)], extraHits: [SILKEN(1.38)],
      }, { enemy: find.enemy('Heavy Gunner'), level: 115, drOverride: 0.87 }, data, { part: 'body' });
      near(r.extra[0].damage, 28.704, 0.01); near(r.extra[0].tick, 33.73, 0.01);
    },
  },
  {
    name: 'Пресет Ораксии: Лекс Прайм, голая Ораксия, Пулемётчица 115 → 7,2 / 3,6',
    run({ data, find, near }) {
      const r = calc({ weapon: find.weapon('Lex Prime'), extraHits: [SILKEN(0.4)] },
        { enemy: find.enemy('Heavy Gunner'), level: 115 }, data, { part: 'body' });
      near(r.extra[0].damage, 7.2, 1e-6); near(r.extra[0].tick, 3.6, 1e-6);
    },
  },
  {
    name: 'Пресет Ораксии: Лекс Прайм, Древний Разрушитель → 36 / 18',
    run({ data, find, near }) {
      const r = calc({ weapon: find.weapon('Lex Prime'), extraHits: [SILKEN(0.4)] },
        { enemy: find.enemy('Ancient Disruptor'), level: 115 }, data, { part: 'body' });
      near(r.extra[0].damage, 36, 1e-6); near(r.extra[0].tick, 18, 1e-6);
    },
  },

  // ---------- примеры с вики ----------
  {
    name: 'Вики, квантование: 30/30/40 по Пожирателю → 123,4375, крит ×1,5 → 185,15625',
    run({ data, near }) {
      const weapon = { name: 'Пример', attacks: [{ damage: { Impact: 30, Puncture: 30, Slash: 40 }, critChance: 0.5, critMultiplier: 1.5, statusChance: 0, fireRate: 1 }] };
      const charger = { name: 'Charger', faction: 'Infested', health: 100, baseLevel: 1 };
      near(calc({ weapon }, { enemy: charger, level: 1 }, data, { crit: 'none' }).hit.health, 123.4375, 1e-9);
      near(calc({ weapon }, { enemy: charger, level: 1 }, data, { crit: 'crit' }).hit.health, 185.15625, 1e-9);
    },
  },
  {
    name: 'Вики, Нагантака Прайм с модами: 951,5, по заражённым 1108,28',
    run({ data, near }) {
      const weapon = { name: 'Nagantaka Prime', attacks: [{ damage: { Impact: 1.73, Puncture: 15.57, Slash: 155.7 }, critChance: 0, critMultiplier: 2.3, statusChance: 0, fireRate: 1 }] };
      const buffs = [
        buff('Cryo Rounds', 'element_cold', 0.9, 'element'), buff('Malignant Force', 'element_toxin', 0.6, 'element'),
        buff('Hellfire', 'element_heat', 0.9, 'element'), buff('Piercing Caliber', 'physical_puncture', 1.2, 'physical'),
        buff('Gas Valence Formation', 'element_gas', 2.0, 'element'),
      ];
      const neutral = { name: 'Цель', faction: 'Tenno', health: 1, baseLevel: 1 };
      const inf = { name: 'Цель', faction: 'Infested', health: 1, baseLevel: 1 };
      near(calc({ weapon, buffs }, { enemy: neutral, level: 1 }, data).hit.health, 951.5, 1e-6);
      near(calc({ weapon, buffs }, { enemy: inf, level: 1 }, data).hit.health, 1108.28125, 1e-6);
    },
  },
  {
    name: 'Вики, тик Токсина: 100 Пронзания, Serration, Infected Clip, Rifle Elementalist, Bane of Infested → 808,4',
    run({ data, near }) {
      const weapon = { name: 'Пример', attacks: [{ damage: { Puncture: 100 }, critChance: 0, critMultiplier: 1, statusChance: 1, fireRate: 1 }] };
      const buffs = [buff('Serration', 'damage', 1.65, 'base_damage'), buff('Infected Clip', 'element_toxin', 0.9, 'element'),
        buff('Rifle Elementalist', 'status_damage', 0.9), { name: 'Bane of Infested', effects: [{ stat: 'faction_infested', value: 0.3, bucket: 'faction', condition: { faction: 'infested' } }] }];
      const runner = { name: 'Runner', faction: 'Infested', health: 100, baseLevel: 1 };
      const r = calc({ weapon, buffs }, { enemy: runner, level: 1 }, data);
      near(r.dots.Toxin.tick, 0.5 * 344.5 * 4.693, 0.05);
    },
  },

  // ---------- механики ----------
  {
    name: 'Крит: 250% шанса, ×3 → уровни ×5 и ×7, средний ×6',
    run({ near, eq }) {
      const c = critInfo(2.5, 3);
      eq(c.lowTier, 2); eq(c.highTier, 3); near(c.lowMult, 5, 1e-9); near(c.highMult, 7, 1e-9); near(c.average, 6, 1e-9);
    },
  },
  {
    name: 'Стихии: порядок модов и врождённая стихия последней',
    run({ eq }) {
      const types = els => combineElements(els.map(([type, value]) => ({ type, value, source: type }))).map(e => e.type).join('+');
      eq(types([['Heat', 1], ['Cold', 1]]), 'Blast');
      eq(types([['Cold', 1], ['Toxin', 1], ['Heat', 1]]), 'Viral+Heat');
      eq(types([['Heat', 1], ['Electricity', 1], ['Toxin', 1]]), 'Radiation+Toxin');
      eq(types([['Toxin', 1], ['Toxin', 1]]), 'Toxin');
      eq(types([['Cold', 1], ['Toxin', 1], ['Cold', 1]]), 'Viral');
      eq(combineElements([{ type: 'Electricity', value: 1, source: 'мод' }], { Toxin: 20 }).map(e => e.type).join('+'), 'Corrosive');
    },
  },
  {
    name: 'Враг: броня Пулемётчицы 115 упирается в 2700, снижение урона 90%',
    run({ data, find, near }) {
      const e = enemyState(find.enemy('Heavy Gunner'), { level: 115 }, data.scaling, data.damage);
      near(e.armor, 2700, 1e-9); near(e.dr, 0.9, 1e-9); near(e.health, 93412, 5);
    },
  },
  {
    name: 'Враг: Коррозия 10 стаков снимает 80% брони',
    run({ data, find, near }) {
      const e = enemyState(find.enemy('Heavy Gunner'), { level: 115, status: { corrosive: 10 } }, data.scaling, data.damage);
      near(e.armor, 540, 1e-6); near(e.dr, 0.9 * Math.sqrt(540 / 2700), 1e-9);
    },
  },
];

/** Общий загрузчик: data = { scaling, damage, weapons: {slot: [...]}, mods: {group: [...]}, enemies: [...] } */
export function makeContext(data) {
  const allWeapons = Object.values(data.weapons).flat();
  const find = {
    weapon: name => { const w = allWeapons.find(x => x.name === name); if (!w) throw new Error('нет оружия ' + name); return w; },
    enemy: name => { const e = data.enemies.find(x => x.name === name); if (!e) throw new Error('нет врага ' + name); return e; },
    mod: (group, name) => { const m = data.mods[group].find(x => x.name === name); if (!m) throw new Error('нет мода ' + name); return m; },
    arcane: (group, name) => { const m = data.arcanes[group].find(x => x.name === name); if (!m) throw new Error('нет мистификатора ' + name); return m; },
  };
  const near = (a, b, eps = 1e-6) => { if (!(Math.abs(a - b) <= eps)) throw new Error(`ожидалось ${b} ± ${eps}, получено ${a}`); };
  const eq = (a, b) => { if (a !== b) throw new Error(`ожидалось ${JSON.stringify(b)}, получено ${JSON.stringify(a)}`); };
  return { data, find, near, eq };
}

export const DATA_FILES = {
  scaling: 'data/manual/scaling.json', damage: 'data/damage.json', enemies: 'data/enemies.json',
  weapons: { primary: 'data/weapons/primary.json', secondary: 'data/weapons/secondary.json' },
  mods: { secondary: 'data/mods/secondary.json', primary: 'data/mods/primary.json' },
  arcanes: { secondary: 'data/arcanes/secondary.json' },
};
