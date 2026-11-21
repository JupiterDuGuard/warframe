// Противник: рост статов с уровнем, броня, модификаторы фракции, статусы на цели. Без DOM.
// Источники: https://wiki.warframe.com/w/Enemy_Level_Scaling , https://wiki.warframe.com/w/Armor ,
// https://wiki.warframe.com/w/Damage (модификаторы ±50%), страницы Viral/Corrosive/Magnetic/Heat/Cold Damage.

import { HEALTH_CURVE, SHIELD_CURVE } from './constants.js';

function curve(q, [c, e]) { return 1 + c * Math.pow(Math.max(q, 0), e); }

/** Множитель стата: две кривые, сшитые smoothstep между L и U. */
export function statMultiplier(q, def, transition = [70, 80]) {
  if (q <= 0) return 1;
  const [L, U] = transition;
  const t = Math.min(1, Math.max(0, (q - L) / (U - L)));
  const s = t * t * (3 - 2 * t);
  const f1 = curve(q, def.f1), f2 = curve(q, def.f2);
  return f1 + (f2 - f1) * s;
}

export function armorDR(armor) {
  const a = Math.max(0, armor);
  return a <= 2700 ? 0.9 * Math.sqrt(a / 2700) : a / (a + 300);
}

/**
 * Статы врага на уровне.
 * opts: { level, armorStrip (0..1 — уже снятая броня), drOverride, factionOverride,
 *         status: { viral, corrosive, magnetic, heat, cold } — стаки статусов на цели }
 * scaling — data/manual/scaling.json, damage — data/damage.json
 */
export function enemyState(enemy, opts, scaling, damage) {
  const level = opts.level ?? enemy.baseLevel ?? 1;
  const q = level - (enemy.baseLevel ?? 1);
  const faction = opts.factionOverride || enemy.faction;
  const hDef = scaling.health.factions[HEALTH_CURVE[faction] || 'Grineer'];
  const sDef = scaling.shield.factions[SHIELD_CURVE[faction] || 'Grineer'];
  const health = (enemy.health || 0) * statMultiplier(q, hDef, scaling.health.transition);
  const shield = (enemy.shield || 0) * statMultiplier(q, sDef, scaling.shield.transition);
  let armorScaled = 0;
  if (enemy.armor) {
    const m = statMultiplier(q, scaling.armor.all, scaling.armor.transition);
    armorScaled = Math.min(scaling.armor.max, Math.max(scaling.armor.min, enemy.armor * m));
  }
  const st = opts.status || {};
  // Коррозия: −26% за первый стак и −6% за каждый следующий, до −80% на 10 стаках
  const corr = st.corrosive ? Math.min(0.8, 0.26 + 0.06 * (Math.min(st.corrosive, 10) - 1)) : 0;
  const heat = st.heat ? 0.5 : 0;                       // Огонь: до −50% брони
  const strip = 1 - (1 - (opts.armorStrip || 0)) * (1 - corr) * (1 - heat);
  const armor = armorScaled * (1 - strip);
  const dr = opts.drOverride ?? armorDR(armor);
  // Вирус: урон по здоровью +100% за первый стак, +25% за каждый следующий (до +325%)
  const viral = st.viral ? 1 + 1 + 0.25 * (Math.min(st.viral, 10) - 1) : 1;
  const magnetic = st.magnetic ? 1 + 1 + 0.25 * (Math.min(st.magnetic, 10) - 1) : 1;
  const matrix = damage.matrix[faction] || {};
  return {
    record: enemy, name: enemy.name, faction, level, health, shield, armorBase: armorScaled, armor, armorStrip: strip, dr,
    abilityResist: enemy.abilityResist || 0, multis: enemy.multis || {},
    vulnerability: opts.vulnerability || 0,
    healthMult: viral, shieldMult: magnetic,
    coldStacks: st.cold || 0,
    statusTypes: Object.values(st).filter(Boolean).length,
    dtm: type => matrix[type] ?? 1,
  };
}
