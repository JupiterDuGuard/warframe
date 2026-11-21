// Сбор эффектов модов, мистификаторов и баффов по корзинам. Без DOM.
//
// Эффект: { stat, value, bucket, condition? }. Источник: { key, name, effects }.
// Контекст условий ctx:
//   faction      — фракция врага (для «Проклятий»)
//   stacks       — { [key источника]: число стаков } ; условные эффекты (триггер/стаки/шанс) без стаков выключены
//   flags        — { aiming, first_shot, invisible, blocking, attack: 'slide'|'heavy', target: 'lifted' }
//   statusTypes  — сколько разных статусов висит на цели (Condition Overload, Galvanized)
//   comboMultiplier — множитель комбо ближнего боя (Blood Rush)
//   slot         — слот оружия: 'primary' | 'secondary' | 'melee' (мистификаторы «to Primary Weapons»)

import { FACTION_FAMILY } from './constants.js';

const FLAG_KEYS = ['aiming', 'first_shot', 'invisible', 'blocking'];

// Ауры «+X% урона винтовкам/пистолетам/…» (Rifle Amp и др.). Какие классы считаются «винтовками» — TODO_VERIFY.
export function weaponClassFits(wc, ctx) {
  const cls = ctx.weaponClass || '';
  if (wc === 'melee') return ctx.slot === 'melee';
  if (wc === 'pistol') return ctx.slot === 'secondary';
  if (wc === 'rifle') return ctx.slot === 'primary' && cls !== 'Shotgun';
  if (wc === 'shotgun') return cls === 'Shotgun';
  if (wc === 'sniper_rifle') return cls === 'Sniper Rifle';
  return true;
}

export function effectValue(eff, ctx, key) {
  const c = eff.condition;
  if (!c) return eff.value;
  let mult = 1;
  if (c.faction) {
    const fam = FACTION_FAMILY[ctx.faction] || String(ctx.faction || '').toLowerCase();
    const want = c.faction === 'orokin' ? 'corrupted' : c.faction;
    if (fam !== want) return 0;
  }
  if (c.slot && ctx.slot && c.slot !== ctx.slot) return 0;
  if (c.notSlot && ctx.slot && c.notSlot === ctx.slot) return 0;
  if (c.weaponClass && ctx.slot && !weaponClassFits(c.weaponClass, ctx)) return 0;
  for (const f of FLAG_KEYS) if (c[f] && !ctx.flags?.[f]) return 0;
  if (c.attack && ctx.flags?.attack !== c.attack) return 0;
  if (c.target && ctx.flags?.target !== c.target) return 0;
  if (c.per === 'status_type') mult *= ctx.statusTypes ?? 0;
  if (c.per === 'combo_multiplier') mult *= Math.max(0, (ctx.comboMultiplier ?? 1) - 1);   // Blood Rush: бонус × (комбо − 1)
  if (c.form && (ctx.form || 'normal') !== c.form) return 0;                                  // «for Incarnon Form»
  if (c.trigger || c.stacks || c.duration || c.chance) {
    const n = ctx.stacks?.[key] ?? 0;          // по умолчанию выключено
    if (!n) return 0;
    mult *= c.stacks ? Math.min(n, c.stacks) : 1;
  }
  return eff.value * mult;
}

// Эффекты предмета на ранге (моды и мистификаторы из data/*.json)
export function itemEffects(item, rank) {
  const ranks = item?.ranks || [];
  if (!ranks.length) return [];
  const r = rank == null ? ranks.length - 1 : Math.max(0, Math.min(rank, ranks.length - 1));
  return ranks[r] || [];
}

/**
 * Суммирует эффекты по статам.
 * -> { totals: {stat: сумма}, elements: [{type, value, source}] в порядке источников,
 *      contrib: [{source, stat, value}], special: Set, forcedProcs: [...] , finalMult: число }
 */
export function collect(sources, ctx) {
  const totals = {};
  const elements = [];
  const contrib = [];
  const special = new Set();
  const forcedProcs = [];
  let finalMult = 1, critFinal = 1, finalNonCrit = 1;
  for (const s of sources) {
    for (const e of s.effects || []) {
      const v = effectValue(e, ctx, s.key);
      if (!v) continue;
      contrib.push({ source: s.name, key: s.key, stat: e.stat, value: v, bucket: e.bucket });
      if (e.bucket === 'element') {
        const type = e.stat.replace('element_', '');
        elements.push({ type: type[0].toUpperCase() + type.slice(1), value: v, source: s.name });
      } else if (e.bucket === 'final_mult') {
        finalMult *= v;
      } else if (e.bucket === 'final_mult_noncrit') {     // Devouring Attrition: только на ударах без крита
        finalNonCrit *= v;
      } else if (e.bucket === 'crit_final') {             // Электрический щит: ×2 к множителю крита
        critFinal *= v;
      } else if (e.bucket === 'special') {
        special.add(e.stat);
      } else if (e.bucket === 'forced_proc') {
        forcedProcs.push({ ...e, value: v, source: s.name });
      } else {
        const stat = e.bucket === 'faction' ? 'faction' : e.stat;
        totals[stat] = (totals[stat] || 0) + v;
      }
    }
  }
  return { totals, elements, contrib, special, forcedProcs, finalMult, critFinal, finalNonCrit };
}
