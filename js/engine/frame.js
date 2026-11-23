// Статы фрейма: моды, мистификаторы, осколки архонтов, эффективное здоровье. Без DOM.
// Источники: https://wiki.warframe.com/w/Warframes (рост к 30-му рангу), https://wiki.warframe.com/w/Archon_Shard ,
// https://wiki.warframe.com/w/Armor (снижение урона фрейма: броня / (броня + 300)), https://wiki.warframe.com/w/Adaptation

import { collect, itemEffects } from './effects.js';

const FRAME_BUCKETS = new Set(['frame', 'utility']);
const UMBRA_SET = new Set(['Umbral Vitality', 'Umbral Fiber', 'Umbral Intensify']);
// вики Umbral Vitality / Umbral Intensify: Живучесть и Волокно +30% / +80%, Усиление +25% / +75% (2 / 3 мода комплекта)
const UMBRA_BONUS = { 'Umbral Intensify': { 2: 0.25, 3: 0.75 }, default: { 2: 0.3, 3: 0.8 } };

/**
 * Источники эффектов осколков. shards: [{ color, effect, tau, stacks }] (до 5), shardData — data/manual/shards.json.
 * energy — макс. энергия фрейма (для Фиолетового: ×2 крит. урона ближнего боя при энергии > 500).
 */
export function shardSources(shards, shardData, energy = 0) {
  const defs = {};
  for (const c of shardData.colors) for (const e of c.effects) defs[c.id + ':' + e.id] = { ...e, color: c };
  const count = colors => shards.filter(s => s && colors.includes(s.color)).length;
  const out = [];
  shards.forEach((s, i) => {
    if (!s) return;
    const d = defs[s.color + ':' + s.effect];
    if (!d) return;
    const k = s.tau ? shardData.tauMultiplier : 1;
    let value = s.tau && d.tauValue != null ? d.tauValue : d.value * k;
    if (d.perShard) value += d.perShard * k * count(d.perShardColors);       // Фиолетовый: +10% за каждый Багровый/Лазурный/Фиолетовый
    if (d.doubleIfEnergyOver && energy > d.doubleIfEnergyOver) value *= 2;
    const cond = { ...(d.condition || {}) };
    if (d.stacksMax) cond.stacks = s.tau && d.stacksMaxTau ? d.stacksMaxTau : d.stacksMax;
    const eff = { stat: d.stat, value: Math.round(value * 1e6) / 1e6, bucket: d.bucket };
    if (Object.keys(cond).length) eff.condition = cond;
    out.push({ key: 'shard:' + i, name: `${s.tau ? 'Таукованый ' : ''}${d.color.ru} осколок: ${d.ru}`, effects: [eff], target: d.target });
  });
  return out;
}

const clampMin = (x, m) => Math.max(m, x);

/**
 * frame — запись data/warframes.json.
 * input: { rank30, mods: [{item, rank}], arcanes: [{item, rank}], shards: [...], stacks, flags, adaptation }
 * -> статы, эффективное здоровье, разбор и weaponSources — эффекты фрейма для расчёта оружия.
 */
export function frameStats(frame, input, shardData) {
  const base = input.rank30 === false
    ? { health: frame.health || 0, shield: frame.shield || 0, energy: frame.energy || 0, armor: frame.armor || 0 }
    : { ...frame.rank30 };
  const modSources = [];
  // комплект Умбры: бонус к эффектам модов комплекта зависит от числа надетых
  const umbral = (input.mods || []).filter(m => UMBRA_SET.has(m?.item?.name)).length;
  const umbraK = name => 1 + ((UMBRA_BONUS[name] || UMBRA_BONUS.default)[umbral] || 0);
  for (const m of input.mods || []) {
    if (!m?.item) continue;
    let effects = itemEffects(m.item, m.rank);
    if (umbral >= 2 && UMBRA_SET.has(m.item.name)) effects = effects.map(e => ({ ...e, value: e.value * umbraK(m.item.name) }));
    modSources.push({ key: 'mod:' + m.item.id, name: m.item.ru || m.item.name, effects });
  }
  for (const a of input.arcanes || []) {
    if (a?.item) modSources.push({ key: 'arc:' + a.item.id, name: a.item.ru || a.item.name, effects: itemEffects(a.item, a.rank) });
  }
  for (const b of input.buffSources || []) modSources.push(b);          // баффы способностей и фокуса
  const ctx = { stacks: input.stacks || {}, flags: input.flags || {} };
  // два прохода: энергия нужна Фиолетовому осколку, а сама зависит от осколков
  let shards = shardSources(input.shards || [], shardData, 0);
  let t = collect([...modSources, ...shards], ctx).totals;
  const pass = totals => {
    const health = base.health * (1 + (totals.health || 0)) + (totals.health_flat || 0);
    const shield = base.shield ? base.shield * (1 + (totals.shield || 0)) + (totals.shield_flat || 0) : 0;
    const energy = base.energy ? base.energy * (1 + (totals.energy || 0)) + (totals.energy_flat || 0) : 0;
    const armor = Math.max(0, base.armor * (1 + (totals.armor || 0)) + (totals.armor_flat || 0));
    return { health, shield, energy, armor };
  };
  let core = pass(t);
  shards = shardSources(input.shards || [], shardData, core.energy);
  const all = collect([...modSources, ...shards], ctx);
  t = all.totals;
  core = pass(t);

  // Сила/длительность/дальность/эффективность: ограничения из вики (TODO_VERIFY): эффективность ≤ 175%,
  // длительность ≥ 12,5%, дальность ≥ 34%
  // Arcane Bellicose: round(макс. здоровье / 250 × бонус) — до 12 шагов (вики)
  const perHealth = t.strength_per_250_health ? Math.min(t.strength_per_250_health * 12, Math.round(core.health / 250 * t.strength_per_250_health * 100) / 100) : 0;
  const strength = clampMin(1 + (t.ability_strength || 0) + perHealth, 0);
  const duration = clampMin(1 + (t.ability_duration || 0), 0.125);
  const range = clampMin(1 + (t.ability_range || 0), 0.34);
  const efficiency = Math.min(1.75, 1 + (t.ability_efficiency || 0));
  const sprint = (frame.sprint || 1) * (1 + (t.sprint_speed || 0));
  const dr = core.armor / (core.armor + 300);
  const ehpHealth = core.health / (1 - dr);
  const ehp = ehpHealth + core.shield;
  const abilityDR = Math.min(0.9, t.damage_reduction || 0);            // Лунное затмение и т.п.
  const ehpAbil = ehp / (1 - abilityDR);
  const adapt = Math.min(0.9, 0.1 * (input.adaptation || 0));
  const ehpAdapt = ehpAbil / (1 - adapt);

  const pctText = x => `${x >= 0 ? '+' : ''}${Math.round(x * 1000) / 10}%`;
  const steps = [
    { label: 'Здоровье', formula: `${base.health} × (1 ${pctText(t.health || 0)}) + ${t.health_flat || 0}`, value: core.health },
    { label: 'Щиты', formula: base.shield ? `${base.shield} × (1 ${pctText(t.shield || 0)}) + ${t.shield_flat || 0}` : 'у фрейма нет щитов', value: core.shield },
    { label: 'Броня', formula: `${base.armor} × (1 ${pctText(t.armor || 0)}) + ${t.armor_flat || 0}`, value: core.armor },
    { label: 'Энергия', formula: base.energy ? `${base.energy} × (1 ${pctText(t.energy || 0)}) + ${t.energy_flat || 0}` : 'фрейм не использует энергию', value: core.energy },
    { label: 'Снижение урона бронёй', formula: `${Math.round(core.armor)} / (${Math.round(core.armor)} + 300)`, value: dr },
    { label: 'Эффективное здоровье', formula: `${Math.round(core.health)} / (1 − ${dr.toFixed(3)}) + щиты ${Math.round(core.shield)}`, value: ehp },
  ];
  if (abilityDR) steps.push({ label: 'Со снижением урона способностей', formula: `${Math.round(ehp)} / (1 − ${abilityDR})`, value: ehpAbil });
  if (adapt) steps.push({ label: 'С Адаптацией', formula: `${Math.round(ehpAbil)} / (1 − ${adapt})`, value: ehpAdapt });

  // эффекты для оружия: всё, кроме статов фрейма
  const weaponSources = [...modSources.filter(x => !String(x.key).startsWith('buff:')), ...shards]
    .map(s => ({ key: s.key, name: s.name, effects: s.effects.filter(e => !FRAME_BUCKETS.has(e.bucket)) }))
    .filter(s => s.effects.length);

  return { base, ...core, strength, duration, range, efficiency, sprint, dr, ehpHealth, ehp, abilityDR, ehpAbil, adapt, ehpAdapt,
    totals: t, contrib: all.contrib, steps, weaponSources };
}
