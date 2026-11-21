// Расчёт урона оружия по противнику. Чистые функции, без DOM.
// Формулы: https://wiki.warframe.com/w/Damage/Calculation , /w/Extra_Hit , /w/Critical_Hit ,
// /w/Status_Effect , /w/Damage/Toxin_Damage (и другие страницы типов урона), /w/Enemy_Body_Parts

import { DOT, DOT_TICKS, TYPE_RU } from './constants.js';
import { collect, itemEffects } from './effects.js';
import { moddedAttack, critInfo } from './weapon.js';
import { enemyState } from './enemy.js';

const r2 = x => Math.round(x * 100) / 100;
const fmt = x => (Math.round(x * 1000) / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 3 });

/** Источники эффектов сборки: моды по порядку слотов, мистификаторы, внешние баффы. */
export function buildSources(build) {
  const src = [];
  for (const m of build.mods || []) {
    if (m?.item) src.push({ key: 'mod:' + (m.item.id || m.item.name), name: m.item.ru || m.item.name, effects: itemEffects(m.item, m.rank) });
  }
  for (const a of build.arcanes || []) {
    if (a?.item) src.push({ key: 'arc:' + (a.item.id || a.item.name), name: a.item.ru || a.item.name, effects: itemEffects(a.item, a.rank) });
  }
  for (const b of build.buffs || []) src.push({ key: 'buff:' + b.name, name: b.name, effects: b.effects || [] });
  return src;
}

/**
 * build:  { weapon, attack, mods: [{item, rank}], arcanes, buffs: [{name, effects}],
 *           extraHits: [{name, pct, type, statusChance, ability}], stacks, flags, slot }
 * target: { enemy (запись data/enemies.json), level, armorStrip, drOverride, factionOverride, status, vulnerability }
 * data:   { scaling, damage }
 * opts:   { part: 'body'|'head', crit: 'none'|'avg'|'crit'|<уровень крита>, headcrit: true }
 */
export function calc(build, target, data, opts = {}) {
  const steps = [];
  const enemy = enemyState(target.enemy, target, data.scaling, data.damage);
  const ctx = {
    faction: enemy.faction, stacks: build.stacks || {}, flags: build.flags || {},
    statusTypes: build.statusTypes ?? enemy.statusTypes, comboMultiplier: build.comboMultiplier, slot: build.slot,
  };
  const eff = collect(buildSources(build), ctx);
  const A = moddedAttack(build.weapon, build.attack || 0, eff);

  // ---- часть тела и крит
  const head = opts.part === 'head';
  const headBase = enemy.multis.Head ?? 1;
  const bodyMult = head ? headBase * (1 + A.headshotBonus) + 1.5 * A.weakpointBonus : 1;
  const cdHead = head && opts.headcrit !== false && headBase > 1 ? 2 : 1;      // крит в голову: ×2 к множителю крита (TODO_VERIFY)
  const ci = critInfo(A.critChance, A.critMultiplier * cdHead);
  const critFor = mode => {
    if (mode === 'avg') return ci.average;
    if (mode === 'crit') return ci.tierMult(Math.max(1, ci.highTier));
    if (typeof mode === 'number') return ci.tierMult(mode);
    return ci.tierMult(ci.lowTier);                         // «без крита» = нижний гарантированный уровень
  };
  const critMode = opts.crit ?? 'none';
  const K = critFor(critMode);

  // ---- удар оружия (один снаряд)
  const F = A.factionBonus;
  const preMult = (1 + A.damageBonus) * (1 + F) * A.finalMult;     // без слабостей врага, брони, крита и части тела
  const healthFactor = enemy.healthMult * (1 + enemy.vulnerability);
  const armorFactor = type => (type === 'True' ? 1 : 1 - enemy.dr);
  const perType = {};
  let hitHealth = 0, hitShield = 0;
  for (const [type, v] of Object.entries(A.types)) {
    const base = v * preMult * (1 + A.directBonus) * K * bodyMult;
    const h = base * enemy.dtm(type) * armorFactor(type) * healthFactor;
    const s = type === 'Toxin' ? 0 : base * enemy.dtm(type) * enemy.shieldMult * (1 + enemy.vulnerability);
    perType[type] = { quantized: v, vsHealth: h, vsShield: s, dtm: enemy.dtm(type) };
    hitHealth += h; hitShield += s;
  }
  const weaponHit = A.typesTotal * preMult * K * bodyMult;            // «Weapon Hit Damage» для доп. ударов

  steps.push({
    label: 'Урон за снаряд до противника',
    formula: `${Object.entries(A.types).map(([t, v]) => `${TYPE_RU[t]} ${fmt(v)}`).join(' + ')} = ${fmt(A.typesTotal)}` +
      ` × (1 + ${fmt(A.damageBonus)}) × (1 + ${fmt(F)})${A.finalMult !== 1 ? ` × ${fmt(A.finalMult)}` : ''} × крит ${fmt(K)} × часть тела ${fmt(bodyMult)}`,
    value: weaponHit,
  });
  steps.push({
    label: 'По здоровью врага',
    formula: Object.entries(perType).map(([t, p]) =>
      `${TYPE_RU[t]}: ${fmt(p.quantized * preMult * (1 + A.directBonus) * K * bodyMult)} × ${fmt(p.dtm)} × (1 − ${fmt(t === 'True' ? 0 : enemy.dr)})` +
      (healthFactor !== 1 ? ` × ${fmt(healthFactor)}` : '') + ` = ${fmt(p.vsHealth)}`).join('; '),
    value: hitHealth,
  });

  // ---- доп. удары (Ораксия, Xata's Whisper …)
  const extra = (build.extraHits || []).map(x => {
    const pre = weaponHit * x.pct * (1 + F);
    const resist = x.ability ? enemy.abilityResist : 0;
    const dmg = pre * enemy.dtm(x.type) * armorFactor(x.type) * (1 - resist) * healthFactor;
    const dot = DOT[x.type];
    let tick = 0;
    if (dot && x.statusChance) {
      const tb = A.elemBonus[x.type] || 0;
      tick = dot.coef * pre * (1 + tb) * (1 + A.statusDamage) * (1 + F) * enemy.dtm(x.type) *
        (dot.ignoresArmor ? 1 : 1 - enemy.dr) * (1 - resist) * healthFactor;
      steps.push({
        label: `${x.name}: тик`,
        formula: `${dot.coef} × ${fmt(pre)} × (1 + ${fmt(tb)}) × (1 + ${fmt(A.statusDamage)}) × (1 + ${fmt(F)}) × ${fmt(enemy.dtm(x.type))}` +
          ` × (1 − ${fmt(dot.ignoresArmor ? 0 : enemy.dr)}) × (1 − ${fmt(resist)})`,
        value: tick,
      });
    }
    steps.push({
      label: `${x.name}: доп. удар`,
      formula: `${fmt(weaponHit)} × ${fmt(x.pct)} × (1 + ${fmt(F)}) × ${fmt(enemy.dtm(x.type))} × (1 − ${fmt(enemy.dr)}) × (1 − ${fmt(resist)})`,
      value: dmg,
    });
    return { name: x.name, type: x.type, pre, damage: dmg, tick, ticks: DOT_TICKS, procChance: x.statusChance || 0 };
  });

  // ---- статусы оружия: распределение по типам ∝ урону типа (до слабостей врага)
  const procs = {};
  const sc = A.statusChance;
  for (const [type, v] of Object.entries(A.types)) {
    if (A.typesTotal > 0) procs[type] = sc * v / A.typesTotal;
  }
  for (const fp of A.forcedProcs) {                       // Hunter Munitions, Internal Bleeding
    const proc = fp.condition?.proc ? fp.condition.proc[0].toUpperCase() + fp.condition.proc.slice(1) : 'Slash';
    let extraP = 0;
    if (fp.condition?.on === 'crit') extraP = Math.min(1, ci.chance) * fp.value;
    if (fp.condition?.on === 'impact_proc') {
      const x2 = fp.condition.x2_below_fire_rate && A.fireRate < fp.condition.x2_below_fire_rate ? 2 : 1;
      extraP = (procs.Impact || 0) * Math.min(1, fp.value * x2);
    }
    procs[proc] = (procs[proc] || 0) + extraP;
  }
  const mbd = A.baseTotal * (1 + A.damageBonus) * (1 + F) * A.finalMult;   // «Modified Base Damage» для тиков
  const ticks = DOT_TICKS * (1 + A.statusDuration);
  const dots = {};
  let dotPerPellet = 0;
  for (const [type, p] of Object.entries(procs)) {
    const d = DOT[type];
    if (!d || !p) continue;
    const tb = type === 'Slash' ? 0 : (A.elemBonus[type] || 0);
    const tick = d.coef * mbd * (1 + tb) * (1 + F) * (1 + A.statusDamage) * K * bodyMult *
      enemy.dtm(type) * (d.ignoresArmor ? 1 : 1 - enemy.dr) * healthFactor;
    dots[type] = { procsPerPellet: p, tick, ticks, perProc: tick * ticks };
    dotPerPellet += p * tick * ticks;
  }

  // ---- выстрел, DPS, время на убийство
  const ms = A.multishot;
  const extraPerPellet = extra.reduce((a, x) => a + x.damage + x.procChance * x.tick * x.ticks, 0);
  const shotHealth = (hitHealth + extraPerPellet + dotPerPellet) * ms;
  const shotShield = hitShield * ms;
  const fr = A.fireRate;
  const sustainedFactor = A.magazine && A.reload ? (A.magazine / fr) / (A.magazine / fr + A.reload) : 1;
  const ehpShots = (enemy.shield > 0 && shotShield > 0 ? enemy.shield / shotShield : 0) +
    (shotHealth > 0 ? enemy.health / shotHealth : Infinity);
  const shots = Math.ceil(ehpShots);
  const reloads = A.magazine ? Math.floor((shots - 1) / A.magazine) : 0;
  const ttk = shots / fr - 1 / fr + reloads * (A.reload || 0);

  return {
    enemy, stats: A, crit: ci, critUsed: K, bodyMult,
    hit: { perType, health: hitHealth, shield: hitShield, weaponHit, shown: Math.round(hitHealth) },
    extra, procs, dots,
    perShot: { health: shotHealth, shield: shotShield, direct: hitHealth * ms, dot: dotPerPellet * ms, extra: extraPerPellet * ms },
    dps: { burst: shotHealth * fr, sustained: shotHealth * fr * sustainedFactor },
    kill: { shots, seconds: Math.max(0, ttk) },
    contrib: eff.contrib,
    steps,
  };
}

/** Урон за выстрел по каждому уровню крита (для таблицы). */
export function critTable(build, target, data, opts = {}) {
  const base = calc(build, target, data, { ...opts, crit: 'none' });
  const tiers = [];
  const top = Math.max(1, base.crit.highTier);
  for (let n = 0; n <= top; n++) {
    const r = calc(build, target, data, { ...opts, crit: n });
    tiers.push({ tier: n, mult: r.critUsed, hit: r.hit.health });
  }
  const avg = calc(build, target, data, { ...opts, crit: 'avg' });
  return { tiers, average: avg.hit.health, chance: base.crit.chance };
}

export { r2 };
