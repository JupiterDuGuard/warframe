// Вместимость модов: полярности, Forma, ауры/стойки, Orokin Catalyst/Reactor. Без DOM.
// Источник: https://wiki.warframe.com/w/Polarity — совпавшая полярность: стоимость ×0,5 (вверх),
// другая полярность: ×1,25 (вверх); аура/стойка: бонус ×2 при совпадении, ×0,8 при несовпадении.

export const POLARITIES = ['madurai', 'vazarin', 'naramon', 'zenurik', 'unairu', 'penjaga', 'umbra', 'any'];
export const POL_RU = {
  madurai: 'Мадурай', vazarin: 'Вазарин', naramon: 'Нарамон', zenurik: 'Зенурик', unairu: 'Унайру',
  penjaga: 'Пенджага', umbra: 'Умбра', any: 'Любая',
};
export const POL_SIGN = { madurai: 'V', vazarin: 'D', naramon: '—', zenurik: '=', unairu: 'R', penjaga: 'Y', umbra: 'U', any: 'O' };

const norm = p => {
  const s = p ? String(p).toLowerCase() : null;
  return s === 'none' ? null : s === 'universal' ? 'any' : s;
};

/** Совпадает ли полярность слота с модом: «Любая» (Omni/Stance Forma) подходит ко всему, кроме Умбры. */
export function polarityMatch(slotPol, modPol) {
  const s = norm(slotPol), m = norm(modPol);
  if (!s || !m) return null;                  // нет полярности у слота или у мода
  if (s === 'any') return m !== 'umbra';
  return s === m;
}

/** Стоимость мода (или бонус для ауры/стойки — отрицательное значение) в слоте. */
export function modCost(mod, rank, slotPol) {
  if (!mod) return 0;
  const drain = (mod.drain ?? 0);
  const r = rank ?? 0;
  const match = polarityMatch(slotPol, mod.polarity);
  if (drain < 0) {                            // аура или стойка: даёт вместимость
    const bonus = -drain + r;
    if (match === true) return -bonus * 2;
    if (match === false) return -Math.floor(bonus * 0.8);    // округление — TODO_VERIFY
    return -bonus;
  }
  const cost = drain + r;
  if (match === true) return Math.ceil(cost / 2);
  if (match === false) return Math.ceil(cost * 1.25);
  return cost;
}

/**
 * slots: [{ mod, rank, polarity }] — обычные слоты и эксилус; bonusSlot: { mod, rank, polarity } — аура или стойка.
 * -> { max, used, free, costs: [..], bonus }
 */
export function capacity({ rank = 30, catalyst = true, slots = [], bonusSlot = null }) {
  const base = rank * (catalyst ? 2 : 1);
  const costs = slots.map(s => (s?.mod ? modCost(s.mod, s.rank, s.polarity) : 0));
  const bonusCost = bonusSlot?.mod ? modCost(bonusSlot.mod, bonusSlot.rank, bonusSlot.polarity) : 0;
  const bonus = bonusCost < 0 ? -bonusCost : 0;
  const used = costs.reduce((a, b) => a + b, 0) + (bonusCost > 0 ? bonusCost : 0);
  const max = base + bonus;
  return { max, used, free: max - used, costs, bonus, bonusCost };
}

/**
 * Сколько Forma нужно: полярности, которых нет среди врождённых (как мультимножество).
 * Перестановка уже имеющихся полярностей (Swap Polarity) Forma не тратит.
 */
export function formaCount(current, original) {
  const left = new Map();
  for (const p of original.map(norm).filter(Boolean)) left.set(p, (left.get(p) || 0) + 1);
  let n = 0;
  for (const p of current.map(norm).filter(Boolean)) {
    if (left.get(p) > 0) left.set(p, left.get(p) - 1); else n++;
  }
  return n;
}
