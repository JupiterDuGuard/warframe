// Интерфейс калькулятора урона. Считает движок js/engine (без DOM), здесь только ввод и вывод.
import { calc, critTable, itemEffects, TYPE_RU, DOT_TICKS } from './engine/index.js';
import { load, CATEGORIES, MOD_FILES, ARCANE_FILES, modGroup, modFits, ruName } from './store.js';

const $ = id => document.getElementById(id);
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : String(k));
  return e;
};
const num = (x, d = 1) => Number.isFinite(x) ? x.toLocaleString('ru-RU', { maximumFractionDigits: d }) : '—';
const pct = x => num(x * 100, 1) + '%';

// ---------- состояние ----------
const DEFAULT = {
  cat: 'secondary', weapon: 'Laetum', attack: 0,
  mods: Array(8).fill(null), exilus: null, arcane: null,
  stacks: {}, flags: {}, statusTypes: 0,
  oraxia: { on: true, strength: 100, wall: false }, customMult: 1, customStatus: 0,
  enemy: 'Heavy Gunner', level: 115, part: 'body', crit: 'none', armorStrip: 0, drOverride: '',
  status: { viral: 0, corrosive: 0, magnetic: 0, heat: false },
};
const KEY = 'wf-calc-v1';
let S;
try { S = { ...structuredClone(DEFAULT), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { S = structuredClone(DEFAULT); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* приватный режим */ } };

const D = { weapons: {}, mods: {}, arcanes: {} };

// ---------- выбор из списка ----------
const sheet = $('sheet');
let sheetCtx = null;
function openPicker({ items, label, sub, onPick, placeholder }) {
  sheetCtx = { items, label, sub, onPick };
  $('sheetSearch').value = '';
  $('sheetSearch').placeholder = placeholder || 'Поиск';
  renderPicker();
  sheet.showModal();
  $('sheetSearch').focus();
}
function renderPicker() {
  const q = $('sheetSearch').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = $('sheetList');
  list.replaceChildren();
  let n = 0;
  for (const it of sheetCtx.items) {
    const text = (sheetCtx.label(it) + ' ' + (it.name || '') + ' ' + (sheetCtx.sub(it) || '')).toLowerCase();
    if (q.some(w => !text.includes(w))) continue;
    if (++n > 150) break;
    list.append(h('button', { type: 'button', class: 'opt', onclick: () => { sheet.close(); sheetCtx.onPick(it); } },
      h('b', {}, sheetCtx.label(it)), sheetCtx.sub(it) ? h('span', {}, sheetCtx.sub(it)) : null));
  }
  if (!n) list.append(h('p', { class: 'muted', style: 'padding:10px' }, 'Ничего не найдено'));
}
$('sheetSearch').addEventListener('input', renderPicker);
$('sheetClose').addEventListener('click', () => sheet.close());
sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); });

// ---------- данные ----------
const weaponList = () => (D.weapons[S.cat] || []).filter(w => w.class !== 'Exalted Weapon' && w.attacks?.length);
const currentWeapon = () => weaponList().find(w => w.name === S.weapon) || weaponList()[0];
const currentGroup = () => modGroup(currentWeapon(), S.cat);
const modsOf = () => D.mods[currentGroup()] || [];
const modById = id => modsOf().find(m => m.id === id);
const arcanesOf = () => D.arcanes[S.cat] || [];
const arcById = id => arcanesOf().find(a => a.id === id);
const currentEnemy = () => D.enemies.find(e => e.name === S.enemy) || D.enemies[0];

async function ensureCategory() {
  const cat = CATEGORIES.find(c => c.id === S.cat) || CATEGORIES[1];
  D.weapons[S.cat] ||= await load(cat.file);
  const w = currentWeapon();
  S.weapon = w.name;
  const g = currentGroup();
  D.mods[g] ||= await load(MOD_FILES[g]);
  if (ARCANE_FILES[S.cat]) D.arcanes[S.cat] ||= await load(ARCANE_FILES[S.cat]);
}

// ---------- отрисовка ввода ----------
function segmented(el, options, value, onChange) {
  el.replaceChildren(...options.map(([v, text]) => h('button', {
    type: 'button', 'aria-pressed': String(v === value), onclick: () => onChange(v),
  }, text)));
}

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
  const note = $('weaponNote');
  note.hidden = S.cat !== 'melee';
  note.textContent = 'Ближний бой считается как один удар без комбо, стоек и тяжёлых атак — это этап 7.';
}

function slotEl(slot, idx, exilus = false) {
  const m = slot && modById(slot.id);
  const pick = () => openModPicker(idx, exilus);
  if (!m) {
    return h('div', { class: 'slot' + (exilus ? ' exilus' : '') },
      h('span', { class: 'num' }, exilus ? 'Эксилус' : idx + 1),
      h('button', { type: 'button', class: 'empty', onclick: pick }, exilus ? '+ мод эксилуса' : '+ мод'));
  }
  const max = m.maxRank ?? (m.ranks.length - 1);
  const setRank = d => { slot.rank = Math.max(0, Math.min(max, slot.rank + d)); update(); };
  return h('div', { class: 'slot filled' + (exilus ? ' exilus' : '') },
    h('span', { class: 'num' }, exilus ? 'Эксилус' : idx + 1),
    h('button', { type: 'button', class: 'name', onclick: pick, title: (m.textRu || m.text || []).join('; ') }, ruName(m)),
    h('div', { class: 'rank' },
      h('button', { type: 'button', 'aria-label': 'Ранг ниже', onclick: () => setRank(-1) }, '−'),
      h('span', {}, `${slot.rank}/${max}`),
      h('button', { type: 'button', 'aria-label': 'Ранг выше', onclick: () => setRank(1) }, '+'),
      h('button', { type: 'button', class: 'x', 'aria-label': 'Убрать мод', onclick: () => {
        if (exilus) S.exilus = null; else S.mods[idx] = null; update();
      } }, '×')));
}

function openModPicker(idx, exilus) {
  const w = currentWeapon();
  const used = new Set([...S.mods, S.exilus].filter(Boolean).map(s => s.id));
  const items = modsOf().filter(m => modFits(m, w, S.cat) && (!exilus || m.exilus) && !used.has(m.id))
    .sort((a, b) => ruName(a).localeCompare(ruName(b), 'ru'));
  openPicker({
    items, placeholder: 'Название мода', label: ruName,
    sub: m => [(m.textRu || []).join(' · ').replace(/\\n/g, ' '), m.name !== ruName(m) ? m.name : ''].filter(Boolean).join(' — '),
    onPick: m => {
      const slot = { id: m.id, rank: m.maxRank ?? m.ranks.length - 1 };
      if (exilus) S.exilus = slot; else S.mods[idx] = slot;
      update();
    },
  });
}

function arcaneEl() {
  const list = arcanesOf();
  if (!list.length) return null;
  const a = S.arcane && arcById(S.arcane.id);
  const pick = () => openPicker({
    items: [...list].sort((x, y) => ruName(x).localeCompare(ruName(y), 'ru')), placeholder: 'Название мистификатора', label: ruName,
    sub: x => (x.textRu || []).join(' · ').replace(/\\n/g, ' '),
    onPick: x => { S.arcane = { id: x.id, rank: x.maxRank ?? 5 }; update(); },
  });
  if (!a) return h('div', { class: 'slot' }, h('span', { class: 'num' }, 'Мистиф.'), h('button', { type: 'button', class: 'empty', onclick: pick }, '+ мистификатор'));
  const max = a.maxRank ?? (a.ranks.length - 1);
  const setRank = d => { S.arcane.rank = Math.max(0, Math.min(max, S.arcane.rank + d)); update(); };
  return h('div', { class: 'slot filled' },
    h('span', { class: 'num' }, 'Мистиф.'),
    h('button', { type: 'button', class: 'name', onclick: pick }, ruName(a)),
    h('div', { class: 'rank' },
      h('button', { type: 'button', onclick: () => setRank(-1), 'aria-label': 'Ранг ниже' }, '−'), h('span', {}, `${S.arcane.rank}/${max}`),
      h('button', { type: 'button', onclick: () => setRank(1), 'aria-label': 'Ранг выше' }, '+'),
      h('button', { type: 'button', class: 'x', onclick: () => { S.arcane = null; update(); }, 'aria-label': 'Убрать мистификатор' }, '×')));
}

function renderMods() {
  $('slots').replaceChildren(...S.mods.map((s, i) => slotEl(s, i)));
  $('slotsExtra').replaceChildren(...[slotEl(S.exilus, -1, true), arcaneEl()].filter(Boolean));
  const warn = [];
  for (const s of [...S.mods, S.exilus]) {
    const m = s && modById(s.id);
    if (m?.unparsed) warn.push(`⚠ «${ruName(m)}» разобран не полностью: ${m.unparsed.join('; ')}`);
  }
  const a = S.arcane && arcById(S.arcane.id);
  if (a?.unparsed) warn.push(`⚠ «${ruName(a)}» разобран не полностью: ${a.unparsed.join('; ')}`);
  $('modWarn').replaceChildren(...warn.map(t => h('div', {}, t)));
}

const FLAG_RU = { aiming: 'Прицеливание', first_shot: 'Первый выстрел в магазине', invisible: 'Невидимость', blocking: 'Блок' };

function renderConds() {
  const rows = [];
  const flags = new Set();
  let needStatus = false;
  const sources = [...[...S.mods, S.exilus].filter(Boolean).map(s => ({ s, item: modById(s.id), key: 'mod:' + s.id })),
    ...(S.arcane ? [{ s: S.arcane, item: arcById(S.arcane.id), key: 'arc:' + S.arcane.id }] : [])];
  for (const { s, item, key } of sources) {
    if (!item) continue;
    const effs = itemEffects(item, s.rank).filter(e => e.condition);
    let maxStacks = 0, triggered = false;
    for (const e of effs) {
      const c = e.condition;
      for (const f of Object.keys(FLAG_RU)) if (c[f]) flags.add(f);
      if (c.per === 'status_type') needStatus = true;
      if (c.trigger || c.stacks || c.duration || c.chance) { triggered = true; maxStacks = Math.max(maxStacks, c.stacks || 1); }
    }
    if (!triggered) continue;
    const desc = (item.textRu?.length ? item.textRu : item.text || []).join(' · ').replace(/\\n/g, ' ');
    const inp = maxStacks > 1
      ? h('input', { type: 'number', min: 0, max: maxStacks, step: 1, value: S.stacks[key] || 0, 'aria-label': 'Стаки',
          oninput: e => { S.stacks[key] = Math.max(0, Math.min(maxStacks, +e.target.value || 0)); update(false); } })
      : h('input', { type: 'checkbox', checked: !!S.stacks[key], 'aria-label': 'Включено',
          onchange: e => { S.stacks[key] = e.target.checked ? 1 : 0; update(false); } });
    rows.push(h('div', { class: 'cond' }, h('div', {}, h('b', {}, ruName(item)), h('div', { class: 'muted' }, desc)), inp));
  }
  for (const f of flags) {
    rows.push(h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!S.flags[f], onchange: e => { S.flags[f] = e.target.checked; update(false); } }), FLAG_RU[f]));
  }
  if (needStatus) {
    rows.push(h('div', { class: 'cond' }, h('div', {}, h('b', {}, 'Разных статусов на цели'), h('div', { class: 'muted' }, 'Для Condition Overload и Galvanized; 0 — считать по статусам из панели противника')),
      h('input', { type: 'number', min: 0, max: 16, step: 1, value: S.statusTypes || 0, oninput: e => { S.statusTypes = +e.target.value || 0; update(false); } })));
  }
  $('conds').replaceChildren(...rows);
  $('condCard').hidden = !rows.length;
}

function bindInputs() {
  const bindNum = (id, get, set) => { const el = $(id); el.value = get(); el.addEventListener('input', () => { set(el.value); update(false); }); };
  const bindChk = (id, get, set) => { const el = $(id); el.checked = get(); el.addEventListener('change', () => { set(el.checked); update(false); }); };
  bindChk('oraOn', () => S.oraxia.on, v => { S.oraxia.on = v; $('oraRow').hidden = !v; });
  $('oraRow').hidden = !S.oraxia.on;
  bindNum('oraStr', () => S.oraxia.strength, v => S.oraxia.strength = +v || 0);
  bindChk('oraWall', () => S.oraxia.wall, v => S.oraxia.wall = v);
  bindNum('cMult', () => S.customMult, v => S.customMult = v === '' ? 1 : +v);
  bindNum('cStatus', () => S.customStatus, v => S.customStatus = +v || 0);
  bindNum('lvl', () => S.level, v => S.level = Math.max(1, +v || 1));
  bindNum('strip', () => S.armorStrip, v => S.armorStrip = Math.max(0, Math.min(100, +v || 0)));
  bindNum('drOv', () => S.drOverride, v => S.drOverride = v);
  bindNum('stViral', () => S.status.viral, v => S.status.viral = +v || 0);
  bindNum('stCorr', () => S.status.corrosive, v => S.status.corrosive = +v || 0);
  bindNum('stMag', () => S.status.magnetic, v => S.status.magnetic = +v || 0);
  bindChk('stHeat', () => S.status.heat, v => S.status.heat = v);
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
}

function renderEnemySegs() {
  segmented($('partSeg'), [['body', 'Тело'], ['head', 'Голова']], S.part, v => { S.part = v; update(); });
  segmented($('critSeg'), [['none', 'Без крита'], ['avg', 'Средний'], ['crit', 'Крит']], S.crit, v => { S.crit = v; update(); });
  const e = currentEnemy();
  $('enemyPick').replaceChildren(h('b', {}, e.ru || e.name), h('small', {}, `${e.faction || '—'}`));
}

// ---------- расчёт и результат ----------
function buildInput() {
  const w = currentWeapon();
  const mods = [...S.mods, S.exilus].filter(Boolean).map(s => ({ item: modById(s.id), rank: s.rank })).filter(m => m.item);
  const buffs = [];
  if (S.customMult && S.customMult !== 1) buffs.push({ name: 'Свой множитель', effects: [{ stat: 'final_mult', value: S.customMult, bucket: 'final_mult' }] });
  if (S.customStatus) buffs.push({ name: 'Свой бонус к урону статусов', effects: [{ stat: 'status_damage', value: S.customStatus / 100, bucket: 'status_damage' }] });
  const extraHits = S.oraxia.on ? [{ name: 'Шёлковая поступь', pct: (S.oraxia.wall ? 0.8 : 0.4) * S.oraxia.strength / 100, type: 'Toxin', statusChance: 1, ability: true }] : [];
  const build = {
    weapon: w, attack: S.attack, slot: S.cat, mods, buffs, extraHits, stacks: S.stacks, flags: S.flags,
    arcanes: S.arcane && arcById(S.arcane.id) ? [{ item: arcById(S.arcane.id), rank: S.arcane.rank }] : [],
    statusTypes: S.statusTypes || undefined,
  };
  const st = S.status;
  const target = {
    enemy: currentEnemy(), level: S.level, armorStrip: S.armorStrip / 100,
    drOverride: S.drOverride === '' || S.drOverride == null ? undefined : Math.max(0, Math.min(100, +S.drOverride)) / 100,
    status: { viral: st.viral, corrosive: st.corrosive, magnetic: st.magnetic, heat: st.heat },
  };
  return { build, target };
}

function tile(label, value, note, main) {
  return h('div', { class: 'tile' + (main ? ' main' : '') }, h('span', {}, label), h('strong', {}, value), note ? h('em', {}, note) : null);
}
function table(head, rows) {
  return h('div', { class: 'tbl' }, h('table', {}, h('thead', {}, h('tr', {}, head.map(x => h('th', {}, x)))),
    h('tbody', {}, rows.map(r => h('tr', {}, r.map((c, i) => h('td', { class: i ? 'n' : '' }, c)))))));
}

function renderResult() {
  const { build, target } = buildInput();
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
  $('mini').replaceChildren(...mini, h('span', {}, '↓'));
  $('res').replaceChildren(
    h('div', { class: 'tiles' }, tiles),
    h('h3', { class: 'lbl', style: 'margin:14px 0 6px' }, 'Оружие с модами'), table(['Стат', 'Значение'], statRows),
    h('h3', { class: 'lbl', style: 'margin:14px 0 6px' }, `Урон по типам (${where}, ${S.crit === 'avg' ? 'средний крит' : S.crit === 'crit' ? 'крит' : 'без крита'})`),
    table(['Тип', 'На оружии', 'Фракция', 'По здоровью'], typeRows),
    h('h3', { class: 'lbl', style: 'margin:14px 0 6px' }, 'Уровни крита'), table(['Уровень', 'Множитель', `Удар ${where}`], critRows),
    procRows.length ? h('h3', { class: 'lbl', style: 'margin:14px 0 6px' }, `Статусы за выстрел и тики (${DOT_TICKS} тиков)`) : null,
    procRows.length ? table(['Статус', 'Процов', 'Тик', 'За статус'], procRows) : null,
    h('details', { style: 'margin-top:12px' }, h('summary', {}, 'Разбор формулы'),
      h('div', { class: 'steps' }, r.steps.map(s => h('div', { class: 'step' }, h('b', {}, s.label + ': ' + num(s.value, 3)), h('pre', {}, s.formula))))),
  );
}

function update(full = true) {
  if (full) { renderMods(); renderConds(); renderEnemySegs(); }
  renderResult();
  save();
}
function renderAll() { renderWeapon(); update(); }

$('mini').addEventListener('click', () => $('resCard').scrollIntoView({ behavior: 'smooth' }));

// ---------- старт ----------
async function start() {
  try {
    [D.enemies, D.scaling, D.damage] = await Promise.all([load('data/enemies.json'), load('data/manual/scaling.json'), load('data/damage.json')]);
    await ensureCategory();
  } catch (err) {
    $('res').replaceChildren(h('p', { class: 'warn' }, 'Не удалось загрузить данные: ' + err.message));
    return;
  }
  bindInputs();
  renderAll();
  load('data/meta.json').then(m => {
    const c = m.counts || {};
    $('dataMeta').prepend(`Версия данных: WFCD ${m.wfcd?.tag || '—'} (${m.wfcd?.date || '—'}), сборка ${m.built}. Оружия ${c.weapons}, модов ${c.mods}, мистификаторов ${c.arcanes}, врагов ${c.enemies}. `, h('br'));
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
