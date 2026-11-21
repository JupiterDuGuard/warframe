// Интерфейс калькулятора. Считает движок js/engine (без DOM), здесь только ввод и вывод.
import { calc, critTable, itemEffects, frameStats, resolveBuffs, TYPE_RU, DOT_TICKS } from './engine/index.js';
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
  buffs: [{ id: 'silken_stride', on: true, variant: 'ground', ownStrength: false, strength: 100, helminth: false }], customMult: 1, customStatus: 0,
  enemy: 'Heavy Gunner', level: 115, part: 'body', crit: 'none', armorStrip: 0, drOverride: '',
  status: { viral: 0, corrosive: 0, magnetic: 0, heat: false },
  frame: FRAME_DEFAULT,
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
// баффы: сила «своя» берётся у фрейма с его модами и баффами на силу (два прохода)
function buffState() {
  const fr = currentFrame();
  const own0 = frameStats(fr, frameInput(), D.shards).strength;
  let res = resolveBuffs(S.buffs, D.buffs.buffs, { ownStrength: own0, slot: S.cat });
  const own = frameStats(fr, { ...frameInput(), buffSources: res.frameSources }, D.shards).strength;
  if (own !== own0) res = resolveBuffs(S.buffs, D.buffs.buffs, { ownStrength: own, slot: S.cat });
  return { res, own };
}
const frameResult = () => frameStats(currentFrame(), { ...frameInput(), buffSources: buffState().res.frameSources }, D.shards);

// ---------- оружие: ввод ----------
function renderWeapon() {
  segmented($('catSeg'), CATEGORIES.map(c => [c.id, c.ru]), S.cat, async v => {
    S.cat = v; S.weapon = ''; S.attack = 0; S.mods = Array(8).fill(null); S.exilus = null; S.arcane = null;
    await ensureCategory(); renderAll();
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
  const used = () => new Set([...S.mods, S.exilus].filter(Boolean).map(s => s.id));
  const modSlot = (slot, idx, exilus) => slotEl({
    slot, item: slot && modById(slot.id), tag: exilus ? 'Эксилус' : idx + 1, empty: exilus ? '+ мод эксилуса' : '+ мод',
    cls: exilus ? 'exilus' : '',
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
  $('slotsExtra').replaceChildren(...extra);
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
  $('res').replaceChildren(...[
    h('div', { class: 'tiles' }, tiles),
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
  const slot = (s, idx, kind) => slotEl({
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

function renderBuffs() {
  const { own } = buffState();
  for (const listId of ['buffList', 'fBuffList']) {
    const rows = S.buffs.map((a, i) => {
      const d = D.buffs.buffs.find(x => x.id === a.id);
      if (!d) return null;
      const set = patch => { Object.assign(a, patch); onBuffsChange(); };
      const ctl = [h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!a.on, onchange: e => set({ on: e.target.checked }) }), 'Вкл.')];
      if (d.variants) {
        ctl.push(h('select', { 'aria-label': 'Вариант', onchange: e => set({ variant: e.target.value }) },
          d.variants.map(v => h('option', { value: v.id, selected: v.id === (a.variant || d.variants[0].id) }, v.ru))));
      }
      const scales = buffEffects(d).some(e => e.scale) || d.extraHit?.scale || (d.variants || []).some(v => v.extraHit?.scale);
      if (scales) {
        ctl.push(h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!a.ownStrength, onchange: e => set({ ownStrength: e.target.checked }) }),
          `сила моего фрейма (${pct(own)})`));
        if (!a.ownStrength) {
          ctl.push(h('span', { class: 'chk' }, h('input', { type: 'number', min: 0, step: 'any', value: a.strength ?? 100, 'aria-label': 'Сила способностей, %',
            oninput: e => { a.strength = +e.target.value || 0; onBuffsChange(false); } }), '% силы'));
        }
      }
      if (buffEffects(d).some(e => e.helminth != null || e.helminthCap != null)) {
        ctl.push(h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!a.helminth, onchange: e => set({ helminth: e.target.checked }) }), 'через Helminth'));
      }
      if (d.input) {
        ctl.push(h('span', { class: 'chk' }, h('input', { type: 'number', min: 0, step: 'any', value: a.input ?? d.input.default, 'aria-label': d.input.ru,
          oninput: e => { a.input = +e.target.value || 0; onBuffsChange(false); } }), d.input.ru));
      }
      ctl.push(h('button', { type: 'button', class: 'x-btn', 'aria-label': 'Убрать бафф', onclick: () => { S.buffs.splice(i, 1); onBuffsChange(); } }, '×'));
      return h('div', { class: 'buff' },
        h('div', {}, h('b', {}, buffLabel(d)), h('span', { class: 'muted' }, ` · ${buffFrom(d)}`), d.verified === false ? h('span', { class: 'warn' }, ' · не сверено') : null),
        h('div', { class: 'muted' }, d.note ? d.note + ' ' : '', h('a', { href: d.source, target: '_blank', rel: 'noopener' }, 'вики')),
        h('div', { class: 'buff-ctl' }, ctl));
    }).filter(Boolean);
    $(listId).replaceChildren(...rows);
  }
}
function onBuffsChange(full = true) {
  if (full) renderBuffs();
  renderFrameResult(); renderResult(); save();
}
function openBuffPicker() {
  openPicker({
    items: D.buffs.buffs.filter(d => !S.buffs.some(a => a.id === d.id)).sort((a, b) => buffLabel(a).localeCompare(buffLabel(b), 'ru')),
    placeholder: 'Способность, фрейм или школа фокуса', label: buffLabel,
    sub: d => `${buffFrom(d)}${d.ability !== buffLabel(d) ? ' · ' + d.ability : ''}${d.note ? ' · ' + d.note : ''}`,
    onPick: d => { S.buffs.push({ id: d.id, on: true, variant: d.variants?.[0].id, ownStrength: false, strength: 100, helminth: false }); onBuffsChange(); },
  });
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
  $('addBuff').addEventListener('click', openBuffPicker);
  $('fAddBuff').addEventListener('click', openBuffPicker);
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
    await ensureCategory();
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
