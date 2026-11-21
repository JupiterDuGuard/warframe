// Общие помощники интерфейса: создание элементов, окно выбора, переключатели, слоты модов.
export const $ = id => document.getElementById(id);

export const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : String(k));
  return e;
};

export const num = (x, d = 1) => Number.isFinite(x) ? x.toLocaleString('ru-RU', { maximumFractionDigits: d }) : '—';
export const pct = x => num(x * 100, 1) + '%';
export const ruName = x => x?.ru || x?.name || '';
export const textRu = x => ((x?.textRu?.length ? x.textRu : x?.text) || []).join(' · ').replace(/\\n/g, ' ');

// ---------- окно выбора ----------
let ctx = null;
export function openPicker({ items, label, sub, onPick, placeholder }) {
  ctx = { items, label, sub, onPick };
  $('sheetSearch').value = '';
  $('sheetSearch').placeholder = placeholder || 'Поиск';
  renderPicker();
  $('sheet').showModal();
  $('sheetSearch').focus();
}
function renderPicker() {
  const q = $('sheetSearch').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = $('sheetList');
  list.replaceChildren();
  let n = 0;
  for (const it of ctx.items) {
    const s = ctx.sub(it) || '';
    const text = (ctx.label(it) + ' ' + (it.name || '') + ' ' + s).toLowerCase();
    if (q.some(w => !text.includes(w))) continue;
    if (++n > 150) break;
    list.append(h('button', { type: 'button', class: 'opt', onclick: () => { $('sheet').close(); ctx.onPick(it); } },
      h('b', {}, ctx.label(it)), s ? h('span', {}, s) : null));
  }
  if (!n) list.append(h('p', { class: 'muted', style: 'padding:10px' }, 'Ничего не найдено'));
}
export function initPicker() {
  $('sheetSearch').addEventListener('input', renderPicker);
  $('sheetClose').addEventListener('click', () => $('sheet').close());
  $('sheet').addEventListener('click', e => { if (e.target === $('sheet')) $('sheet').close(); });
}

export function segmented(el, options, value, onChange) {
  el.replaceChildren(...options.map(([v, text]) => h('button', {
    type: 'button', 'aria-pressed': String(v === value), onclick: () => onChange(v),
  }, text)));
}

/**
 * Слот мода/мистификатора.
 * slot: { id, rank } | null; item — запись мода; tag — подпись в углу; onPick, onChange (после смены ранга/очистки), onClear
 */
// полярность слота: значок + выбор (Forma)
const POL_OPTS = [['', '·'], ['madurai', 'V'], ['vazarin', 'D'], ['naramon', '—'], ['zenurik', '='], ['unairu', 'R'], ['penjaga', 'Y'], ['umbra', 'U'], ['any', 'O']];
const POL_TITLE = { '': 'без полярности', madurai: 'Мадурай', vazarin: 'Вазарин', naramon: 'Нарамон', zenurik: 'Зенурик', unairu: 'Унайру', penjaga: 'Пенджага', umbra: 'Умбра', any: 'Любая' };
function polSelect(pol, onPol) {
  return h('select', { class: 'pol', 'aria-label': 'Полярность слота', title: 'Полярность слота: ' + POL_TITLE[pol || ''],
    onchange: e => onPol(e.target.value || null) },
  POL_OPTS.map(([v, t]) => h('option', { value: v, selected: (pol || '') === v, title: POL_TITLE[v] }, t)));
}

export function slotEl({ slot, item, tag, empty, cls = '', onPick, onChange, onClear, pol, onPol, cost }) {
  const head = h('span', { class: 'num' }, onPol ? polSelect(pol, onPol) : null,
    cost != null && item ? h('b', { class: 'cost' + (cost < 0 ? ' plus' : '') }, cost < 0 ? `+${-cost}` : `${cost}`) : null, tag);
  if (!item) {
    return h('div', { class: 'slot ' + cls }, head,
      h('button', { type: 'button', class: 'empty', onclick: onPick }, empty));
  }
  const max = item.maxRank ?? (item.ranks.length - 1);
  const setRank = d => { slot.rank = Math.max(0, Math.min(max, slot.rank + d)); onChange(); };
  return h('div', { class: 'slot filled ' + cls }, head,
    h('button', { type: 'button', class: 'name', onclick: onPick, title: textRu(item) }, ruName(item)),
    h('div', { class: 'rank' },
      h('button', { type: 'button', 'aria-label': 'Ранг ниже', onclick: () => setRank(-1) }, '−'),
      h('span', {}, `${slot.rank}/${max}`),
      h('button', { type: 'button', 'aria-label': 'Ранг выше', onclick: () => setRank(1) }, '+'),
      h('button', { type: 'button', class: 'x', 'aria-label': 'Убрать', onclick: onClear }, '×')));
}

export function tile(label, value, note, main) {
  return h('div', { class: 'tile' + (main ? ' main' : '') }, h('span', {}, label), h('strong', {}, value), note ? h('em', {}, note) : null);
}
export function table(head, rows) {
  return h('div', { class: 'tbl' }, h('table', {}, h('thead', {}, h('tr', {}, head.map(x => h('th', {}, x)))),
    h('tbody', {}, rows.map(r => h('tr', {}, r.map((c, i) => h('td', { class: i ? 'n' : '' }, c)))))));
}

const FLAG_RU = { aiming: 'Прицеливание', first_shot: 'Первый выстрел в магазине', invisible: 'Невидимость', blocking: 'Блок' };

/**
 * Панель условных эффектов: стаки/вкл для эффектов с триггером, флаги, число статусов.
 * sources: [{ key, item, rank }], state: { stacks, flags, statusTypes }, onChange
 */
export function condRows(sources, state, onChange, itemEffects) {
  const rows = [];
  const flags = new Set();
  let needStatus = false;
  for (const { key, item, rank } of sources) {
    if (!item) continue;
    const effs = itemEffects(item, rank).filter(e => e.condition);
    let maxStacks = 0, triggered = false;
    for (const e of effs) {
      const c = e.condition;
      for (const f of Object.keys(FLAG_RU)) if (c[f]) flags.add(f);
      if (c.per === 'status_type') needStatus = true;
      if (c.trigger || c.stacks || c.duration || c.chance) { triggered = true; maxStacks = Math.max(maxStacks, c.stacks || 1); }
    }
    if (!triggered) continue;
    const inp = maxStacks > 1
      ? h('input', { type: 'number', min: 0, max: maxStacks, step: 1, value: state.stacks[key] || 0, 'aria-label': 'Стаки',
          oninput: e => { state.stacks[key] = Math.max(0, Math.min(maxStacks, +e.target.value || 0)); onChange(); } })
      : h('input', { type: 'checkbox', checked: !!state.stacks[key], 'aria-label': 'Включено',
          onchange: e => { state.stacks[key] = e.target.checked ? 1 : 0; onChange(); } });
    rows.push(h('div', { class: 'cond' }, h('div', {}, h('b', {}, ruName(item)), h('div', { class: 'muted' }, textRu(item))), inp));
  }
  for (const f of flags) {
    rows.push(h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!state.flags[f], onchange: e => { state.flags[f] = e.target.checked; onChange(); } }), FLAG_RU[f]));
  }
  if (needStatus && 'statusTypes' in state) {
    rows.push(h('div', { class: 'cond' }, h('div', {}, h('b', {}, 'Разных статусов на цели'), h('div', { class: 'muted' }, 'Для Condition Overload и Galvanized; 0 — по статусам из панели противника')),
      h('input', { type: 'number', min: 0, max: 16, step: 1, value: state.statusTypes || 0, oninput: e => { state.statusTypes = +e.target.value || 0; onChange(); } })));
  }
  return rows;
}
