// Эталонные проверки движка. Работают и в node --test (tests/engine.test.mjs), и в браузере (tests/index.html).
// Каждый случай: { name, run(ctx) }, ctx = { data, find, near, eq } ; near(a, b, eps) / eq(a, b) бросают ошибку.
import { overguardMultiplier, coldCritBonus, calc, combineElements, critInfo, enemyState, frameStats, shardSources, resolveBuffs, capacity, modCost, polarityMatch, formaCount, modContribution, shotThresholds } from '../js/engine/index.js';
import { encodeBuild, decodeBuild } from '../js/share.js';
import { readAleca, upgradeLookup, slotPolarities, readShards, rivenFromFingerprint } from '../js/aleca.js';

const SILKEN = pct => ({ name: 'Шёлковая поступь', pct, type: 'Toxin', statusChance: 1, ability: true });
const DEVOURING = { name: 'Devouring Attrition', effects: [{ stat: 'final_mult', value: 21, bucket: 'final_mult' }] };
const buff = (name, stat, value, bucket = stat) => ({ name, effects: [{ stat, value, bucket }] });
const shown = x => Math.round(x);
const W = (damage, statusChance = 0) => ({ name: 'Пример', attacks: [{ damage, critChance: 0, critMultiplier: 1, statusChance, fireRate: 1 }] });
const NEUTRAL = { name: 'Цель', faction: 'Tenno', health: 1, baseLevel: 1 };
const SERR = { name: 'Serration', effects: [{ stat: 'damage', value: 1.65, bucket: 'base_damage' }] };

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

  // ---------- фрейм (этап 5) ----------
  {
    name: 'Фрейм: Ораксия на 30-м ранге — здоровье 675, щиты 225, броня 125, энергия 200',
    run({ data, find, near }) {
      const f = frameStats(find.frame('Oraxia'), {}, data.shards);
      near(f.health, 675, 1e-9); near(f.shield, 225, 1e-9); near(f.armor, 125, 1e-9); near(f.energy, 200, 1e-9);
    },
  },
  {
    name: 'Фрейм: Живучесть R10 + таукованый Лазурный (здоровье) → 1575, эффективное здоровье 1575 × (1 + 125/300)',
    run({ data, find, near }) {
      const f = frameStats(find.frame('Oraxia'), { mods: [{ item: find.mod('warframe', 'Vitality'), rank: 10 }],
        shards: [{ color: 'azure', effect: 'health', tau: true }] }, data.shards);
      near(f.health, 1575, 1e-9); near(f.ehpHealth, 1575 * (1 + 125 / 300), 1e-6);
    },
  },
  {
    name: 'Фрейм → оружие: таукованый Изумрудный осколок вместо «своего бонуса» даёт тот же тик 33,73',
    run({ data, find, near }) {
      const f = frameStats(find.frame('Oraxia'), { shards: [{ color: 'emerald', effect: 'toxin_status', tau: true }] }, data.shards);
      const r = calc({
        weapon: find.weapon('Laetum'), slot: 'secondary', mods: [{ item: find.mod('secondary', 'Pistol Elementalist'), rank: 5 }],
        buffs: f.weaponSources, extraHits: [SILKEN(1.38)],
      }, { enemy: find.enemy('Heavy Gunner'), level: 115, drOverride: 0.87 }, data, { part: 'body' });
      near(r.extra[0].tick, 33.73, 0.01);
    },
  },
  {
    name: 'Аура Rifle Amp: +27% винтовкам, пистолетам — нет',
    run({ data, find, near }) {
      const amp = { name: 'Rifle Amp', effects: find.mod('warframe', 'Rifle Amp').ranks.at(-1) };
      const rifle = calc({ weapon: find.weapon('Supra Vandal'), slot: 'primary', buffs: [amp] }, { enemy: find.enemy('Runner'), level: 210 }, data);
      near(rifle.hit.health, 43.125 * 1.27, 1e-9);
      const pistol = calc({ weapon: find.weapon('Lex Prime'), slot: 'secondary', buffs: [amp] }, { enemy: find.enemy('Heavy Gunner'), level: 115 }, data);
      near(pistol.hit.health, 18.84375, 1e-6);
    },
  },
  {
    name: 'Аура Corrosive Projection: броня Пулемётчицы 2700 → 2214',
    run({ data, find, near }) {
      const cp = { name: 'Corrosive Projection', effects: find.mod('warframe', 'Corrosive Projection').ranks.at(-1) };
      const r = calc({ weapon: find.weapon('Lex Prime'), slot: 'secondary', buffs: [cp] }, { enemy: find.enemy('Heavy Gunner'), level: 115 }, data);
      near(r.enemy.armor, 2214, 1e-6); near(r.enemy.dr, 0.9 * Math.sqrt(2214 / 2700), 1e-9);
    },
  },
  {
    name: 'Осколки: Фиолетовый даёт основному +30% Электричества и +10% за каждый Багровый/Лазурный/Фиолетовый',
    run({ data, near }) {
      const src = shardSources([{ color: 'violet', effect: 'primary_electricity' }, { color: 'crimson', effect: 'strength' }, { color: 'azure', effect: 'armor' }], data.shards);
      near(src[0].effects[0].value, 0.6, 1e-9);
    },
  },

  // ---------- баффы (этап 6), примеры со страниц вики ----------
  {
    name: 'Roar (вики): 100 урона, Serration, Roar 3 + Intensify → 100 × 2,65 × (1 + 0,5 × 1,3)',
    run({ data, near }) {
      const b = resolveBuffs([{ id: 'roar', on: true, strength: 130 }], data.buffs.buffs);
      const r = calc({ weapon: W({ Impact: 100 }), buffs: [SERR, ...b.weaponSources] }, { enemy: NEUTRAL, level: 1 }, data);
      near(r.hit.health, 100 * 2.65 * (1 + 0.5 * 1.3), 0.6);
    },
  },
  {
    name: 'Roar (вики): тик Разреза 0,35 × 100 × (1 + 0,5) × (1 + 0,5) = 78,75 — фракция дважды',
    run({ data, near }) {
      const b = resolveBuffs([{ id: 'roar', on: true, strength: 100 }], data.buffs.buffs);
      const r = calc({ weapon: W({ Slash: 100 }, 1), buffs: b.weaponSources }, { enemy: NEUTRAL, level: 1 }, data);
      near(r.dots.Slash.tick, 78.75, 1e-6);
    },
  },
  {
    name: 'Солнечное затмение (вики): 250 × 2,65 × (1 + 2 × 1,3) = 2385',
    run({ data, near }) {
      const b = resolveBuffs([{ id: 'eclipse', on: true, variant: 'solar', strength: 130 }], data.buffs.buffs);
      const r = calc({ weapon: W({ Impact: 250 }), buffs: [SERR, ...b.weaponSources] }, { enemy: NEUTRAL, level: 1 }, data);
      near(r.hit.health, 2385, 1e-6);
    },
  },
  {
    name: 'Vex Armor, Ярость (вики): 100 × (1 + 1,65 + 2,75 × 1,3) = 622,5',
    run({ data, near }) {
      const b = resolveBuffs([{ id: 'vex_armor', on: true, strength: 130 }], data.buffs.buffs);
      const r = calc({ weapon: W({ Impact: 100 }), buffs: [SERR, ...b.weaponSources] }, { enemy: NEUTRAL, level: 1 }, data);
      near(r.hit.health, 622.5, 1e-6);
    },
  },
  {
    name: 'Toxic Lash (вики): 200 × 0,3 × 1,3 = 78 доп. урона Токсином',
    run({ data, near }) {
      const b = resolveBuffs([{ id: 'toxic_lash', on: true, strength: 130 }], data.buffs.buffs, { slot: 'primary' });
      const r = calc({ weapon: W({ Impact: 200 }), slot: 'primary', extraHits: b.extraHits }, { enemy: NEUTRAL, level: 1 }, data);
      near(r.extra[0].damage, 78, 1e-6);
    },
  },
  {
    name: 'Warcry (вики): броня Валькирии 855 × (1 + 1 + 0,5 × 1,3) = 2265,75',
    run({ data, find, near }) {
      const v = find.frame('Valkyr');
      const own = frameStats(v, { mods: [{ item: find.mod('warframe', 'Intensify'), rank: 5 }] }, data.shards).strength;
      const b = resolveBuffs([{ id: 'warcry', on: true, ownStrength: true }], data.buffs.buffs, { ownStrength: own });
      const f = frameStats(v, { mods: [{ item: find.mod('warframe', 'Steel Fiber'), rank: 10 }, { item: find.mod('warframe', 'Intensify'), rank: 5 }],
        buffSources: b.frameSources }, data.shards);
      near(v.rank30.armor, 855, 1e-9); near(f.armor, 2265.75, 1e-6);
    },
  },
  {
    name: 'Terrify при 167% силы снимает всю броню; Molecular Prime удваивает урон',
    run({ data, find, near }) {
      const t = resolveBuffs([{ id: 'terrify', on: true, strength: 167 }, { id: 'molecular_prime', on: true }], data.buffs.buffs);
      near(t.armorStrip, 1, 1e-9); near(t.vulnerability, 1, 1e-9);
      const base = calc({ weapon: find.weapon('Lex Prime') }, { enemy: find.enemy('Heavy Gunner'), level: 115 }, data);
      const r = calc({ weapon: find.weapon('Lex Prime') }, { enemy: find.enemy('Heavy Gunner'), level: 115, armorStrip: t.armorStrip, vulnerability: t.vulnerability }, data);
      near(r.enemy.dr, 0, 1e-9); near(r.hit.health, base.hit.health / 0.1 * 2, 1e-6);
    },
  },

  // ---------- ближний бой, Инкарнон, экзальт (этап 7) ----------
  {
    name: 'Парацесис, тяжёлая атака (1332) → Пулемётчица 115: 148, как в замере',
    run({ data, find, eq }) {
      const r = calc({ weapon: find.weapon('Paracesis'), slot: 'melee', meleeMode: 'heavy', comboMultiplier: 1 },
        { enemy: find.enemy('Heavy Gunner'), level: 115 }, data, { part: 'body' });
      eq(shown(r.hit.health), 148);
    },
  },
  {
    name: 'Тяжёлая атака × множитель комбо 4',
    run({ data, find, near }) {
      const t = { enemy: find.enemy('Heavy Gunner'), level: 115 };
      const h1 = calc({ weapon: find.weapon('Paracesis'), slot: 'melee', meleeMode: 'heavy', comboMultiplier: 1 }, t, data).hit.health;
      const h4 = calc({ weapon: find.weapon('Paracesis'), slot: 'melee', meleeMode: 'heavy', comboMultiplier: 4 }, t, data).hit.health;
      near(h4, h1 * 4, 1e-6);
    },
  },
  {
    name: 'Blood Rush (вики): +40% × (комбо − 1) — при 12× это +440% к шансу крита',
    run({ data, find, near }) {
      const br = find.mod('melee', 'Blood Rush');
      const r = calc({ weapon: find.weapon('Nikana Prime'), slot: 'melee', mods: [{ item: br, rank: 10 }], comboMultiplier: 12 },
        { enemy: NEUTRAL, level: 1 }, data);
      near(r.stats.critChance, 0.28 * (1 + 0.4 * 11), 1e-9);
    },
  },
  {
    name: 'Летум: перк Devouring Attrition (сработал) вместо «своего множителя» → 404 / 134 / 67',
    run({ data, find, eq }) {
      const perk = data.incarnon['Laetum'].tiers.find(t => t.tier === 5).perks.find(p => p.name === 'Devouring Attrition');
      const r = calc({ weapon: find.weapon('Laetum'), slot: 'secondary', incarnon: [{ key: 'inc:da', name: perk.name, effects: perk.effects }],
        stacks: { 'inc:da': 1 }, extraHits: [SILKEN(0.4)] }, { enemy: find.enemy('Heavy Gunner'), level: 115 }, data, { part: 'body' });
      eq(shown(r.hit.health), 404); eq(shown(r.extra[0].damage), 134); eq(shown(r.extra[0].tick), 67);
    },
  },
  {
    name: 'Лекс Прайм Инкарнон: Critical Parallel (+19% и +0,4×) и Hoplite Virtue (+20 базового урона)',
    run({ data, find, near }) {
      const inc = data.incarnon['Lex Prime'].tiers.flatMap(t => t.perks).filter(p => ['Critical Parallel', 'Hoplite Virtue'].includes(p.name))
        .map(p => ({ key: 'inc:' + p.name, name: p.name, effects: p.effects }));
      const r = calc({ weapon: find.weapon('Lex Prime'), slot: 'secondary', incarnon: inc }, { enemy: find.enemy('Heavy Gunner'), level: 115 }, data);
      near(r.stats.critChance, 0.44, 1e-9); near(r.stats.critMultiplier, 2.4, 1e-9);
      near(r.hit.health, (18.75 * 1.5 + 18.75 + 162.5) * 0.1, 1e-6);
    },
  },
  {
    name: 'Экзальт: Железный посох × сила способностей 130%',
    run({ data, find, near }) {
      const t = { enemy: NEUTRAL, level: 1 };
      const a = calc({ weapon: find.weapon('Iron Staff'), slot: 'melee' }, t, data).hit.health;
      const b = calc({ weapon: find.weapon('Iron Staff'), slot: 'melee', exaltedStrength: 1.3 }, t, data).hit.health;
      near(b, a * 1.3, 1e-6);
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
  // ---------- этап 8: вместимость, анализ, ссылка, AlecaFrame ----------
  {
    name: 'Вместимость: Hornet Strike R10 (14) — V-слот 7, D-слот 18, без полярности 14',
    run({ data, find, eq }) {
      const m = find.mod('secondary', 'Hornet Strike');
      eq(modCost(m, 10, 'madurai'), 7); eq(modCost(m, 10, 'vazarin'), 18); eq(modCost(m, 10, null), 14);
      eq(modCost(m, 10, 'any'), 7); eq(polarityMatch('any', 'umbra'), false);
    },
  },
  {
    name: 'Вместимость: Corrosive Projection R5 в «—»-ауре даёт +14, с Реактором 60 + 14 = 74',
    run({ data, find, eq }) {
      const cp = find.mod('warframe', 'Corrosive Projection');
      eq(modCost(cp, 5, 'naramon'), -14); eq(modCost(cp, 5, null), -7); eq(modCost(cp, 5, 'madurai'), -5);
      const c = capacity({ catalyst: true, slots: [{ mod: find.mod('warframe', 'Vitality'), rank: 10, polarity: 'vazarin' }], bonusSlot: { mod: cp, rank: 5, polarity: 'naramon' } });
      eq(c.max, 74); eq(c.used, Math.ceil((2 + 10) / 2)); eq(c.bonus, 14);
      eq(capacity({ catalyst: false }).max, 30);
    },
  },
  {
    name: 'Forma: новые полярности считаются, перестановка врождённых — нет',
    run({ eq }) {
      eq(formaCount(['madurai', 'vazarin', null, 'naramon'], ['madurai', null, null, 'Vazarin']), 1);
      eq(formaCount(['madurai', 'madurai', 'any'], ['Madurai', 'Universal', 'None']), 1);
    },
  },
  {
    name: 'Вклад модов: Hornet Strike +220% — без него DPS падает на 1 − 1/3,2 ≈ 68,75%',
    run({ data, find, near }) {
      const build = { weapon: find.weapon('Lex Prime'), mods: [{ item: find.mod('secondary', 'Hornet Strike'), rank: 10 }] };
      const { rows } = modContribution(build, { enemy: NEUTRAL, level: 1 }, data, { crit: 'avg' });
      near(rows[0].loss, 1 - 1 / 3.2, 0.01);
    },
  },
  {
    name: 'Пороговые уровни: Лекс Прайм → Пулемётчица, уровни не убывают с числом выстрелов и точны на границе',
    run({ data, find, eq }) {
      const build = { weapon: find.weapon('Lex Prime'), mods: [{ item: find.mod('secondary', 'Hornet Strike'), rank: 10 }] };
      const target = { enemy: find.enemy('Heavy Gunner') };
      const t = shotThresholds(build, target, data, { part: 'head', crit: 'avg' });
      for (let i = 1; i < t.length; i++) if (t[i].level < t[i - 1].level) throw new Error('уровни убывают: ' + JSON.stringify(t));
      const shots = lvl => calc(build, { ...target, level: lvl }, data, { part: 'head', crit: 'avg' }).kill.shots;
      for (const x of t) if (x.level > 0 && x.level < 9999) { eq(shots(x.level) <= x.shots, true); eq(shots(x.level + 1) > x.shots, true); }
    },
  },
  {
    name: 'Ссылка на билд: кодирование и раскодирование без потерь',
    async run({ eq }) {
      const st = { cat: 'secondary', weapon: 'Laetum', mods: [{ id: '/Lotus/Upgrades/Mods/Pistol/WeaponDamageAmountMod', rank: 10 }, null], pol: { 'w:Laetum': { slots: ['madurai'] } }, ru: 'Ёж' };
      const code = await encodeBuild(st);
      eq(/^[zj][\w-]+$/.test(code), true);
      eq(JSON.stringify(await decodeBuild(code)), JSON.stringify(st));
    },
  },
  {
    name: 'AlecaFrame: расшифровка, ранги модов, полярности слотов, осколки',
    async run({ data, eq }) {
      const inv = { Upgrades: [{ ItemId: { $oid: 'a1' }, ItemType: '/Lotus/Upgrades/Mods/Pistol/WeaponDamageAmountMod', UpgradeFingerprint: '{"lvl":7}' }],
        Suits: [{ ItemType: '/Lotus/Powersuits/Oraxia/Oraxia', Polarity: [{ Slot: 3, Value: 'AP_ATTACK' }, { Slot: 8, Value: 'AP_TACTIC' }],
          ArchonCrystalUpgrades: [{ Color: 'ACC_GREEN_MYTHIC', UpgradeType: '/Lotus/Upgrades/Invigorations/ArchonCrystalUpgrades/ArchonCrystalUpgradeToxinDamageMythic' }, {}] }] };
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('LEO-ALEC\tEO-ALEC'), { name: 'AES-CBC' }, false, ['encrypt']);
      const iv = new Uint8Array([49, 50, 70, 71, 66, 51, 54, 45, 76, 69, 51, 45, 113, 61, 57, 0]);
      const enc = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, new TextEncoder().encode(JSON.stringify({ InventoryJson: JSON.stringify(inv) })));
      const got = await readAleca({ arrayBuffer: async () => enc });
      const look = upgradeLookup(got);
      eq(look('a1').rank, 7); eq(look('/Lotus/Upgrades/Mods/Rifle/Foo').rank, 0); eq(look('zz'), null);
      const sp = slotPolarities(got.Suits[0]);
      eq(sp[3], 'madurai'); eq(sp[8], 'naramon');
      const sh = readShards(got.Suits[0], data.shards);
      eq(sh[0].color, 'emerald'); eq(sh[0].tau, true); eq(sh[0].effect, 'toxin_status'); eq(sh[1], null);
    },
  },
  {
    name: 'Инкарнон: у Торида и Парных Токсоцистов есть эволюции, условный мультивыстрел Торида разобран',
    run({ data, eq }) {
      eq(data.incarnon['Torid'].tiers.map(t => t.tier).join(), '2,3,4');
      eq(data.incarnon['Dual Toxocyst'].tiers.map(t => t.tier).join(), '2,3,4');
      const ff = data.incarnon['Torid'].tiers[0].perks.find(p => p.name === 'Final Fusillade');
      const ms = ff.effects.find(e => e.stat === 'multishot_base');
      eq(ms.value, 3); eq(!!ms.condition?.trigger, true);
    },
  },
  {
    name: "King's Gambit (Sicarus Prime): по телу шанс крита 0, в голову +150%",
    run({ data, find, near }) {
      const kg = data.incarnon['Sicarus Prime'].tiers.flatMap(t => t.perks).find(p => p.name === "King's Gambit");
      const build = { weapon: find.weapon('Sicarus Prime'), incarnon: [{ key: 'inc', name: kg.name, effects: kg.effects }] };
      const t = { enemy: NEUTRAL, level: 1 };
      const base = find.weapon('Sicarus Prime').attacks[0].critChance;
      near(calc(build, t, data, { part: 'body' }).stats.critChance, 0, 1e-9);
      near(calc(build, t, data, { part: 'head' }).stats.critChance, base * 2.5, 1e-9);
    },
  },
  {
    name: 'Flensing Spikes (Latron Prime): 3 стака Пронзания снимают 60% брони Пулемётчицы',
    run({ data, find, near }) {
      const fs = data.incarnon['Latron Prime'].tiers.flatMap(t => t.perks).find(p => p.name === 'Flensing Spikes');
      const build = { weapon: find.weapon('Latron Prime'), incarnon: [{ key: 'inc', name: fs.name, effects: fs.effects }], stacks: { inc: 3 } };
      near(calc(build, { enemy: find.enemy('Heavy Gunner'), level: 115 }, data, {}).enemy.armor, 2700 * 0.4, 1e-6);
    },
  },
  {
    name: 'Мод разлома как обычный мод: +100% урона и +60% Токсина к 100 Удара → 200 + 118,75 (квант 1/32)',
    run({ data, near }) {
      const riven = { id: 'riven', name: 'Riven', ranks: [[{ stat: 'damage', value: 1, bucket: 'base_damage' }, { stat: 'element_toxin', value: 0.6, bucket: 'element' }]] };
      const r = calc({ weapon: W({ Impact: 100 }), mods: [{ item: riven, rank: 0 }] }, { enemy: NEUTRAL, level: 1 }, data, {});
      near(r.hit.health, 200 + Math.round(120 / 3.125) * 3.125, 1e-9);
    },
  },
  {
    name: 'Мод разлома из AlecaFrame: границы ролла совпадают с таблицей вики (пистолет, 2 плюса + минус, ранг 8)',
    run({ near, eq }) {
      const fp = v => ({ lvl: 8, pol: 'AP_TACTIC', buffs: [{ Tag: 'WeaponDamageAmountMod', Value: v }, { Tag: 'WeaponCritDamageMod', Value: v }],
        curses: [{ Tag: 'WeaponFactionDamageGrineer', Value: v }] });
      const lo = rivenFromFingerprint({ type: '/Lotus/Upgrades/Mods/Randomized/LotusPistolRandomModRare', fp: fp(0) });
      const hi = rivenFromFingerprint({ type: '/Lotus/Upgrades/Mods/Randomized/LotusPistolRandomModRare', fp: fp(0x3FFFFFFF) });
      near(lo.stats[0].value, 293.5, 0.05); near(hi.stats[0].value, 358.7, 0.05);      // урон 219,6% × 1,2 × 1,2375 × (0,9…1,1)
      near(lo.stats[1].value, 120.3, 0.05); near(hi.stats[1].value, 147.0, 0.05);      // крит. урон
      eq(lo.stats[2].stat, 'faction_grineer'); near(lo.stats[2].value, -24.1, 0.05);   // 45 × 1,2 × −0,495 × 0,9
      eq(lo.drain, 18); eq(lo.polarity, 'naramon');
      const r0 = rivenFromFingerprint({ type: '/Lotus/Upgrades/Mods/Randomized/LotusPistolRandomModRare', fp: { ...fp(0), lvl: 0 } });
      near(r0.stats[0].value, Math.round(293.5 / 9 * 10) / 10, 0.11);                  // ранг 0 — 1/9 от максимума
      eq(rivenFromFingerprint({ type: 'x', fp: { challenge: {} } }), null);           // нераскрытый
    },
  },
  {
    name: 'Стальной Путь: здоровье и щиты ×2,5, броня та же; Overguard Эксимуса 12 × множитель уровня',
    run({ data, find, near }) {
      const hg = find.enemy('Heavy Gunner');
      const a = enemyState(hg, { level: 115 }, data.scaling, data.damage);
      const b = enemyState(hg, { level: 115, steelPath: true, eximus: true }, data.scaling, data.damage);
      near(b.health, a.health * 2.5, 1e-6); near(b.armor, a.armor, 1e-9);
      near(overguardMultiplier(1), 1, 1e-9); near(overguardMultiplier(30), 1 + 0.0015 * 29 ** 4, 1e-6);
      near(overguardMultiplier(50), 1 + 260 * 49 ** 0.9, 1e-6); near(b.overguard, 12 * overguardMultiplier(115), 1e-6);
    },
  },
  {
    name: 'Холод (вики): +0,1× за 1 стак, +0,5× на 9, заморозка +1,0×; Кунаи с Primed Target Cracker → 3,86×',
    run({ near }) {
      near(coldCritBonus(1), 0.1, 1e-9); near(coldCritBonus(9), 0.5, 1e-9); near(coldCritBonus(10), 1, 1e-9);
      near(1.6 * (1 + 1.1) + coldCritBonus(9), 3.86, 1e-9);
    },
  },
  {
    name: 'Эксимус: выстрелов до убийства больше на Overguard / урон по Overguard (броня его не защищает)',
    run({ data, find, eq }) {
      const t = { enemy: find.enemy('Heavy Gunner'), level: 115 };
      const a = calc({ weapon: find.weapon('Lex Prime') }, t, data, {});
      const b = calc({ weapon: find.weapon('Lex Prime') }, { ...t, eximus: true }, data, {});
      const og = b.enemy.overguard / b.perShot.overguard;
      eq(b.kill.shots, Math.ceil(a.perShot.health > 0 ? a.enemy.health / a.perShot.health + og : 0));
    },
  },
  {
    name: 'Galvanized Steel: «+110% шанса крита (×2 на тяжёлых)» — на тяжёлом ударе +220%',
    run({ data, find, near }) {
      const gs = find.mod('melee', 'Galvanized Steel');
      const b = mode => calc({ weapon: find.weapon('Paracesis'), slot: 'melee', meleeMode: mode, mods: [{ item: gs, rank: 10 }] },
        { enemy: NEUTRAL, level: 1 }, data, {}).stats.critChance;
      const base = find.weapon('Paracesis').attacks[0].critChance;
      near(b('normal'), base * 2.1, 1e-9); near(b('heavy') / b('normal'), 3.2 / 2.1, 1e-9);
    },
  },
  {
    name: 'Новые баффы: Psychic Bolts 80% брони, Magnetize ×2, Метроном +30%, Wrathful Advance +200% крита, Speed +75% скорости атаки',
    run({ data, find, near }) {
      const R = (a, slot) => resolveBuffs(a.map(x => ({ on: true, strength: 100, ...x })), data.buffs.buffs, { slot });
      const t = R([{ id: 'psychic_bolts' }, { id: 'magnetize' }]);
      near(t.armorStrip, 0.8, 1e-9); near(t.vulnerability, 1, 1e-9);
      near(R([{ id: 'psychic_bolts', strength: 200 }]).armorStrip, 1, 1e-9);            // не больше 100%
      const tgt = { enemy: NEUTRAL, level: 1 };
      const base = calc({ weapon: find.weapon('Lex Prime') }, tgt, data);
      const opera = R([{ id: 'metronome', variant: 'opera' }], 'secondary');
      near(calc({ weapon: find.weapon('Lex Prime'), slot: 'secondary', buffs: opera.weaponSources }, tgt, data).stats.multishot, base.stats.multishot * 1.3, 1e-9);
      const melee = R([{ id: 'wrathful_advance' }, { id: 'speed' }, { id: 'metronome', variant: 'forte' }], 'melee');
      const p0 = calc({ weapon: find.weapon('Paracesis'), slot: 'melee' }, tgt, data);
      const p1 = calc({ weapon: find.weapon('Paracesis'), slot: 'melee', buffs: melee.weaponSources }, tgt, data);
      near(p1.stats.critChance, p0.stats.critChance + 2, 1e-9);
      near(p1.stats.fireRate, p0.stats.fireRate * 1.75, 1e-9);
      const forte = R([{ id: 'metronome', variant: 'forte' }], 'melee');                 // Forte отдельно: крит не мешает
      near(calc({ weapon: find.weapon('Paracesis'), slot: 'melee', buffs: forte.weaponSources }, tgt, data).hit.health / p0.hit.health, 1.3, 0.01);
    },
  },
  {
    name: 'Шоковый Пехотинец: +100% Электричества не объединяется (Огонь остаётся Огнём, Токсин Торида — Токсином)',
    run({ data, find, eq, near }) {
      const st = resolveBuffs([{ id: 'shock_trooper', on: true, strength: 100 }], data.buffs.buffs, { slot: 'secondary' }).weaponSources;
      const heat = { name: 'Heat', effects: [{ stat: 'element_heat', value: 0.9, bucket: 'element' }] };
      const types = r => r.stats.elements.map(e => e.type).sort().join(',');
      const lex = calc({ weapon: find.weapon('Lex Prime'), buffs: [heat, ...st] }, { enemy: NEUTRAL, level: 1 }, data);
      eq(types(lex), 'Electricity,Heat');
      near(lex.stats.elements.find(e => e.type === 'Electricity').bonus, 1, 1e-9);
      const torid = calc({ weapon: find.weapon('Torid'), buffs: st }, { enemy: NEUTRAL, level: 1 }, data);
      eq(types(torid), 'Electricity,Toxin');
      const elec = { name: 'Elec', effects: [{ stat: 'element_electricity', value: 0.9, bucket: 'element' }] };
      const both = calc({ weapon: find.weapon('Lex Prime'), buffs: [elec, ...st] }, { enemy: NEUTRAL, level: 1 }, data);
      eq(types(both), 'Electricity'); near(both.stats.elements[0].bonus, 1.9, 1e-9);   // складывается с модом на Электричество
    },
  },
  {
    name: 'Аугменты союзников: Инфузия Кары — Радиация отдельно от Огня (пример вики), броня и уязвимость от Гельминта',
    run({ data, find, near, eq }) {
      const R = (a, slot) => resolveBuffs(a.map(x => ({ on: true, strength: 100, ...x })), data.buffs.buffs, { slot });
      // вики Smite Infusion: 100 Удара + Hellfire + Инфузия при 110% силы -> 100 Удара, 90 Огня, 110 Радиации
      const w = W({ Impact: 100 });
      const hellfire = { name: 'Hellfire', effects: [{ stat: 'element_heat', value: 0.9, bucket: 'element' }] };
      const r = calc({ weapon: w, buffs: [hellfire, ...R([{ id: 'smite_infusion', strength: 110 }]).weaponSources] }, { enemy: NEUTRAL, level: 1 }, data);
      near(r.stats.types.Heat, 90, 3.125 / 2); near(r.stats.types.Radiation, 110, 3.125 / 2); near(r.stats.types.Impact, 100, 1e-9);   // ± полшага кванта 1/32
      const t = R([{ id: 'seeking_shuriken' }, { id: 'fracturing_crush' }]);
      near(t.armorStrip, 1, 1e-9);                                                       // 70% + 75% -> не больше 100%
      near(R([{ id: 'rage' }, { id: 'petrify', strength: 300 }]).vulnerability, 1.0, 1e-9);   // Ярость 50% + Окаменение 50% (не от силы)
      near(R([{ id: 'critical_surge', input: 30 }], 'primary').weaponSources[0].effects[0].value, 2.5, 1e-9);  // 10% × 30 м, но не больше 250%
      eq(R([{ id: 'critical_surge', input: 10 }], 'secondary').weaponSources[0].effects[0].condition.slot, 'primary');
    },
  },
  {
    name: 'Статусы от способностей: Пронзание +5% шанса крита за стак (до 25%), Neote/Tempest Barrage/Wyrd Scythes выставляют стаки',
    run({ data, find, near, eq }) {
      const lex = find.weapon('Lex Prime');
      const r0 = calc({ weapon: lex }, { enemy: NEUTRAL, level: 1 }, data);
      const r5 = calc({ weapon: lex }, { enemy: NEUTRAL, level: 1, status: { puncture: 9 } }, data);
      near(r5.crit.chance, r0.crit.chance + 0.25, 1e-9);                       // не больше 5 стаков
      const st = resolveBuffs([{ id: 'neote', on: true }, { id: 'tempest_barrage', on: true }, { id: 'wyrd_scythes', on: true, variant: 'spin' }, { id: 'fire_walker', on: true }],
        data.buffs.buffs).statuses;
      eq(JSON.stringify(st), JSON.stringify({ cold: 10, puncture: 5, corrosive: 10, viral: 7, heat: 1 }));
      const hg = { enemy: find.enemy('Heavy Gunner'), level: 115 };
      near(calc({ weapon: lex }, { ...hg, status: { corrosive: 10, heat: true } }, data).enemy.armor, 2700 * 0.2 * 0.5, 1e-6);   // −80% и −50%
    },
  },
  {
    name: 'Инкарнон ближнего боя (Genesis): у Аку и Бранта есть эволюции, «Spectral Axe» — атака формы Инкарнона',
    run({ data, find, eq }) {
      const w = find.weapon('Ack & Brunt');
      eq(!!data.incarnon['Ack & Brunt'], true);
      const ax = w.attacks.findIndex(a => a.attackName === 'Spectral Axe');
      eq(w.attacks[ax].incarnonForm, true);
      // перк «for Incarnon Form» работает только на атаке формы
      const perk = { key: 'inc', name: 'Тест', effects: [{ stat: 'damage', value: 1, bucket: 'base_damage', condition: { form: 'incarnon' } }] };
      const hit = i => calc({ weapon: w, attack: i, slot: 'melee', incarnon: [perk] }, { enemy: NEUTRAL, level: 1 }, data).hit.health;
      const plain = i => calc({ weapon: w, attack: i, slot: 'melee' }, { enemy: NEUTRAL, level: 1 }, data).hit.health;
      eq(Math.round(hit(ax) / plain(ax) * 100) / 100, 2); eq(hit(0), plain(0));
    },
  },
  {
    name: 'Мистификаторы фрейма: Crepuscular +3 к итоговому крит. множителю (вики: Скана 1,5 -> 4,5), Arachne только для основного и вторичного',
    run({ data, find, near, eq }) {
      const arcs = data.arcanes.warframe;
      const crep = arcs.find(a => a.name === 'Arcane Crepuscular');
      const skana = find.weapon('Skana');
      const src = [{ key: 'arc', name: 'Crepuscular', effects: crep.ranks[crep.ranks.length - 1] }];
      const r = calc({ weapon: skana, slot: 'melee', buffs: src, flags: { invisible: true } }, { enemy: NEUTRAL, level: 1 }, data);
      near(r.stats.critMultiplier, skana.attacks[0].critMultiplier + 3, 1e-9);
      const arachne = arcs.find(a => a.name === 'Arcane Arachne').ranks.at(-1)[0];
      eq(arachne.condition.notSlot, 'melee'); near(arachne.value, 1.5, 1e-9);
    },
  },
  {
    name: 'Weeping Wounds: +40% шанса статуса × (комбо − 1), как Blood Rush — при 12× это +440%',
    run({ data, find, near }) {
      const ww = find.mod('melee', 'Weeping Wounds');
      const sc = combo => calc({ weapon: find.weapon('Paracesis'), slot: 'melee', comboMultiplier: combo, mods: [{ item: ww, rank: ww.maxRank }] },
        { enemy: NEUTRAL, level: 1 }, data).stats.statusChance;
      const base = find.weapon('Paracesis').attacks[0].statusChance;
      near(sc(1), base, 1e-9); near(sc(12), base * (1 + 0.4 * 11), 1e-9);
    },
  },
  {
    name: 'Мистификаторы оружия со стаками: Cascadia Flare 40 стаков = +480% урона, Secondary Surge ×8, без стаков — выключены',
    run({ data, find, near }) {
      const arc = n => data.arcanes.secondary.find(a => a.name === n);
      const lex = find.weapon('Lex Prime');
      const hit = (item, stacks) => calc({ weapon: lex, slot: 'secondary', arcanes: [{ item, rank: 5 }], stacks }, { enemy: NEUTRAL, level: 1 }, data).hit.health;
      const base = calc({ weapon: lex, slot: 'secondary' }, { enemy: NEUTRAL, level: 1 }, data).hit.health;
      near(hit(arc('Cascadia Flare'), {}), base, 1e-9);                                     // условие не включено
      const key = 'arc:' + arc('Cascadia Flare').id;
      near(hit(arc('Cascadia Flare'), { [key]: 40 }) / base, 5.8, 0.02);                      // 1 + 4,8
      near(hit(arc('Secondary Surge'), { ['arc:' + arc('Secondary Surge').id]: 8 }) / base, 8, 1e-6);
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
    frame: name => { const f = data.warframes.find(x => x.name === name); if (!f) throw new Error('нет фрейма ' + name); return f; },
    arcane: (group, name) => { const m = data.arcanes[group].find(x => x.name === name); if (!m) throw new Error('нет мистификатора ' + name); return m; },
  };
  const near = (a, b, eps = 1e-6) => { if (!(Math.abs(a - b) <= eps)) throw new Error(`ожидалось ${b} ± ${eps}, получено ${a}`); };
  const eq = (a, b) => { if (a !== b) throw new Error(`ожидалось ${JSON.stringify(b)}, получено ${JSON.stringify(a)}`); };
  return { data, find, near, eq };
}

export const DATA_FILES = {
  scaling: 'data/manual/scaling.json', damage: 'data/damage.json', enemies: 'data/enemies.json',
  weapons: { primary: 'data/weapons/primary.json', secondary: 'data/weapons/secondary.json', melee: 'data/weapons/melee.json' },
  mods: { secondary: 'data/mods/secondary.json', primary: 'data/mods/primary.json', warframe: 'data/mods/warframe.json', melee: 'data/mods/melee.json' },
  incarnon: 'data/incarnon.json',
  warframes: 'data/warframes.json', shards: 'data/manual/shards.json', buffs: 'data/manual/buffs.json',
  arcanes: { secondary: 'data/arcanes/secondary.json', warframe: 'data/arcanes/warframe.json' },
};
