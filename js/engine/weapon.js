// Статы атаки оружия с модами. Без DOM.
// Источник формул: https://wiki.warframe.com/w/Damage/Calculation (квантование, арсенальный урон)

import { PHYSICAL, PRIMARY, COMBINED, combineTypes } from './constants.js';

/** Квантование: каждый тип округляется до ближайшей 1/32 базового урона атаки. */
export function quantize(value, scale) {
  if (!scale) return value;
  const x = Math.abs(value) / scale;
  return Math.sign(value) * Math.floor(x + 0.5) * scale;
}

/**
 * Объединение стихий в порядке модов; врождённые стихии оружия добавляются последними.
 * modEls: [{type, value}] — value в долях базового урона (Hellfire +165% → 1.65).
 * innate: { Heat: 20, ... } — абсолютный врождённый урон стихий.
 * -> [{ type, bonus, flat, parts: [первичные стихии], sources }]
 */
export function combineElements(modEls, innate = {}) {
  const list = [];
  const add = (type, bonus, flat, source) => {
    if (COMBINED[type] || !PRIMARY.includes(type)) {          // составная или особая: просто суммируется
      const same = list.find(e => e.type === type);
      if (same) { same.bonus += bonus; same.flat += flat; same.sources.push(source); }
      else list.push({ type, bonus, flat, parts: COMBINED[type] || [type], sources: [source] });
      return;
    }
    // первичная: та же стихия (в т.ч. уже вошедшая в составную) — добавляется туда
    const same = list.find(e => e.parts.includes(type) && (e.type === type || COMBINED[e.type]));
    if (same) { same.bonus += bonus; same.flat += flat; same.sources.push(source); return; }
    // иначе объединяется с первой одиночной первичной стихией
    const open = list.find(e => PRIMARY.includes(e.type));
    if (open) {
      const t = combineTypes(open.type, type);
      open.parts = [open.type, type];
      open.type = t;
      open.bonus += bonus; open.flat += flat; open.sources.push(source);
      return;
    }
    list.push({ type, bonus, flat, parts: [type], sources: [source] });
  };
  for (const e of modEls) add(e.type, e.value, 0, e.source);
  for (const [type, amount] of Object.entries(innate)) {
    if (amount) add(type, 0, amount, 'врождённый');
  }
  return list;
}

/**
 * Статы атаки с модами.
 * weapon — запись из data/weapons/*.json; attack — индекс атаки.
 * eff — результат effects.collect().
 */
export function moddedAttack(weapon, attackIndex, eff) {
  const atk = weapon.attacks[attackIndex || 0];
  const t = eff.totals;
  const base = atk.damage || {};
  const baseTotal = Object.values(base).reduce((a, b) => a + b, 0);
  const scale = baseTotal / 32;

  const raw = {};
  for (const p of PHYSICAL) {
    if (base[p]) raw[p] = base[p] * (1 + (t['physical_' + p.toLowerCase()] || 0));
  }
  const innate = {};
  for (const [type, v] of Object.entries(base)) {
    if (!PHYSICAL.includes(type)) innate[type] = v;
  }
  const elements = combineElements(eff.elements, innate);
  for (const e of elements) raw[e.type] = (raw[e.type] || 0) + e.bonus * baseTotal + e.flat;

  const types = {};
  for (const [type, v] of Object.entries(raw)) {
    const q = quantize(v, scale);
    if (q) types[type] = q;
  }
  const typesTotal = Object.values(types).reduce((a, b) => a + b, 0);

  // бонусы к урону стихий по первичным (для тиков статусов: «Toxin Damage Bonuses»)
  const elemBonus = {};
  for (const e of eff.elements) elemBonus[e.type] = (elemBonus[e.type] || 0) + e.value;
  for (const e of elements) if (COMBINED[e.type]) elemBonus[e.type] = e.bonus;

  const msLocked = eff.special.has('multishot_locked');
  const multishot = (atk.multishot || 1) * (msLocked ? 1 : 1 + (t.multishot || 0));
  const critChance = (atk.critChance || 0) * (1 + (t.crit_chance || 0)) + (t.crit_chance_flat || 0);
  const critMultiplier = (atk.critMultiplier || 1) * (1 + (t.crit_damage || 0)) * (eff.critFinal || 1);
  const statusChance = (atk.statusChance || 0) * (1 + (t.status_chance || 0)) + (t.status_chance_flat || 0);
  const fireRate = (atk.fireRate || 1) * (1 + (t.fire_rate || 0) + (t.attack_speed || 0));
  const magazine = weapon.magazine ? Math.max(1, Math.round(weapon.magazine * (1 + (t.magazine || 0)))) : null;
  const reload = weapon.reload ? weapon.reload / (1 + (t.reload_speed || 0)) : null;

  return {
    attack: atk, baseDamage: base, baseTotal, scale, raw, types, typesTotal, elements, elemBonus,
    damageBonus: t.damage || 0, directBonus: t.direct_damage || 0, factionBonus: t.faction || 0,
    statusDamage: t.status_damage || 0, statusDuration: t.status_duration || 0,
    statusDamageType: { Toxin: t.status_damage_toxin || 0 },          // изумрудный осколок: только статус Токсина
    armorStrip: Math.min(1, t.armor_strip || 0), shieldStrip: Math.min(1, t.shield_strip || 0),
    headshotBonus: t.headshot_multiplier || 0, weakpointBonus: t.weakpoint_damage || 0,
    multishot, critChance, critMultiplier, statusChance, fireRate, magazine, reload,
    finalMult: eff.finalMult, forcedProcs: eff.forcedProcs, multishotLocked: msLocked,
  };
}

/** Средний множитель крита и множители уровней. */
export function critInfo(cc, cd) {
  const c = Math.max(0, cc);
  const low = Math.floor(c), high = Math.ceil(c);
  const tierMult = n => 1 + n * (cd - 1);
  return {
    chance: c, multiplier: cd,
    average: 1 + c * (cd - 1),
    lowTier: low, highTier: high, lowMult: tierMult(low), highMult: tierMult(high),
    chanceHigh: c - low,                        // шанс выпасть на уровень выше
    tierMult,
  };
}
