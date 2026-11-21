// Анализ билда: вклад каждого мода, пороговые уровни врага. Без DOM.
import { calc } from './damage.js';

/**
 * Вклад модов: на сколько упадёт DPS (и удар), если снять мод/мистификатор/перк.
 * metric(r) — по чему сравнивать (по умолчанию устойчивый DPS).
 */
export function modContribution(build, target, data, opts = {}, metric = r => r.dps.sustained) {
  const full = metric(calc(build, target, data, opts));
  const rows = [];
  const without = (patch, name, kind) => {
    const v = metric(calc({ ...build, ...patch }, target, data, opts));
    rows.push({ name, kind, value: v, loss: full ? (full - v) / full : 0 });
  };
  (build.mods || []).forEach((m, i) => {
    if (!m?.item) return;
    without({ mods: build.mods.filter((_, j) => j !== i) }, m.item.ru || m.item.name, 'мод');
  });
  (build.arcanes || []).forEach((a, i) => {
    if (!a?.item) return;
    without({ arcanes: build.arcanes.filter((_, j) => j !== i) }, a.item.ru || a.item.name, 'мистификатор');
  });
  (build.incarnon || []).forEach((p, i) => {
    without({ incarnon: build.incarnon.filter((_, j) => j !== i) }, p.name, 'Инкарнон');
  });
  (build.buffs || []).forEach((b, i) => {
    without({ buffs: build.buffs.filter((_, j) => j !== i) }, b.name, 'бафф');
  });
  if (build.extraHits?.length) {
    build.extraHits.forEach((x, i) => without({ extraHits: build.extraHits.filter((_, j) => j !== i) }, x.name, 'доп. удар'));
  }
  rows.sort((a, b) => b.loss - a.loss);
  return { full, rows };
}

/**
 * До какого уровня врага убиваешь не больше чем за N выстрелов (двоичный поиск, уровни 1..9999).
 * -> [{ shots: N, level }] ; level = 0 — не убиваешь за N даже на минимальном уровне.
 */
export function shotThresholds(build, target, data, opts = {}, list = [1, 2, 3, 5, 10]) {
  const minLevel = target.enemy.baseLevel || 1;
  const shotsAt = lvl => calc(build, { ...target, level: lvl }, data, opts).kill.shots;
  return list.map(n => {
    if (shotsAt(minLevel) > n) return { shots: n, level: 0 };
    let lo = minLevel, hi = 9999;
    if (shotsAt(hi) <= n) return { shots: n, level: hi };
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (shotsAt(mid) <= n) lo = mid; else hi = mid;
    }
    return { shots: n, level: lo };
  });
}
