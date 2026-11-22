// Баффы способностей и фокуса (data/manual/buffs.json) -> эффекты для оружия, фрейма и цели. Без DOM.
//
// active: [{ id, on, variant, ownStrength (bool), strength (%), helminth (bool), input (число для fill/seconds/value) }]
// ctx:    { ownStrength — сила способностей своего фрейма (доля, 1 = 100%), slot — слот оружия }
// -> { weaponSources, frameSources, extraHits, armorStrip, vulnerability, applied: [{ id, name, strength }] }

export function buffValue(e, def, a, strength) {
  let v = a.helminth && e.helminth != null ? e.helminth : e.value;
  const input = a.input ?? def.input?.default ?? 0;
  if (e.fromInput) v = input / 100;
  if (e.scale === 'strength') v *= strength;
  if (e.fill) v *= input / 100;
  if (e.perSecond) v *= input;
  const cap = a.helminth && e.helminthCap != null ? e.helminthCap : e.cap;
  if (cap != null) v = Math.min(cap, v);
  if (e.asMultiplier) v = 1 + v;                 // Солнечное затмение: ×(1 + 200% × сила)
  return Math.round(v * 1e6) / 1e6;
}

export function resolveBuffs(active, defs, ctx = {}) {
  const weaponSources = [], frameSources = [], extraHits = [], applied = [];
  let strip = 0, vulnerability = 0;
  for (const a of active || []) {
    if (!a?.on) continue;
    const def = defs.find(d => d.id === a.id);
    if (!def) continue;
    const strength = a.ownStrength ? (ctx.ownStrength ?? 1) : (a.strength ?? 100) / 100;
    const variant = def.variants ? def.variants.find(v => v.id === a.variant) || def.variants[0] : null;
    const name = a.name || def.ru || def.ability;
    const effects = variant?.effects || def.effects || [];
    const wEff = [], fEff = [];
    for (const e of effects) {
      const v = buffValue(e, def, a, strength);
      if (e.target === 'weapon') wEff.push({ stat: e.stat, value: v, bucket: e.bucket, ...(e.condition ? { condition: e.condition } : {}), ...(e.noCombine ? { noCombine: true } : {}) });
      else if (e.target === 'frame') fEff.push({ stat: e.stat, value: v, bucket: 'frame' });
      else if (e.target === 'enemy' && e.stat === 'armor_strip') strip += v;          // процент от полной брони — складываются
      else if (e.target === 'enemy' && e.stat === 'vulnerability') vulnerability += v;
    }
    if (wEff.length) weaponSources.push({ key: 'buff:' + def.id, name, effects: wEff });
    if (fEff.length) frameSources.push({ key: 'buff:' + def.id, name, effects: fEff });
    const xh = variant?.extraHit || def.extraHit;
    if (xh) {
      const base = ctx.slot === 'melee' && xh.meleePct ? xh.meleePct : xh.pct;
      extraHits.push({ name, type: xh.type, pct: base * (xh.scale === 'strength' ? strength : 1),
        statusChance: xh.statusChance, ability: !!xh.ability });
    }
    applied.push({ id: def.id, name, strength });
  }
  return { weaponSources, frameSources, extraHits, armorStrip: Math.min(1, strip), vulnerability, applied };
}
