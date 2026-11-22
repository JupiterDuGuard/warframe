// Публичный вход движка: calc(build, target, data, opts) -> результат + разбор. Без DOM.
export { calc, critTable, buildSources } from './damage.js';
export { moddedAttack, combineElements, quantize, critInfo } from './weapon.js';
export { enemyState, armorDR, statMultiplier, overguardMultiplier, coldCritBonus, punctureCritBonus } from './enemy.js';
export { collect, effectValue, itemEffects, weaponClassFits } from './effects.js';
export { frameStats, shardSources } from './frame.js';
export * from './constants.js';
export { resolveBuffs, buffValue } from './buffs.js';
export { modContribution, shotThresholds } from './analysis.js';
export { capacity, modCost, polarityMatch, formaCount, POLARITIES, POL_RU, POL_SIGN } from './capacity.js';
