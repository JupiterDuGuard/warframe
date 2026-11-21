// Интерфейс калькулятора. Считает движок js/engine (без DOM), здесь только ввод и вывод.
import { calc, critTable, itemEffects, frameStats, resolveBuffs, modContribution, shotThresholds, capacity, formaCount, polarityMatch, TYPE_RU, DOT_TICKS } from './engine/index.js';
import { readAleca, upgradeLookup, slotPolarities, readShards, ownedItems } from './aleca.js';
import { encodeBuild, decodeBuild } from './share.js';
import { load, CATEGORIES, MOD_FILES, ARCANE_FILES, modGroup, modFits } from './store.js';
import { $, h, num, pct, ruName, textRu, openPicker, initPicker, segmented, slotEl, tile, table, condRows } from './ui.js';

// ---------- состояние ----------
const FRAME_DEFAULT = {
  name: 'Oraxia', rank30: true, aura: null, mods: Array(8).fill(null), exilus: null, arcanes: [null, null],
  shards: Array(5).fill(null), helminth: { slot: '', ability: '' }, adaptation: 0, use: true, stacks: {}, flags: {},
};
const DEFAULT = {
  view: 'weapon',
  cat: 'secondary', weapon: 'Laetum', attack: 0, meleeMode: 'normal', combo: 1, exaltedScale: true, incarnon: {},
  mods: Array(8).fill(null), exilus: null, arcane: null,
  stacks: {}, flags: {}, statusTypes: 0,
  buffs: [], customMult: 1, customStatus: 0,
  enemy: 'Heavy Gunner', level: 115, part: 'body', crit: 'none', armorStrip: 0, drOverride: '',
  status: { viral: 0, corrosive: 0, magnetic: 0, heat: false },
  frame: FRAME_DEFAULT,
  pol: {}, stance: null, compareA: null,
};
const KEY = 'wf-calc-v1';
let S;
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  S = { ...structuredClone(DEFAULT), ...saved, frame: { ...structuredClone(FRAME_DEFAULT), ...(saved.frame || {}) } };
  if (saved.oraxia && !saved.buffs) {          // старый формат: отдельная галочка Ораксии
    S.buffs = saved.oraxia.on ? [{ id: 'silken_stride', on: true, variant: saved.oraxia.wall ? 'wall' : 'ground', strength: saved.oraxia.strength || 100 }] : [];
  }
  delete S.oraxia;
} catch { S = structuredClone(DEFAULT); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* приватный режим */ } };

const D = { weapons: {}, mods: {}, arcanes: {} };
const F = () => S.frame;

// ---------- данные ----------
const weaponList = () => (D.weapons[S.cat] || []).filter(w => w.attacks?.length);
const currentWeapon = () => weaponList().find(w => w.name === S.weapon) || weaponList()[0];
const currentGroup = () => modGroup(currentWeapon(), S.cat);
const modsOf = () => D.mods[currentGroup()] || [];
const modById = id => modsOf().find(m => m.id === id);
const arcanesOf = () => D.arcanes[S.cat] || [];
const arcById = id => arcanesOf().find(a => a.id === id);
const currentEnemy = () => D.enemies.find(e => e.name === S.enemy) || D.enemies[0];
const currentFrame = () => D.warframes.find(w => w.name === F().name) || D.warframes.find(w => w.name === 'Oraxia');
const fModById = id => D.mods.warframe.find(m => m.id === id);
const fArcById = id => D.arcanes.warframe.find(a => a.id === id);
const frameBase = f => f.name.replace(/ Prime$| Umbra$/, '');

async function ensureCategory() {
  const cat = CATEGORIES.find(c => c.id === S.cat) || CATEGORIES[1];
  D.weapons[S.cat] ||= await load(cat.file);
  S.weapon = currentWeapon().name;
  const g = currentGroup();
  D.mods[g] ||= await load(MOD_FILES[g]);
  if (ARCANE_FILES[S.cat]) D.arcanes[S.cat] ||= await load(ARCANE_FILES[S.cat]);
}

// ---------- полярности и вместимость ----------
const lower = p => {
  const s = p ? String(p).toLowerCase() : null;
  return s === 'none' ? null : s === 'universal' ? 'any' : s;
};
const basePol = item => Array.from({ length: 8 }, (_, i) => lower((item.polarities || [])[i]));
// ранг 40 — у оружия Kuva, Tenet, Coda и Парацесиса
const maxItemRank = (kind, item) => kind === 'w' && /^(Kuva|Tenet|Coda) |^Paracesis$/.test(item.name) ? 40 : 30;
function polState(kind, item) {
  const k = kind + ':' + item.name;
  S.pol ||= {};
  if (!S.pol[k]) {
    S.pol[k] = { slots: basePol(item), exilus: lower(item.exilusPolarity),
      aura: lower(kind === 'f' ? item.auraPolarity : item.stancePolarity), catalyst: true, rank: maxItemRank(kind, item) };
  }
  return S.pol[k];
}
function capLine(el, cap, pol, item, onToggle) {
  const forma = formaCount([...pol.slots, pol.exilus, pol.aura], [...(item.polarities || []), item.exilusPolarity, item.auraPolarity || item.stancePolarity]);
  el.replaceChildren(
    h('span', {}, 'Вместимость ', h('b', { class: cap.used > cap.max ? 'over' : '' }, `${cap.used} / ${cap.max}`), cap.bonus ? ` (с бонусом ${cap.bonus})` : ''),
    h('span', {}, 'Forma: ', h('b', {}, String(forma))),
    h('label', { class: 'chk' }, 'Ранг', h('select', { style: 'width:auto', 'aria-label': 'Ранг предмета', onchange: e => { pol.rank = +e.target.value; onToggle(); } },
      [30, 40].map(r => h('option', { value: r, selected: (pol.rank || 30) === r }, String(r))))),
    h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: pol.catalyst, onchange: e => { pol.catalyst = e.target.checked; onToggle(); } }), 'Катализатор / Реактор'),
    cap.used > cap.max ? h('span', { class: 'warn' }, `не хватает ${cap.used - cap.max}`) : '');
}

// стойка подходит классу оружия: «Glaives» ~ «Glaive», «Staves» ~ «Staff»
const clsKey = c => (c || '').toLowerCase().replace('staves', 'staff').replace(/s\b/g, '');
const stanceFits = (m, w) => clsKey(m.compat) === clsKey(w.class);

// ---------- Инкарнон ----------
const incOf = () => D.incarnon?.[currentWeapon().name];
function incSources() {
  const inc = incOf();
  if (!inc) return [];
  const sel = S.incarnon[currentWeapon().name] || {};
  const out = [];
  for (const t of inc.tiers) {
    const pk = t.perks.find(p => p.name === sel[t.tier]);
    if (pk) out.push({ key: `inc:${currentWeapon().name}:${t.tier}`, name: `${pk.name} (эволюция ${t.tier})`, effects: pk.effects, perk: pk });
  }
  return out;
}

const buildState_own = () => buffState().own;

// ---------- фрейм: расчёт ----------
function frameInput() {
  const f = F();
  return {
    rank30: f.rank30,
    mods: [f.aura, ...f.mods, f.exilus].filter(Boolean).map(s => ({ item: fModById(s.id), rank: s.rank })).filter(m => m.item),
    arcanes: f.arcanes.filter(Boolean).map(s => ({ item: fArcById(s.id), rank: s.rank })).filter(a => a.item),
    shards: f.shards, stacks: f.stacks, flags: f.flags, adaptation: f.adaptation,
  };
}
// ---------- баффы ----------
// S.ownBuffs {id: {on, variant, input}} — способности своего фрейма (появляются сами, с учётом Гельминта);
// S.allies [{frame, buffs: {id: {on, variant, input}}}] — фреймы союзников, сила стоковая (100%);
// S.buffs [{id, on}] — пассивки фокуса.
const buffDef = id => D.buffs.buffs.find(d => d.id === id);
const frameBuffDefs = base => D.buffs.buffs.filter(d => !d.focus && d.frame === base);
function ownBuffDefs() {
  const fr = currentFrame(), hel = F().helminth;
  const slot = hel.slot === '' ? -1 : +hel.slot;
  const replaced = slot >= 0 ? fr.abilities?.[slot]?.name : null;     // способность, которую заменил Гельминт
  const out = frameBuffDefs(frameBase(fr)).filter(d => d.ability !== replaced).map(def => ({ def, helminth: false }));
  if (slot >= 0 && hel.ability) {
    const d = D.buffs.buffs.find(x => !x.focus && x.ability === hel.ability);
    if (d && !out.some(o => o.def.id === d.id)) out.push({ def: d, helminth: true });
  }
  return out;
}
function activeBuffs() {
  if (!S.ownBuffs) return S.buffs || [];                       // старый формат (снимок A до обновления)
  const own = ownBuffDefs().map(({ def, helminth }) => {
    const st = S.ownBuffs[def.id] || {};
    return { id: def.id, on: st.on ?? false, variant: st.variant, input: st.input, ownStrength: true, helminth };
  });
  const seen = new Set(own.filter(a => a.on).map(a => a.id));   // одна способность от двух фреймов не складывается
  const allies = [];
  for (const al of S.allies || []) for (const d of frameBuffDefs(al.frame)) {
    const st = al.buffs[d.id] || {};
    const a = { id: d.id, on: st.on ?? true, variant: st.variant, input: st.input, ownStrength: false, strength: 100, helminth: false };
    if (a.on && seen.has(a.id)) continue;
    if (a.on) seen.add(a.id);
    allies.push(a);
  }
  return [...own, ...allies, ...(S.buffs || []).filter(a => buffDef(a.id)?.focus)];
}
// старый список S.buffs -> свой фрейм / союзники / фокус
function migrateBuffs() {
  if (S.ownBuffs) return;
  S.ownBuffs = {}; S.allies = [];
  const base = frameBase(currentFrame()), focus = [];
  for (const a of S.buffs || []) {
    const d = buffDef(a.id);
    if (!d) continue;
    if (d.focus) { focus.push({ id: a.id, on: a.on !== false }); continue; }
    const st = { on: !!a.on, variant: a.variant, input: a.input };
    if (d.frame === base || (a.helminth && d.ability === F().helminth.ability)) S.ownBuffs[d.id] = st;
    else {
      let al = S.allies.find(x => x.frame === d.frame);
      if (!al) S.allies.push(al = { frame: d.frame, buffs: {} });
      al.buffs[d.id] = st;
    }
  }
  S.buffs = focus;
}
// сила «своя» берётся у фрейма с его модами и баффами на силу (два прохода)
function buffState() {
  const fr = currentFrame();
  const active = activeBuffs();
  const own0 = frameStats(fr, frameInput(), D.shards).strength;
  let res = resolveBuffs(active, D.buffs.buffs, { ownStrength: own0, slot: S.cat });
  const own = frameStats(fr, { ...frameInput(), buffSources: res.frameSources }, D.shards).strength;
  if (own !== own0) res = resolveBuffs(active, D.buffs.buffs, { ownStrength: own, slot: S.cat });
  return { res, own };
}
const frameResult = () => frameStats(currentFrame(), { ...frameInput(), buffSources: buffState().res.frameSources }, D.shards);

// ---------- оружие: ввод ----------
function renderWeapon() {
  segmented($('catSeg'), CATEGORIES.map(c => [c.id, c.ru]), S.cat, async v => {
    S.cat = v; S.weapon = ''; S.attack = 0; S.mods = Array(8).fill(null); S.exilus = null; S.arcane = null; S.stance = null;
    await ensureCategory();
    if (v === 'melee') D.mods.stance ||= await load('data/mods/stance.json');
    renderAll();
  });
  const w = currentWeapon();
  $('weaponPick').replaceChildren(h('b', {}, ruName(w)), h('small', {}, `${w.name} · ${w.class || ''}`));
  const sel = $('attackSel');
  sel.replaceChildren(...w.attacks.map((a, i) => h('option', { value: i }, a.attackName || `Атака ${i + 1}`)));
  if (S.attack >= w.attacks.length) S.attack = 0;
  sel.value = S.attack;
  const melee = S.cat === 'melee';
  $('meleeRow').hidden = !melee;
  segmented($('meleeSeg'), [['normal', 'Обычный'], ['heavy', 'Тяжёлый'], ['slide', 'В слайде']], S.meleeMode, v => { S.meleeMode = v; renderWeapon(); update(false); });
  $('combo').value = S.combo;
  const exalt = w.class === 'Exalted Weapon';
  $('exaltRow').hidden = !exalt;
  $('weaponNote').hidden = !melee;
  $('weaponNote').textContent = melee ? `Тяжёлый удар: ${num(w.heavyAttack || 0, 0)} базового урона × комбо; в слайде: ${num(w.slideAttack || 0, 0)}. Множители отдельных ударов стоек не учитываются.` : '';
  renderIncarnon();
}

function renderIncarnon() {
  const inc = incOf();
  $('incCard').hidden = !inc;
  if (!inc) return;
  const w = currentWeapon();
  const sel = S.incarnon[w.name] ||= {};
  $('incSrc').replaceChildren(h('a', { href: inc.page, target: '_blank', rel: 'noopener' }, 'вики'));
  $('incList').replaceChildren(...inc.tiers.map(t => {
    const pk = t.perks.find(p => p.name === sel[t.tier]);
    return h('div', { class: 'cond' },
      h('div', {}, h('b', {}, `Эволюция ${t.tier}`),
        pk ? h('div', { class: 'muted' }, pk.text.join(' · '), !pk.effects.length ? h('span', { class: 'warn' }, ' · не влияет на урон или не разобран') : null) : null),
      h('select', { 'aria-label': `Эволюция ${t.tier}`, onchange: e => { sel[t.tier] = e.target.value; renderIncarnon(); update(); } },
        h('option', { value: '' }, '— не выбран —'), ...t.perks.map(p => h('option', { value: p.name, selected: p.name === sel[t.tier] }, p.name))));
  }));
}

function pickMod({ items, onPick }) {
  openPicker({
    items: items.sort((a, b) => ruName(a).localeCompare(ruName(b), 'ru')), placeholder: 'Название',
    label: ruName, sub: m => [textRu(m), m.name !== ruName(m) ? m.name : ''].filter(Boolean).join(' — '), onPick,
  });
}
const maxRank = m => m.maxRank ?? (m.ranks.length - 1);

function renderMods() {
  const w = currentWeapon();
  const pol = polState('w', w);
  const cost = (slot, sp) => { const m = slot && modById(slot.id); return m ? capacity({ slots: [{ mod: m, rank: slot.rank, polarity: sp }] }).costs[0] : null; };
  const used = () => new Set([...S.mods, S.exilus].filter(Boolean).map(s => s.id));
  const modSlot = (slot, idx, exilus) => slotEl({
    slot, item: slot && modById(slot.id), tag: exilus ? 'Эксилус' : idx + 1, empty: exilus ? '+ мод эксилуса' : '+ мод',
    cls: exilus ? 'exilus' : '',
    pol: exilus ? pol.exilus : pol.slots[idx], cost: cost(slot, exilus ? pol.exilus : pol.slots[idx]),
    onPol: v => { if (exilus) pol.exilus = v; else pol.slots[idx] = v; update(); },
    onPick: () => pickMod({
      items: modsOf().filter(m => modFits(m, w, S.cat) && (!exilus || m.exilus) && !used().has(m.id)),
      onPick: m => { const v = { id: m.id, rank: maxRank(m) }; if (exilus) S.exilus = v; else S.mods[idx] = v; update(); },
    }),
    onChange: update, onClear: () => { if (exilus) S.exilus = null; else S.mods[idx] = null; update(); },
  });
  $('slots').replaceChildren(...S.mods.map((s, i) => modSlot(s, i, false)));
  const extra = [modSlot(S.exilus, -1, true)];
  if (arcanesOf().length) {
    extra.push(slotEl({
      slot: S.arcane, item: S.arcane && arcById(S.arcane.id), tag: 'Мистиф.', empty: '+ мистификатор',
      onPick: () => pickMod({ items: [...arcanesOf()], onPick: a => { S.arcane = { id: a.id, rank: maxRank(a) }; update(); } }),
      onChange: update, onClear: () => { S.arcane = null; update(); },
    }));
  }
  if (S.cat === 'melee' && D.mods.stance) {
    const st = S.stance && D.mods.stance.find(m => m.id === S.stance.id);
    extra.unshift(slotEl({
      slot: S.stance, item: st, tag: 'Стойка', empty: '+ стойка', cls: 'exilus', pol: pol.aura,
      cost: st ? capacity({ bonusSlot: { mod: st, rank: S.stance.rank, polarity: pol.aura } }).bonusCost : null,
      onPol: v => { pol.aura = v; update(); },
      onPick: () => pickMod({ items: D.mods.stance.filter(m => stanceFits(m, w)),
        onPick: m => { S.stance = { id: m.id, rank: maxRank(m) }; update(); } }),
      onChange: update, onClear: () => { S.stance = null; update(); },
    }));
  }
  $('slotsExtra').replaceChildren(...extra);
  const stanceMod = S.cat === 'melee' && S.stance && D.mods.stance?.find(m => m.id === S.stance.id);
  const cap = capacity({
    rank: pol.rank || 30, catalyst: pol.catalyst,
    slots: [...S.mods.map((x, i) => ({ mod: x && modById(x.id), rank: x?.rank, polarity: pol.slots[i] })),
      { mod: S.exilus && modById(S.exilus.id), rank: S.exilus?.rank, polarity: pol.exilus }],
    bonusSlot: stanceMod ? { mod: stanceMod, rank: S.stance.rank, polarity: pol.aura } : null,
  });
  capLine($('capInfo'), cap, pol, w, update);
  const warn = [];
  for (const s of [...S.mods, S.exilus]) {
    const m = s && modById(s.id);
    if (m?.unparsed) warn.push(`⚠ «${ruName(m)}» разобран не полностью: ${m.unparsed.join('; ')}`);
  }
  const a = S.arcane && arcById(S.arcane.id);
  if (a?.unparsed) warn.push(`⚠ «${ruName(a)}» разобран не полностью: ${a.unparsed.join('; ')}`);
  $('modWarn').replaceChildren(...warn.map(t => h('div', {}, t)));
}

function renderConds() {
  const sources = [...[...S.mods, S.exilus].filter(Boolean).map(s => ({ key: 'mod:' + s.id, item: modById(s.id), rank: s.rank })),
    ...(S.arcane ? [{ key: 'arc:' + S.arcane.id, item: arcById(S.arcane.id), rank: S.arcane.rank }] : []),
    ...incSources().map(x => ({ key: x.key, item: { name: x.name, ru: x.name, ranks: [x.effects], text: x.perk.text }, rank: 0 }))];
  const rows = condRows(sources, S, () => update(false), itemEffects);
  $('conds').replaceChildren(...rows);
  $('condCard').hidden = !rows.length;
}

function renderEnemySegs() {
  segmented($('partSeg'), [['body', 'Тело'], ['head', 'Голова']], S.part, v => { S.part = v; update(); });
  segmented($('critSeg'), [['none', 'Без крита'], ['avg', 'Средний'], ['crit', 'Крит']], S.crit, v => { S.crit = v; update(); });
  const e = currentEnemy();
  $('enemyPick').replaceChildren(h('b', {}, e.ru || e.name), h('small', {}, `${e.faction || '—'}`));
}

// ---------- оружие: расчёт и результат ----------
function buildInput() {
  const w = currentWeapon();
  const mods = [...S.mods, S.exilus].filter(Boolean).map(s => ({ item: modById(s.id), rank: s.rank })).filter(m => m.item);
  const buffs = [];
  if (S.customMult && S.customMult !== 1) buffs.push({ name: 'Свой множитель', effects: [{ stat: 'final_mult', value: S.customMult, bucket: 'final_mult' }] });
  if (S.customStatus) buffs.push({ name: 'Свой бонус к урону статусов', effects: [{ stat: 'status_damage', value: S.customStatus / 100, bucket: 'status_damage' }] });
  let frameSrc = [];
  if (F().use) {
    frameSrc = frameResult().weaponSources;
    buffs.push(...frameSrc);
  }
  const bs = buffState().res;
  buffs.push(...bs.weaponSources);
  const extraHits = bs.extraHits;
  const build = {
    weapon: w, attack: S.attack, slot: S.cat, mods, buffs, extraHits,
    stacks: { ...F().stacks, ...S.stacks }, flags: { ...F().flags, ...S.flags },
    arcanes: S.arcane && arcById(S.arcane.id) ? [{ item: arcById(S.arcane.id), rank: S.arcane.rank }] : [],
    statusTypes: S.statusTypes || undefined,
    meleeMode: S.cat === 'melee' ? S.meleeMode : undefined, comboMultiplier: S.combo || 1,
    exaltedStrength: w.class === 'Exalted Weapon' && S.exaltedScale ? buffState().own : undefined,
    incarnon: incSources(),
  };
  const st = S.status;
  const target = {
    enemy: currentEnemy(), level: S.level, armorStrip: 1 - (1 - S.armorStrip / 100) * (1 - bs.armorStrip), vulnerability: bs.vulnerability,
    drOverride: S.drOverride === '' || S.drOverride == null ? undefined : Math.max(0, Math.min(100, +S.drOverride)) / 100,
    status: { viral: st.viral, corrosive: st.corrosive, magnetic: st.magnetic, heat: st.heat },
  };
  return { build, target, frameSrc };
}

function renderResult() {
  const { build, target, frameSrc } = buildInput();
  $('exaltText').textContent = `Урон × сила способностей фрейма (${pct(buildState_own())})`;
  $('frameLink').textContent = frameSrc.length ? `${ruName(currentFrame())}: ${frameSrc.map(s => s.name).join(', ')}` : `${ruName(currentFrame())}: нет эффектов для оружия`;
  const data = { scaling: D.scaling, damage: D.damage };
  let r, ct;
  try {
    r = calc(build, target, data, { part: S.part, crit: S.crit });
    ct = critTable(build, target, data, { part: S.part });
  } catch (err) {
    $('res').replaceChildren(h('p', { class: 'warn' }, 'Ошибка расчёта: ' + err.message));
    console.error(err);
    return;
  }
  const A = r.stats, E = r.enemy;
  $('enemyInfo').textContent = `Ур. ${E.level}: здоровье ${num(E.health, 0)}${E.shield ? ', щиты ' + num(E.shield, 0) : ''}, броня ${num(E.armorBase, 0)}` +
    (E.armorStrip ? ` → ${num(E.armor, 0)}` : '') + `, снижение урона ${pct(E.dr)}` + (E.abilityResist ? `, защита от способностей ${pct(E.abilityResist)}` : '') + `. Фракция: ${E.faction || '—'}.`;

  const where = S.part === 'head' ? 'в голову' : 'в тело';
  const tiles = [
    tile(`Удар ${where}`, num(r.hit.health, 1), `на экране ${num(Math.round(r.hit.health), 0)} · 1 снаряд`, true),
    tile('За выстрел', num(r.perShot.health, 0), `прямой ${num(r.perShot.direct, 0)} · доп. ${num(r.perShot.extra, 0)} · тики ${num(r.perShot.dot, 0)}`),
    tile('DPS', num(r.dps.sustained, 0), `пиковый ${num(r.dps.burst, 0)}`),
    tile('Убийство', `${num(r.kill.shots, 0)} выстр.`, Number.isFinite(r.kill.seconds) ? `${num(r.kill.seconds, 1)} с` : '—'),
  ];
  for (const x of r.extra) {
    tiles.push(tile(`${x.name}: доп. удар`, num(x.damage, 2), `на экране ${Math.round(x.damage)}`, true));
    tiles.push(tile(`${x.name}: тик`, num(x.tick, 2), `за ${x.ticks} тиков ${num(x.tick * x.ticks, 1)}`, true));
  }
  const statRows = [
    ['Урон за снаряд (квант.)', num(A.typesTotal * (1 + A.damageBonus) * A.finalMult, 2)],
    ['Мультивыстрел', num(A.multishot, 2)],
    ['Шанс крита', pct(A.critChance)], ['Множитель крита', '×' + num(A.critMultiplier, 2)],
    ['Шанс статуса', pct(A.statusChance)],
    ['Скорострельность', num(A.fireRate, 2) + '/с'],
    ...(A.magazine ? [['Магазин', num(A.magazine, 0)], ['Перезарядка', num(A.reload, 2) + ' с']] : []),
  ];
  const typeRows = Object.entries(r.hit.perType).map(([t, p]) => [TYPE_RU[t] || t, num(p.quantized, 2), '×' + num(p.dtm, 2), num(p.vsHealth, 2)]);
  const critRows = ct.tiers.map(t => [t.tier === 0 ? 'Без крита' : `Уровень ${t.tier}`, '×' + num(t.mult, 2), num(t.hit, 1)]);
  critRows.push(['Средний', `шанс ${pct(ct.chance)}`, num(ct.average, 1)]);
  const procRows = Object.entries(r.procs).filter(([, p]) => p > 0).map(([t, p]) => {
    const d = r.dots[t];
    return [TYPE_RU[t] || t, num(p * A.multishot, 3), d ? num(d.tick, 2) : '—', d ? num(d.perProc, 1) : '—'];
  });
  const mini = [h('span', {}, 'Удар ', h('b', {}, num(r.hit.health, 1))), h('span', {}, 'DPS ', h('b', {}, num(r.dps.sustained, 0)))];
  for (const x of r.extra) mini.push(h('span', {}, 'Доп. ', h('b', {}, num(x.damage, 1))), h('span', {}, 'Тик ', h('b', {}, num(x.tick, 2))));
  if (S.view !== 'frame') $('mini').replaceChildren(...mini, h('span', {}, '↓'));
  const sub = t => h('h3', { class: 'lbl', style: 'margin:14px 0 6px' }, t);
  // вклад модов и пороговые уровни
  let contrib = null, thr = null;
  try {
    contrib = modContribution(build, target, data, { part: S.part, crit: 'avg' });
    thr = shotThresholds(build, target, data, { part: S.part, crit: 'avg' });
  } catch (err) { console.error(err); }
  const contribRows = contrib ? contrib.rows.map(x => [`${x.name} (${x.kind})`, `−${num(x.loss * 100, 1)}%`, num(x.value, 0)]) : [];
  const thrRows = thr ? thr.map(t => [`${t.shots} ${t.shots === 1 ? 'выстрел' : t.shots < 5 ? 'выстрела' : 'выстрелов'}`,
    t.level === 0 ? 'не убивает и на мин. уровне' : t.level >= 9999 ? 'до 9999+' : `до ${num(t.level, 0)} ур.`]) : [];
  const cmp = compareBlock(r);
  $('res').replaceChildren(...[
    h('div', { class: 'tiles' }, tiles),
    cmp,
    contribRows.length ? h('details', { style: 'margin-top:12px' }, h('summary', {}, 'Вклад модов в DPS (средний крит)'),
      h('p', { class: 'muted' }, 'На сколько упадёт DPS, если снять мод, мистификатор, перк или бафф.'),
      table(['Что снять', 'DPS падает на', 'DPS без него'], contribRows)) : null,
    thrRows.length ? h('details', { style: 'margin-top:8px' }, h('summary', {}, `Пороговые уровни: ${ruName(target.enemy) || target.enemy.name}`),
      h('p', { class: 'muted' }, 'До какого уровня этот враг умирает за N выстрелов (средний крит, тики и доп. удары включены).'),
      table(['Выстрелов', 'Уровень врага'], thrRows)) : null,
    sub('Оружие с модами'), table(['Стат', 'Значение'], statRows),
    sub(`Урон по типам (${where}, ${S.crit === 'avg' ? 'средний крит' : S.crit === 'crit' ? 'крит' : 'без крита'})`),
    table(['Тип', 'На оружии', 'Фракция', 'По здоровью'], typeRows),
    sub('Уровни крита'), table(['Уровень', 'Множитель', `Удар ${where}`], critRows),
    procRows.length ? sub(`Статусы за выстрел и тики (${DOT_TICKS} тиков)`) : null,
    procRows.length ? table(['Статус', 'Процов', 'Тик', 'За статус'], procRows) : null,
    h('details', { style: 'margin-top:12px' }, h('summary', {}, 'Разбор формулы'),
      h('div', { class: 'steps' }, r.steps.map(s => h('div', { class: 'step' }, h('b', {}, s.label + ': ' + num(s.value, 3)), h('pre', {}, s.formula))))),
  ].filter(Boolean));
}

// ---------- фрейм: ввод ----------
function renderFrame() {
  const fr = currentFrame();
  const f = F();
  $('framePick').replaceChildren(h('b', {}, ruName(fr)), h('small', {}, fr.name));
  $('fRank30').checked = f.rank30;
  // Helminth: какую способность заменить и чем
  const abil = fr.abilities || [];
  $('helSlot').replaceChildren(h('option', { value: '' }, 'Без Helminth'), ...abil.map((a, i) => h('option', { value: String(i) }, `${i + 1}. ${a.ru || a.name}`)));
  $('helSlot').value = f.helminth.slot;
  const subsumed = [...new Map(D.warframes.filter(w => w.subsumed).map(w => {
    const a = (w.abilities || []).find(x => x.name === w.subsumed);
    return [w.subsumed, { name: w.subsumed, ru: a?.ru || w.subsumed, from: ruName(w) }];
  })).values()].sort((a, b) => a.ru.localeCompare(b.ru, 'ru'));
  $('helAbility').replaceChildren(h('option', { value: '' }, '—'), ...subsumed.map(a => h('option', { value: a.name }, `${a.ru} (${a.from})`)));
  $('helAbility').value = f.helminth.ability;
  $('helAbility').disabled = f.helminth.slot === '';
}

function renderFrameMods() {
  const f = F();
  const fr = currentFrame();
  const used = () => new Set([f.aura, ...f.mods, f.exilus].filter(Boolean).map(s => s.id));
  const own = c => { const x = (c || '').toLowerCase(); return x === 'warframe' || x === frameBase(fr).toLowerCase() || x === fr.name.toLowerCase(); };
  const isAura = m => (m.compat || '').toUpperCase() === 'AURA';
  const pol = polState('f', fr);
  const polOf = (kind, idx) => kind === 'aura' ? pol.aura : kind === 'exilus' ? pol.exilus : pol.slots[idx];
  const costOf = (s, kind, idx) => {
    const m = s && fModById(s.id);
    if (!m) return null;
    return kind === 'aura' ? capacity({ bonusSlot: { mod: m, rank: s.rank, polarity: pol.aura } }).bonusCost
      : capacity({ slots: [{ mod: m, rank: s.rank, polarity: polOf(kind, idx) }] }).costs[0];
  };
  const slot = (s, idx, kind) => slotEl({
    pol: polOf(kind, idx), cost: costOf(s, kind, idx),
    onPol: v => { if (kind === 'aura') pol.aura = v; else if (kind === 'exilus') pol.exilus = v; else pol.slots[idx] = v; updateFrame(); },
    slot: s, item: s && fModById(s.id), tag: kind === 'aura' ? 'Аура' : kind === 'exilus' ? 'Эксилус' : idx + 1,
    empty: kind === 'aura' ? '+ аура' : kind === 'exilus' ? '+ мод эксилуса' : '+ мод', cls: kind === 'normal' ? '' : 'exilus',
    onPick: () => pickMod({
      items: D.mods.warframe.filter(m => !used().has(m.id) && (kind === 'aura' ? isAura(m) : !isAura(m) && own(m.compat) && (kind !== 'exilus' || m.exilus))),
      onPick: m => { const v = { id: m.id, rank: maxRank(m) }; if (kind === 'aura') f.aura = v; else if (kind === 'exilus') f.exilus = v; else f.mods[idx] = v; updateFrame(); },
    }),
    onChange: updateFrame,
    onClear: () => { if (kind === 'aura') f.aura = null; else if (kind === 'exilus') f.exilus = null; else f.mods[idx] = null; updateFrame(); },
  });
  $('fSlotsTop').replaceChildren(slot(f.aura, -1, 'aura'), slot(f.exilus, -1, 'exilus'),
    ...f.arcanes.map((s, i) => slotEl({
      slot: s, item: s && fArcById(s.id), tag: `Мистиф. ${i + 1}`, empty: '+ мистификатор',
      onPick: () => pickMod({ items: D.arcanes.warframe.filter(a => !f.arcanes.some(x => x?.id === a.id)), onPick: a => { f.arcanes[i] = { id: a.id, rank: maxRank(a) }; updateFrame(); } }),
      onChange: updateFrame, onClear: () => { f.arcanes[i] = null; updateFrame(); },
    })));
  $('fSlots').replaceChildren(...f.mods.map((s, i) => slot(s, i, 'normal')));
  const aura = f.aura && fModById(f.aura.id);
  const cap = capacity({
    rank: pol.rank || 30, catalyst: pol.catalyst,
    slots: [...f.mods.map((x, i) => ({ mod: x && fModById(x.id), rank: x?.rank, polarity: pol.slots[i] })),
      { mod: f.exilus && fModById(f.exilus.id), rank: f.exilus?.rank, polarity: pol.exilus }],
    bonusSlot: aura ? { mod: aura, rank: f.aura.rank, polarity: pol.aura } : null,
  });
  capLine($('fCapInfo'), cap, pol, fr, updateFrame);
}

function renderShards() {
  const f = F();
  const colors = D.shards.colors;
  const rows = f.shards.map((s, i) => {
    const color = colors.find(c => c.id === s?.color);
    const eff = color?.effects.find(e => e.id === s?.effect);
    const set = v => { f.shards[i] = v; updateFrame(); };
    const colorSel = h('select', { 'aria-label': `Осколок ${i + 1}: цвет`, onchange: e => {
      const c = colors.find(x => x.id === e.target.value);
      set(c ? { color: c.id, effect: c.effects[0].id, tau: s?.tau || false } : null);
    } }, h('option', { value: '' }, '— пусто —'), ...colors.map(c => h('option', { value: c.id, selected: c.id === s?.color }, c.ru)));
    const kids = [h('span', { class: 'lbl' }, `${i + 1}`), colorSel];
    if (color) {
      kids.push(h('select', { 'aria-label': `Осколок ${i + 1}: эффект`, onchange: e => set({ ...s, effect: e.target.value }) },
        ...color.effects.map(e => h('option', { value: e.id, selected: e.id === s.effect }, e.ru))));
      kids.push(h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!s.tau, onchange: e => set({ ...s, tau: e.target.checked }) }), 'Тау'));
      if (eff?.stacksMax) {
        const key = 'shard:' + i;
        const max = s.tau && eff.stacksMaxTau ? eff.stacksMaxTau : eff.stacksMax;
        kids.push(h('input', { type: 'number', min: 0, max, step: 1, value: f.stacks[key] || 0, 'aria-label': 'Стаки', title: `Стаки, до ${max}`,
          oninput: e => { f.stacks[key] = Math.max(0, Math.min(max, +e.target.value || 0)); updateFrame(false); } }));
      }
    }
    return h('div', { class: 'shard' }, kids);
  });
  $('fShards').replaceChildren(...rows);
}

function renderFrameConds() {
  const f = F();
  const sources = [...[f.aura, ...f.mods, f.exilus].filter(Boolean).map(s => ({ key: 'mod:' + s.id, item: fModById(s.id), rank: s.rank })),
    ...f.arcanes.filter(Boolean).map(s => ({ key: 'arc:' + s.id, item: fArcById(s.id), rank: s.rank }))];
  const rows = condRows(sources, f, () => updateFrame(false), itemEffects);
  $('fConds').replaceChildren(...rows);
  $('fCondCard').hidden = !rows.length;
}

function renderFrameResult() {
  const fr = currentFrame();
  const r = frameResult();
  const b = r.base;
  const tiles = [
    tile('Эффективное здоровье', num(r.ehpAbil, 0), `здоровье с бронёй ${num(r.ehpHealth, 0)} + щиты ${num(r.shield, 0)}` +
      (r.abilityDR ? ` · способности −${pct(r.abilityDR)}` : ''), true),
    tile('Снижение урона бронёй', pct(r.dr), `броня ${num(r.armor, 0)}`),
  ];
  if (r.adapt) tiles.push(tile('С Адаптацией', num(r.ehpAdapt, 0), `сопротивление ${pct(r.adapt)} одному типу`, true));
  const rows = [
    ['Здоровье', num(b.health, 0), num(r.health, 0)], ['Щиты', num(b.shield, 0), num(r.shield, 0)],
    ['Броня', num(b.armor, 0), num(r.armor, 0)], ['Энергия', num(b.energy, 0), num(r.energy, 0)],
    ['Сила способностей', '100%', pct(r.strength)], ['Длительность', '100%', pct(r.duration)],
    ['Дальность', '100%', pct(r.range)], ['Эффективность', '100%', pct(r.efficiency)],
    ['Скорость бега', num(fr.sprint || 1, 2), num(r.sprint, 2)],
  ];
  if (S.view === 'frame') {
    $('mini').replaceChildren(h('span', {}, 'ЭЗ ', h('b', {}, num(r.ehpAbil, 0))), h('span', {}, 'Здоровье ', h('b', {}, num(r.health, 0))),
      h('span', {}, 'Броня ', h('b', {}, num(r.armor, 0))), h('span', {}, 'Сила ', h('b', {}, pct(r.strength))), h('span', {}, '↓'));
  }
  const ws = r.weaponSources;
  const sub = t => h('h3', { class: 'lbl', style: 'margin:14px 0 6px' }, t);
  $('fRes').replaceChildren(...[
    h('div', { class: 'tiles' }, tiles),
    sub(`Статы (${F().rank30 ? '30-й ранг' : '0-й ранг'})`), table(['Стат', 'База', 'С модами'], rows),
    h('div', { class: 'cond', style: 'margin-top:12px' },
      h('div', {}, h('b', {}, 'Адаптация (Adaptation), стаков'), h('div', { class: 'muted' }, '+10% сопротивления типу урона за стак, до 90%')),
      h('input', { type: 'number', min: 0, max: 9, step: 1, value: F().adaptation || 0, 'aria-label': 'Стаки Адаптации',
        oninput: e => { F().adaptation = Math.max(0, Math.min(9, +e.target.value || 0)); updateFrame(false); } })),
    sub('Идёт в расчёт оружия'),
    h('p', { class: 'muted' }, ws.length ? ws.map(s => s.name).join(' · ') : 'Ничего: ни аура, ни осколки, ни мистификаторы фрейма не влияют на урон оружия.'),
    F().helminth.slot !== '' ? h('p', { class: 'muted' }, `Helminth: способность ${+F().helminth.slot + 1} заменена на «${F().helminth.ability || '—'}». Эффекты способностей появятся на этапе 6.`) : null,
    h('details', { style: 'margin-top:12px' }, h('summary', {}, 'Разбор формулы'),
      h('div', { class: 'steps' }, r.steps.map(s => h('div', { class: 'step' }, h('b', {}, s.label + ': ' + num(s.value, 3)), h('pre', {}, s.formula))))),
  ].filter(Boolean));
}


// ---------- баффы ----------
const abilRu = name => { for (const w of D.warframes) for (const a of w.abilities || []) if (a.name === name && a.ru) return a.ru; return null; };
const buffLabel = d => d.ru || abilRu(d.ability) || d.ability;
const buffFrom = d => d.focus ? `фокус ${d.focus}` : (ruName(D.warframes.find(w => w.name === d.frame)) || d.frame);
const buffEffects = d => [...(d.effects || []), ...(d.variants || []).flatMap(v => v.effects || [])];

// строка баффа: вкл., вариант, число (заполнение/секунды); st — где хранится выбор
function buffRow(d, st, { tag, onRemove, defOn = true } = {}) {
  const set = patch => { Object.assign(st, patch); onBuffsChange(); };
  const ctl = [h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: st.on ?? defOn, onchange: e => set({ on: e.target.checked }) }), 'Вкл.')];
  if (d.variants) {
    ctl.push(h('select', { 'aria-label': 'Вариант', onchange: e => set({ variant: e.target.value }) },
      d.variants.map(v => h('option', { value: v.id, selected: v.id === (st.variant || d.variants[0].id) }, v.ru))));
  }
  if (d.input) {
    ctl.push(h('span', { class: 'chk' }, h('input', { type: 'number', min: 0, step: 'any', value: st.input ?? d.input.default, 'aria-label': d.input.ru,
      oninput: e => { st.input = +e.target.value || 0; onBuffsChange(false); } }), d.input.ru));
  }
  if (onRemove) ctl.push(h('button', { type: 'button', class: 'x-btn', 'aria-label': 'Убрать', onclick: onRemove }, '×'));
  return h('div', { class: 'buff' },
    h('div', {}, h('b', {}, buffLabel(d)), tag ? h('span', { class: 'tag' }, tag) : null, d.verified === false ? h('span', { class: 'warn' }, ' · не сверено') : null),
    h('div', { class: 'muted' }, d.note ? d.note + ' ' : '', h('a', { href: d.source, target: '_blank', rel: 'noopener' }, 'вики')),
    h('div', { class: 'buff-ctl' }, ctl));
}
function renderBuffs() {
  const { own } = buffState();
  const fr = currentFrame();
  for (const listId of ['buffList', 'fBuffList']) {
    const ownDefs = ownBuffDefs();
    const rows = [h('div', { class: 'buff-head' }, h('b', {}, `Свой фрейм: ${ruName(fr)}`), h('span', { class: 'muted' }, `сила ${pct(own)}`))];
    if (ownDefs.length) {
      for (const { def, helminth } of ownDefs) rows.push(buffRow(def, S.ownBuffs[def.id] ||= {}, { tag: helminth ? 'Гельминт' : null, defOn: false }));
    } else {
      rows.push(h('p', { class: 'muted' }, `У фрейма «${ruName(fr)}» нет баффов в базе калькулятора. Способность из Гельминта выбирается на вкладке «Фрейм».`));
    }
    S.allies.forEach((al, i) => {
      const rec = D.warframes.find(w => w.name === al.frame);
      rows.push(h('div', { class: 'buff-head' }, h('b', {}, `Союзник: ${ruName(rec) || al.frame}`), h('span', { class: 'muted' }, 'сила 100% (стоковая)'),
        h('button', { type: 'button', class: 'x-btn', 'aria-label': 'Убрать союзника', onclick: () => { S.allies.splice(i, 1); onBuffsChange(); } }, '×')));
      for (const d of frameBuffDefs(al.frame)) rows.push(buffRow(d, al.buffs[d.id] ||= {}));
    });
    const focus = S.buffs.filter(a => buffDef(a.id)?.focus);
    if (focus.length) {
      rows.push(h('div', { class: 'buff-head' }, h('b', {}, 'Фокус')));
      for (const a of focus) rows.push(buffRow(buffDef(a.id), a, { onRemove: () => { S.buffs.splice(S.buffs.indexOf(a), 1); onBuffsChange(); } }));
    }
    $(listId).replaceChildren(...rows);
  }
}
function onBuffsChange(full = true) {
  if (full) renderBuffs();
  renderFrameResult(); renderResult(); save();
}
function openAllyPicker() {
  const frames = [...new Set(D.buffs.buffs.filter(d => !d.focus).map(d => d.frame))].filter(f => !S.allies.some(a => a.frame === f));
  const rec = f => D.warframes.find(w => w.name === f) || { name: f };
  openPicker({
    items: frames.map(f => ({ name: f, rec: rec(f) })).sort((a, b) => ruName(a.rec).localeCompare(ruName(b.rec), 'ru')),
    placeholder: 'Фрейм союзника', label: x => ruName(x.rec),
    sub: x => [x.name !== ruName(x.rec) ? x.name : '', frameBuffDefs(x.name).map(buffLabel).join(', ')].filter(Boolean).join(' — '),
    onPick: x => { S.allies.push({ frame: x.name, buffs: {} }); onBuffsChange(); },
  });
}
function openFocusPicker() {
  openPicker({
    items: D.buffs.buffs.filter(d => d.focus && !S.buffs.some(a => a.id === d.id)).sort((a, b) => buffLabel(a).localeCompare(buffLabel(b), 'ru')),
    placeholder: 'Пассивка фокуса', label: buffLabel,
    sub: d => `${buffFrom(d)}${d.ability !== buffLabel(d) ? ' · ' + d.ability : ''}${d.note ? ' · ' + d.note : ''}`,
    onPick: d => { S.buffs.push({ id: d.id, on: true }); onBuffsChange(); },
  });
}

// ---------- сравнение A/B ----------
const snapshot = () => { const { compareA, view, ...rest } = S; return structuredClone(rest); };
function withState(st, fn) {
  const saved = S;
  S = { ...structuredClone(DEFAULT), ...st, frame: { ...structuredClone(FRAME_DEFAULT), ...(st.frame || {}) } };
  try { return fn(); } finally { S = saved; }
}
function compareBlock(rB) {
  $('clearA').hidden = !S.compareA;
  if (!S.compareA) return null;
  let rA;
  try {
    rA = withState(S.compareA, () => {
      if (!D.weapons[S.cat]) return null;
      const { build, target } = buildInput();
      return calc(build, target, { scaling: D.scaling, damage: D.damage }, { part: S.part, crit: S.crit });
    });
  } catch (err) { console.error(err); }
  if (!rA) return h('p', { class: 'muted' }, 'Билд A ещё загружается…');
  const row = (name, a, b, better = 'up', d = 0) => {
    const diff = a ? (b - a) / a : 0;
    const good = better === 'up' ? diff > 0 : diff < 0;
    return h('tr', {}, h('td', {}, name), h('td', { class: 'n' }, num(a, d)), h('td', { class: 'n' }, num(b, d)),
      h('td', { class: 'n ' + (Math.abs(diff) < 1e-9 ? '' : good ? 'up' : 'down') }, `${diff >= 0 ? '+' : ''}${num(diff * 100, 1)}%`));
  };
  const nameA = withState(S.compareA, () => ruName(currentWeapon()));
  return h('div', { style: 'margin-top:12px' },
    h('h3', { class: 'lbl', style: 'margin:0 0 6px' }, `Сравнение: A — ${nameA}, B — текущий`),
    h('div', { class: 'tbl' }, h('table', {}, h('thead', {}, h('tr', {}, ['', 'A', 'B', 'Разница'].map(x => h('th', {}, x)))),
      h('tbody', {},
        row('Удар', rA.hit.health, rB.hit.health, 'up', 1),
        row('За выстрел', rA.perShot.health, rB.perShot.health),
        row('DPS', rA.dps.sustained, rB.dps.sustained),
        row('Выстрелов до убийства', rA.kill.shots, rB.kill.shots, 'down'),
        row('Время на убийство, с', rA.kill.seconds, rB.kill.seconds, 'down', 1),
        row('Шанс крита, %', rA.stats.critChance * 100, rB.stats.critChance * 100, 'up', 1),
        row('Шанс статуса, %', rA.stats.statusChance * 100, rB.stats.statusChance * 100, 'up', 1)))));
}
async function loadStateData(st) {
  const cat = CATEGORIES.find(c => c.id === st.cat);
  if (!cat) return;
  D.weapons[st.cat] ||= await load(cat.file);
  const g = withState(st, () => currentGroup());
  D.mods[g] ||= await load(MOD_FILES[g]);
  if (ARCANE_FILES[st.cat]) D.arcanes[st.cat] ||= await load(ARCANE_FILES[st.cat]);
}

// ---------- ссылка на билд ----------
function toolMsg(text) { $('toolMsg').hidden = !text; $('toolMsg').textContent = text || ''; }
async function shareLink() {
  const code = await encodeBuild(snapshot());
  const url = `${location.origin}${location.pathname}#b=${code}`;
  $('shareBox').hidden = false;
  $('shareUrl').value = url;
  try { await navigator.clipboard.writeText(url); toolMsg('Ссылка скопирована. Кто откроет её, увидит этот билд.'); }
  catch { $('shareUrl').select(); toolMsg('Скопируй ссылку из поля выше.'); }
}
async function applySnapshot(st) {
  S = { ...structuredClone(DEFAULT), ...st, compareA: S?.compareA || null, frame: { ...structuredClone(FRAME_DEFAULT), ...(st.frame || {}) } };
  migrateBuffs();
  await ensureCategory();
  if (S.cat === 'melee') D.mods.stance ||= await load('data/mods/stance.json');
}

// ---------- импорт из AlecaFrame ----------
async function onAlecaFile(file) {
  if (!file) return;
  toolMsg('Читаю файл AlecaFrame…');
  let inv;
  try { inv = await readAleca(file); }
  catch { toolMsg('Не получилось расшифровать файл. Нужен %LOCALAPPDATA%\\AlecaFrame\\lastData.dat.'); return; }
  for (const c of CATEGORIES) D.weapons[c.id] ||= await load(c.file);
  const lookup = upgradeLookup(inv);
  const entries = [];
  for (const o of ownedItems(inv)) {
    const rec = o.kind === 'weapon' ? D.weapons[o.cat].find(x => x.id === o.item.ItemType) : D.warframes.find(x => x.id === o.item.ItemType);
    if (!rec) continue;
    (o.item.Configs || []).forEach((c, i) => {
      const n = (c.Upgrades || []).filter(Boolean).length;
      if (n || i === 0) entries.push({ ...o, rec, ci: i, n, cname: c.Name });
    });
  }
  toolMsg(`В инвентаре ${entries.length} конфигураций. Выбери, что загрузить.`);
  openPicker({
    items: entries.sort((a, b) => ruName(a.rec).localeCompare(ruName(b.rec), 'ru') || a.ci - b.ci),
    placeholder: 'Оружие или фрейм из инвентаря',
    label: e => `${ruName(e.rec)} — конфиг ${'ABCDEF'[e.ci] || e.ci + 1}${e.cname ? ' «' + e.cname + '»' : ''}`,
    sub: e => `${e.kind === 'weapon' ? 'Оружие' : 'Фрейм'} · модов ${e.n}`,
    onPick: e => applyAleca(e, lookup).catch(err => { console.error(err); toolMsg('Ошибка импорта: ' + err.message); }),
  });
}

async function applyAleca(e, lookup) {
  const ups = e.item.Configs[e.ci].Upgrades || [];
  const sp = slotPolarities(e.item);
  const missing = [];
  const slotOf = (entry, find) => {
    const u = lookup(entry);
    if (!u) return null;
    const m = find(u.type);
    if (!m) { missing.push(u.type.split('/').pop()); return null; }
    return { id: m.id, rank: Math.min(u.rank, maxRank(m)) };
  };
  const visual = [7, 6, 5, 4, 3, 2, 1, 0];       // в игре слоты идут в обратном порядке массива Upgrades
  const catalyst = !!((e.item.Features || 0) & 1);
  // В Polarity только поляризованные слоты; где стоят врождённые полярности, файл не говорит.
  // Ставим каждую врождённую в свободный слот с самым дорогим модом той же полярности, иначе в пустой, иначе к самому дешёвому.
  const slotPols = (mods, innate) => {
    const pol = visual.map(i => sp[i] || null);
    const free = pol.map((p, j) => (p ? -1 : j)).filter(j => j >= 0);
    const cost = j => (mods[j] ? (findAny(mods[j].id)?.drain ?? 0) + mods[j].rank : -1);
    for (const p of innate.map(lower).filter(Boolean)) {
      if (!free.length) break;
      let k = -1, best = -1;
      free.forEach((j, n) => { const m = mods[j] && findAny(mods[j].id); if (m && polarityMatch(p, m.polarity) === true && cost(j) > best) { best = cost(j); k = n; } });
      if (k < 0) k = free.findIndex(j => !mods[j]);
      if (k < 0) { best = Infinity; free.forEach((j, n) => { if (cost(j) < best) { best = cost(j); k = n; } }); }
      pol[free.splice(k, 1)[0]] = p;
    }
    return pol;
  };
  let findAny;
  if (e.kind === 'weapon') {
    S.cat = e.cat; S.weapon = e.rec.name; S.attack = 0;
    await ensureCategory();
    const melee = S.cat === 'melee';
    if (melee) D.mods.stance ||= await load('data/mods/stance.json');
    // оружие: 0–7 моды, 8 эксилус, 9 мистификатор; ближний бой: 8 стойка, 9 эксилус, 10 мистификатор
    const ix = melee ? { exilus: 9, arcane: 10 } : { exilus: 8, arcane: 9 };
    const findMod = t => modsOf().find(m => m.id === t);
    findAny = findMod;
    S.mods = visual.map(i => slotOf(ups[i], findMod));
    S.exilus = slotOf(ups[ix.exilus], findMod);
    S.arcane = slotOf(ups[ix.arcane], t => arcanesOf().find(a => a.id === t));
    S.stance = melee ? slotOf(ups[8], t => D.mods.stance.find(m => m.id === t)) : null;
    delete S.pol['w:' + e.rec.name];
    const pol = polState('w', e.rec);
    pol.slots = slotPols(S.mods, e.rec.polarities || []);
    pol.exilus = sp[ix.exilus] || lower(e.rec.exilusPolarity);
    if (melee) pol.aura = sp[8] || lower(e.rec.stancePolarity);
    pol.catalyst = catalyst;
    pol.rank = maxItemRank('w', e.rec);
    const inc = D.incarnon?.[e.rec.name];
    if (inc && e.item.SkillTree) {
      const sel = S.incarnon[e.rec.name] = {};
      for (const t of inc.tiers) {
        const idx = +e.item.SkillTree[t.tier - 1];
        if (Number.isFinite(idx) && t.perks[idx]) sel[t.tier] = t.perks[idx].name;
      }
    }
    setView('weapon');
    renderAll();
  } else {
    const f = F();
    f.name = e.rec.name;
    findAny = fModById;
    f.mods = visual.map(i => slotOf(ups[i], fModById));
    f.aura = slotOf(ups[8], fModById);
    f.exilus = slotOf(ups[9], fModById);
    f.arcanes = [slotOf(ups[10], fArcById), slotOf(ups[11], fArcById)];
    const sh = readShards(e.item, D.shards);
    f.shards = Array.from({ length: 5 }, (_, i) => sh[i] ? { color: sh[i].color, effect: sh[i].effect, tau: sh[i].tau } : null);
    const ov = e.item.Configs[e.ci].AbilityOverride;
    f.helminth = { slot: '', ability: '' };
    if (ov?.Ability) {
      for (const w of D.warframes) for (const a of w.abilities || []) if (a.id === ov.Ability) f.helminth = { slot: String(ov.Index), ability: a.name };
    }
    // фрейм: 0–7 моды, 8 аура, 9 эксилус, 10–11 мистификаторы
    delete S.pol['f:' + e.rec.name];
    const pol = polState('f', e.rec);
    pol.slots = slotPols(f.mods, e.rec.polarities || []);
    pol.aura = sp[8] || lower(e.rec.auraPolarity);
    pol.exilus = sp[9] || lower(e.rec.exilusPolarity);
    pol.catalyst = catalyst;
    setView('frame');
    renderFrame(); updateFrame();
  }
  toolMsg(`Загружено: ${ruName(e.rec)}, конфиг ${'ABCDEF'[e.ci] || e.ci + 1}.` + (missing.length ? ` Не нашёл в данных: ${missing.join(', ')}.` : ''));
  save();
}

// ---------- обновление ----------
function update(full = true) {
  if (full) { renderMods(); renderConds(); renderEnemySegs(); }
  renderResult();
  save();
}
function updateFrame(full = true) {
  if (full) { renderFrameMods(); renderShards(); renderFrameConds(); }
  renderBuffs();
  renderFrameResult();
  renderResult();
  save();
}
function renderAll() { renderWeapon(); update(); }

function setView(v) {
  S.view = v;
  $('viewWeapon').hidden = v !== 'weapon';
  $('viewFrame').hidden = v !== 'frame';
  segmented($('viewSeg'), [['weapon', 'Оружие'], ['frame', 'Фрейм']], v, setView);
  if (D.warframes) { renderFrameResult(); renderResult(); }
  save();
}

function bindInputs() {
  const bindNum = (id, get, set, cb = () => update(false)) => { const el = $(id); el.value = get(); el.addEventListener('input', () => { set(el.value); cb(); }); };
  const bindChk = (id, get, set, cb = () => update(false)) => { const el = $(id); el.checked = get(); el.addEventListener('change', () => { set(el.checked); cb(); }); };
  bindNum('cMult', () => S.customMult, v => S.customMult = v === '' ? 1 : +v);
  bindNum('cStatus', () => S.customStatus, v => S.customStatus = +v || 0);
  bindChk('useFrame', () => F().use, v => F().use = v);
  bindNum('combo', () => S.combo, v => S.combo = Math.max(1, Math.min(13, Math.round(+v) || 1)));
  bindChk('exaltScale', () => S.exaltedScale, v => S.exaltedScale = v);
  bindNum('lvl', () => S.level, v => S.level = Math.max(1, +v || 1));
  bindNum('strip', () => S.armorStrip, v => S.armorStrip = Math.max(0, Math.min(100, +v || 0)));
  bindNum('drOv', () => S.drOverride, v => S.drOverride = v);
  bindNum('stViral', () => S.status.viral, v => S.status.viral = +v || 0);
  bindNum('stCorr', () => S.status.corrosive, v => S.status.corrosive = +v || 0);
  bindNum('stMag', () => S.status.magnetic, v => S.status.magnetic = +v || 0);
  bindChk('stHeat', () => S.status.heat, v => S.status.heat = v);
  bindChk('fRank30', () => F().rank30, v => F().rank30 = v, () => updateFrame(false));
  $('helSlot').addEventListener('change', e => { F().helminth.slot = e.target.value; if (e.target.value === '') F().helminth.ability = ''; renderFrame(); updateFrame(false); });
  $('helAbility').addEventListener('change', e => { F().helminth.ability = e.target.value; updateFrame(false); });
  $('attackSel').addEventListener('change', e => { S.attack = +e.target.value; update(false); });
  $('weaponPick').addEventListener('click', () => openPicker({
    items: weaponList().slice().sort((a, b) => ruName(a).localeCompare(ruName(b), 'ru')), placeholder: 'Название оружия',
    label: ruName, sub: w => `${w.name} · ${w.class || ''}`,
    onPick: async w => { S.weapon = w.name; S.attack = 0; S.mods = Array(8).fill(null); S.exilus = null; S.arcane = null; await ensureCategory(); renderAll(); },
  }));
  $('enemyPick').addEventListener('click', () => openPicker({
    items: D.enemies, placeholder: 'Имя врага (англ.) или фракция', label: e => e.ru || e.name,
    sub: e => `${e.faction || '—'} · здоровье ${e.health ?? 0}${e.shield ? ', щиты ' + e.shield : ''}${e.armor ? ', броня ' + e.armor : ''} · баз. ур. ${e.baseLevel ?? 1}`,
    onPick: e => { S.enemy = e.name; update(); },
  }));
  $('framePick').addEventListener('click', () => openPicker({
    items: D.warframes.slice().sort((a, b) => ruName(a).localeCompare(ruName(b), 'ru')), placeholder: 'Название фрейма',
    label: ruName, sub: w => `${w.name} · здоровье ${w.rank30?.health}, щиты ${w.rank30?.shield}, броня ${w.rank30?.armor}, энергия ${w.rank30?.energy}`,
    onPick: w => { Object.assign(F(), { name: w.name, mods: Array(8).fill(null), exilus: null, helminth: { slot: '', ability: '' } }); renderFrame(); updateFrame(); },
  }));
  for (const id of ['addBuff', 'fAddBuff']) $(id).addEventListener('click', openAllyPicker);
  for (const id of ['addFocus', 'fAddFocus']) $(id).addEventListener('click', openFocusPicker);
  $('shareBtn').addEventListener('click', () => shareLink().catch(err => toolMsg('Не получилось: ' + err.message)));
  $('shareCopy').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('shareUrl').value); toolMsg('Ссылка скопирована.'); } catch { $('shareUrl').select(); } });
  $('saveA').addEventListener('click', () => { S.compareA = snapshot(); toolMsg('Билд запомнен как A. Меняй что угодно — сравнение появится в результате.'); update(false); });
  $('clearA').addEventListener('click', () => { S.compareA = null; toolMsg(''); update(false); });
  $('alecaFile').addEventListener('change', e => { onAlecaFile(e.target.files[0]); e.target.value = ''; });
  $('mini').addEventListener('click', () => $(S.view === 'frame' ? 'fResCard' : 'resCard').scrollIntoView({ behavior: 'smooth' }));
}

// ---------- старт ----------
async function start() {
  initPicker();
  try {
    [D.enemies, D.scaling, D.damage, D.warframes, D.shards, D.mods.warframe, D.arcanes.warframe, D.buffs] = await Promise.all([
      load('data/enemies.json'), load('data/manual/scaling.json'), load('data/damage.json'), load('data/warframes.json'),
      load('data/manual/shards.json'), load('data/mods/warframe.json'), load('data/arcanes/warframe.json'), load('data/manual/buffs.json')]);
    D.incarnon = await load('data/incarnon.json');
    migrateBuffs();
    const m = location.hash.match(/^#b=([\w-]+)$/);
    if (m) {
      try { await applySnapshot(await decodeBuild(m[1])); toolMsg('Открыт билд по ссылке.'); }
      catch (err) { console.error(err); toolMsg('Ссылка на билд повреждена — открыт последний сохранённый.'); }
      history.replaceState(null, '', location.pathname);
    }
    await ensureCategory();
    if (S.cat === 'melee') D.mods.stance ||= await load('data/mods/stance.json');
    if (S.compareA) await loadStateData(S.compareA).catch(() => {});
  } catch (err) {
    $('res').replaceChildren(h('p', { class: 'warn' }, 'Не удалось загрузить данные: ' + err.message));
    return;
  }
  bindInputs();
  setView(S.view || 'weapon');
  renderFrame();
  renderFrameMods(); renderShards(); renderFrameConds(); renderBuffs(); renderFrameResult();
  renderAll();
  load('data/meta.json').then(m => {
    const c = m.counts || {};
    $('dataMeta').prepend(`Версия данных: WFCD ${m.wfcd?.tag || '—'} (${m.wfcd?.date || '—'}), сборка ${m.built}. Оружия ${c.weapons}, модов ${c.mods}, мистификаторов ${c.arcanes}, фреймов ${c.warframes}, врагов ${c.enemies}. `, h('br'));
  }).catch(() => {});
}
start();

// ---------- PWA: офлайн и обновления ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    const offer = w => { $('updateBtn').hidden = false; $('updateBtn').onclick = () => w.postMessage('skipWaiting'); };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    });
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
}
