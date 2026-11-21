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
    let rank = 0;
    try { rank = JSON.parse(u.UpgradeFingerprint || '{}').lvl || 0; } catch { /* не JSON */ }
    map.set(id, { type: u.ItemType, rank });
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
