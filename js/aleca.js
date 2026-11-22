// Импорт из AlecaFrame: файл lastData.dat расшифровывается прямо в браузере (WebCrypto) и никуда не отправляется.
// Ключ и IV — из открытого парсера github.com/Sainan/alecaframe-inventory-parser.

const KEY = new TextEncoder().encode('LEO-ALEC\tEO-ALEC');
const IV = new Uint8Array([49, 50, 70, 71, 66, 51, 54, 45, 76, 69, 51, 45, 113, 61, 57, 0]);

export async function readAleca(file) {
  const buf = await file.arrayBuffer();
  const key = await crypto.subtle.importKey('raw', KEY, { name: 'AES-CBC' }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: IV }, key, buf);
  let text = new TextDecoder('utf-8').decode(plain);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let d = JSON.parse(text);
  if (typeof d.InventoryJson === 'string') d = JSON.parse(d.InventoryJson);
  return d;
}

export const POLARITY = {
  AP_ATTACK: 'madurai', AP_DEFENSE: 'vazarin', AP_TACTIC: 'naramon', AP_POWER: 'zenurik', AP_WARD: 'unairu',
  AP_PRECEPT: 'penjaga', AP_UMBRA: 'umbra', AP_UNIVERSAL: 'any', AP_ANY: 'any',
};
export const CATEGORY = { LongGuns: 'primary', Pistols: 'secondary', Melee: 'melee', SpaceGuns: 'archgun' };

/** Моды в конфигурации: ItemId -> {type, rank}; строка-путь = неранговый мод (ранг 0). */
export function upgradeLookup(inv) {
  const map = new Map();
  for (const u of inv.Upgrades || []) {
    const id = u.ItemId?.$oid;
    if (!id) continue;
    let fp = {};
    try { fp = JSON.parse(u.UpgradeFingerprint || '{}') || {}; } catch { /* не JSON */ }
    map.set(id, { type: u.ItemType, rank: fp.lvl || 0, fp });
  }
  return entry => {
    if (!entry) return null;
    if (entry.startsWith('/')) return { type: entry, rank: 0 };
    return map.get(entry) || null;
  };
}

/** Полярности слотов: Slot — индекс в массиве Upgrades конфигурации. */
export function slotPolarities(item) {
  const out = {};
  for (const p of item.Polarity || []) out[p.Slot] = POLARITY[p.Value] || null;
  return out;
}

// Осколки: цвет из Color, эффект по ключевым словам в UpgradeType; «_MYTHIC» — таукованый.
const SHARD_COLOR = { ACC_RED: 'crimson', ACC_YELLOW: 'amber', ACC_BLUE: 'azure', ACC_GREEN: 'emerald', ACC_ORANGE: 'topaz', ACC_PURPLE: 'violet' };
const SHARD_EFFECT = [
  [/AbilityStrength/i, 'strength'], [/AbilityDuration/i, 'duration'], [/MeleeCrit/i, 'melee_crit_damage'],
  [/PrimaryStatus/i, 'primary_status'], [/SecondaryCrit(?!.*Heat)/i, 'secondary_crit'],
  [/StartingEnergy|InitialEnergy/i, 'initial_energy'], [/HealthOrb/i, 'health_orbs'], [/EnergyOrb/i, 'energy_orbs'],
  [/CastingSpeed/i, 'casting_speed'], [/Parkour/i, 'parkour'],
  [/HealthMax|MaxHealth/i, 'health'], [/ShieldMax|MaxShield/i, 'shield'], [/EnergyMax|MaxEnergy/i, 'energy'],
  [/ArmorMax|MaxArmor/i, 'armor'], [/HealthRegen/i, 'regen'],
  [/ToxinDamage/i, 'toxin_status'], [/ToxinHeal|HealthOnToxin/i, 'toxin_heal'], [/CorrosiveStack/i, 'corrosion_stacks'],
  [/Corrosive/i, 'corrosion_ability'],
  [/Blast.*Health|HealthOnBlast/i, 'blast_health'], [/Blast.*Shield|ShieldOnBlast/i, 'blast_shield'],
  [/Heat|SecondaryCritOnKill/i, 'heat_secondary_crit'], [/Radiation/i, 'radiation_ability'],
  [/PrimaryElectric|ElectricDamageBoost(?!.*Ability)/i, 'primary_electricity'], [/Electric/i, 'electricity_ability'],
  [/CritDamageBoost/i, 'melee_crit_damage'], [/Orb|Equilibrium/i, 'orb_conversion'],
];

export function readShards(item, shardData) {
  return (item.ArchonCrystalUpgrades || []).slice(0, 5).map(a => {
    if (!a?.Color) return null;
    const tau = /_MYTHIC$/.test(a.Color);
    const color = SHARD_COLOR[a.Color.replace(/_MYTHIC$/, '')];
    const def = shardData.colors.find(c => c.id === color);
    if (!def) return null;
    const type = (a.UpgradeType || '').split('/').pop();
    const ids = new Set(def.effects.map(e => e.id));
    const hit = SHARD_EFFECT.find(([rx, id]) => ids.has(id) && rx.test(type));
    return { color, effect: hit ? hit[1] : def.effects[0].id, tau, raw: type };
  });
}

/** Список предметов игрока для выбора: оружие и фреймы с конфигурациями. */
export function ownedItems(inv) {
  const out = [];
  for (const [key, cat] of Object.entries(CATEGORY)) {
    for (const w of inv[key] || []) out.push({ kind: 'weapon', cat, item: w });
  }
  for (const s of inv.Suits || []) out.push({ kind: 'frame', item: s });
  return out;
}

// ---------- моды разлома ----------
// Источник: https://wiki.warframe.com/w/Riven_Mods (2026-11): диспозиции отменены, у всех оружий множитель 1,2.
// Значение = база × 1,2 × множитель за число плюсов/минусов × (0,9 + 0,2 × ролл) × (ранг + 1) / 9;
// ролл = Value / 0x3FFFFFFF из UpgradeFingerprint (TODO_VERIFY: сверено только с диапазонами вики).
// [stat калькулятора, Rifle, Shotgun, Pistol, Archgun, Melee] — базовые значения с вики (% или м/с)
const RIVEN_BASE = {
  WeaponDamageAmountMod: ['damage', 165, 164.7, 219.6, 99.9, 164.7],
  WeaponMeleeDamageMod: ['damage', 165, 164.7, 219.6, 99.9, 164.7],
  WeaponFireIterationsMod: ['multishot', 90, 119.7, 119.7, 60.3, null],
  WeaponCritChanceMod: ['crit_chance', 149.99, 90, 149.99, 99.9, 180],
  WeaponCritDamageMod: ['crit_damage', 119.997, 90, 90, 80.1, 90],
  WeaponStunChanceMod: ['status_chance', 90, 90, 90, 60.3, 90],
  WeaponProcTimeMod: ['status_duration', 99.99, 99.99, 99.99, 99.99, 99.99],
  WeaponStatusDamage: ['status_damage', 90, 90, 90, 90, 90],
  WeaponFireRateMod: ['fire_rate', 60.03, 90, 74.7, 60.03, 54.9],
  WeaponClipMaxMod: ['magazine', 49.995, 49.995, 49.995, 60.3, null],
  WeaponReloadSpeedMod: ['reload_speed', 49.995, 49.995, 49.995, 99.9, null],
  WeaponFireDamageMod: ['element_heat', 90, 90, 90, 119.7, 90],
  WeaponFreezeDamageMod: ['element_cold', 90, 90, 90, 119.7, 90],
  WeaponElectricityDamageMod: ['element_electricity', 90, 90, 90, 119.7, 90],
  WeaponToxinDamageMod: ['element_toxin', 90, 90, 90, 119.7, 90],
  WeaponImpactDamageMod: ['physical_impact', 119.97, 119.97, 119.97, 90, 119.7],
  WeaponArmorPiercingDamageMod: ['physical_puncture', 119.997, 119.997, 119.997, 90, 119.997],
  WeaponSlashDamageMod: ['physical_slash', 119.97, 119.97, 119.97, 90, 119.7],
  WeaponPunctureDepthMod: ['punch_through', 2.7, 2.7, 2.7, 2.7, null],
  WeaponProjectileSpeedMod: ['projectile_speed', 90, 90, 90, null, null],
  SlideAttackCritChanceMod: ['crit_slide', null, null, null, null, 120],
  WeaponMeleeRangeIncMod: ['melee_range', null, null, null, null, 1.94],
  ComboDurationMod: ['combo_duration', null, null, null, null, 8.1],
};
const FACTION_TAG = /^WeaponFactionDamage(Grineer|Corpus|Infested|Corrupted|Orokin)$/;
// бонус и минус в зависимости от числа плюсов и минусов
const COUNT_MULT = { '2,0': [0.99, 0], '2,1': [1.2375, -0.495], '3,0': [0.75, 0], '3,1': [0.9375, -0.75] };
const rivenColumn = type => (/Shotgun/.test(type) ? 2 : /Pistol/.test(type) ? 3 : /Archgun|SpaceGun/.test(type) ? 4 : /Melee/.test(type) ? 5 : 1);

/** Мод разлома из UpgradeFingerprint -> { stats: [{stat, value}], drain, polarity, skipped: [теги] } или null (не раскрыт). */
export function rivenFromFingerprint(u, weaponClass = '') {
  const fp = u?.fp;
  if (!fp?.buffs?.length) return null;
  const curses = fp.curses || [];
  const [bonus, malus] = COUNT_MULT[`${fp.buffs.length},${curses.length ? 1 : 0}`] || [1, -1];
  const col = rivenColumn(u.type || '');
  const level = ((fp.lvl || 0) + 1) / 9;
  const stats = [], skipped = [];
  const add = ({ Tag, Value }, mult) => {
    const fm = FACTION_TAG.exec(Tag);
    const row = fm ? ['faction_' + (fm[1] === 'Orokin' ? 'corrupted' : fm[1].toLowerCase()), 45, 45, 45, 45, 45] : RIVEN_BASE[Tag];
    if (!row || row[col] == null) { skipped.push(Tag); return; }
    let base = row[col];
    if (Tag === 'WeaponFireRateMod' && /Bow/i.test(weaponClass)) base *= 2;      // «x2 for Bows»
    const roll = 0.9 + 0.2 * Math.min(1, Math.max(0, (Value || 0) / 0x3FFFFFFF));
    stats.push({ stat: row[0], value: Math.round(base * 1.2 * mult * roll * level * 10) / 10 });
  };
  fp.buffs.forEach(b => add(b, bonus));
  curses.forEach(c => add(c, malus));
  return { stats: stats.slice(0, 4), drain: 10 + (fp.lvl || 0), polarity: POLARITY[fp.pol] || 'madurai', skipped };
}
