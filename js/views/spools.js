// Склад филаментов: катушки, журнал движений, взвешивание.
import * as C from '../calc.js';
import { store, today, addSpools, weighSpool, closeSpool, spoolLabel, modelName } from '../store.js';
import { ctx, esc, money, money0, grams, nf, dateShort, dateText, icon, chip, swatch, pageHead, emptyBox, field, numInput, selectEl, openModal, closeModal, modalHead, toast } from '../ui.js';

const STATUS = {
  new: { label: 'Новая', bg: '#E8EBFC', fg: '#3C4DC4' },
  open: { label: 'Открыта', bg: '#E4F6EC', fg: '#1F7A4D' },
  low: { label: 'Заканчивается', bg: '#FDECEA', fg: '#B23A2F' },
  empty: { label: 'Закончилась', bg: '#F3F5FB', fg: '#6B7490' },
};
const MOVE = { purchase: 'Покупка', print: 'Печать', failure: 'Брак', adjust: 'Корректировка', writeoff: 'Списание', reverse: 'Сторно', initial: 'До начала учёта' };
const MATERIALS = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'PA', 'PC', 'PVA', 'Другое'];

export function renderSpools(state, route) {
  const showEmpty = route.query.all === '1';
  const rows = state.spools.map((s) => {
    const st = C.spoolStats(s, state.movements);
    return { s, st, status: C.spoolStatus(s, st, state.settings.lowStockG) };
  });
  const active = rows.filter((r) => showEmpty || r.status !== 'empty');
  const value = rows.reduce((a, r) => a + r.st.value, 0);
  const emptyCount = rows.length - rows.filter((r) => r.status !== 'empty').length;
  return `
  ${pageHead('Филаменты', `${rows.length - emptyCount} в наличии · остатки на ${money0(value)}`, '<button class="btn primary" data-act="spool-add">' + icon.plus(18) + ' Добавить катушки</button>')}
  ${active.length ? `<div class="spool-grid">${active.sort((a, b) => order(a.status) - order(b.status)).map(({ s, st, status }) => `
    <a class="spool-card ${status === 'empty' ? 'dim' : ''}" href="#/spool/${s.id}">
      <span class="row-between">${swatch(s.hex, 44)}${chip(STATUS[status].label, STATUS[status])}</span>
      <span><b class="h3">${esc(s.colorName || s.material)}</b><br><small class="muted">${esc(s.material)}${s.brand ? ' · ' + esc(s.brand) : ''} · ${nf(s.costPerG)} ₽/г</small></span>
      <span class="bar"><i style="width:${Math.max(0, Math.min(100, (st.left / s.netG) * 100))}%;background:${status === 'low' ? '#B23A2F' : '#4F62E0'}"></i></span>
      <b class="small">${grams(st.left)} из ${grams(s.netG)} · ${money0(st.value)}</b>
    </a>`).join('')}</div>` : emptyBox('Добавьте катушки, которые есть у вас дома: для уже начатых укажите примерный остаток.', '<button class="btn primary" data-act="spool-add">Добавить катушки</button>')}
  ${emptyCount ? `<a class="link" href="#/spools${showEmpty ? '' : '?all=1'}">${showEmpty ? 'Скрыть закончившиеся' : `Показать закончившиеся (${emptyCount})`}</a>` : ''}`;
}
const order = (st) => ({ low: 0, open: 1, new: 2, empty: 3 }[st]);

export function renderSpool(state, route) {
  const s = state.spools.find((x) => x.id === route.id);
  if (!s) return emptyBox('Катушка не найдена.', '<a class="btn soft" href="#/spools">К складу</a>');
  const st = C.spoolStats(s, state.movements);
  const status = C.spoolStatus(s, st, state.settings.lowStockG);
  const moves = state.movements.filter((m) => m.spoolId === s.id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const parts = [['печати', st.printed], ['брак', st.failed], ['корректировки', st.adjusted], ['списано', st.writtenOff], ['до учёта', -C.round2(moves.filter((m) => m.type === 'initial').reduce((a, m) => a + m.grams, 0))], ['сторно', -st.reversed]].filter(([, v]) => v);
  return `
  <div class="page-head"><div class="stack-8"><a class="back" href="#/spools">${icon.back(16)} Филаменты</a>
    <div class="row gap12">${swatch(s.hex, 52)}<div><h1>${esc(s.colorName || s.material)}</h1><div class="muted">${esc(s.material)}${s.brand ? ' · ' + esc(s.brand) : ''} · ${nf(s.costPerG)} ₽/г</div></div></div></div>
    ${chip(STATUS[status].label, STATUS[status])}</div>
  <div class="detail-grid">
    <div class="stack-20" style="min-width:0">
      <div class="tiles">
        <div class="tile"><span>Куплено</span><b>${grams(st.bought)}</b><small>${money(s.price)}${s.delivery ? ` + доставка ${money(s.delivery)}` : ''}</small></div>
        <div class="tile sand"><span>Потрачено</span><b>${grams(st.used)}</b><small>${parts.map(([l, v]) => `${l} ${nf(v, 0)} г`).join(' · ') || '—'}</small></div>
        <div class="tile mint"><span>Остаток</span><b>${grams(st.left)}</b><small>на ${money(st.value)}</small></div>
      </div>
      <div class="card flush">
        <div class="h3 pad">Движения</div>
        ${moves.map((m) => `<${m.printId ? `a href="#/print/${m.printId}"` : 'div'} class="move-row">
          <span class="muted">${dateShort(m.date)}</span>
          <span class="grow"><b>${MOVE[m.type] || m.type}</b><small class="muted">${esc(m.comment || '')}</small></span>
          <b class="${m.grams > 0 ? 'pos' : ''}">${m.grams > 0 ? '+' : '−'}${grams(Math.abs(m.grams))}</b>
        </${m.printId ? 'a' : 'div'}>`).join('')}
      </div>
    </div>
    <div class="stack-20">
      <form class="card stack-12" data-form="weigh" data-id="${s.id}">
        <div class="h3">${icon.scale(18)} Взвесить катушку</div>
        ${s.tareG ? `${field('Показание весов, г', numInput('reading', '', 'placeholder="катушка с пластиком"'), `Вес пустой катушки ${nf(s.tareG)} г вычтется автоматически`)}
          <button class="btn soft" type="submit">Сверить остаток</button>`
          : `<p class="muted small">Чтобы взвешивать, укажите вес пустой катушки — приложение не подставляет его само.</p>${field('Вес пустой катушки, г', numInput('tareG', '', 'placeholder="например, 250"'))}<button class="btn soft" type="submit">Сохранить</button>`}
      </form>
      <div class="card stack-8">
        <div class="h3">О катушке</div>
        <div class="kv"><span>Куплена</span><b>${dateText(s.date)}${s.shop ? ' · ' + esc(s.shop) : ''}</b></div>
        ${s.location ? `<div class="kv"><span>Где лежит</span><b>${esc(s.location)}</b></div>` : ''}
        ${s.batch ? `<div class="kv"><span>Партия</span><b>${esc(s.batch)}</b></div>` : ''}
        ${s.notes ? `<div class="kv"><span>Заметки</span><b>${esc(s.notes)}</b></div>` : ''}
        <div class="kv"><span>Цена грамма</span><b>(${nf(s.price)} + ${nf(s.delivery || 0)}) ÷ ${nf(s.netG)} г = ${nf(s.costPerG, 4)} ₽</b></div>
      </div>
      <button class="btn soft" data-act="spool-again" data-id="${s.id}">${icon.plus(16)} Купила ещё такую же</button>
      ${!s.closed ? `<button class="btn ghost" data-act="spool-close" data-id="${s.id}">Катушка закончилась</button>` : ''}
    </div>
  </div>`;
}

export function openSpoolForm(state, base = {}) {
  openModal(`${modalHead(base.id ? 'Ещё такая же катушка' : 'Добавить катушки')}
  <form data-form="spool-add" class="stack-12">
    <div class="grid2">
      ${field('Материал', selectEl('material', MATERIALS.map((m) => [m, m]), base.material || 'PLA'))}
      ${field('Производитель', `<input name="brand" value="${esc(base.brand || '')}" placeholder="Bambu, eSun…">`)}
    </div>
    <div class="grid2">
      ${field('Цвет', `<input name="colorName" value="${esc(base.colorName || '')}" placeholder="Белый" required>`)}
      ${field('Оттенок', `<input type="color" name="hex" value="${esc(base.hex || '#f4f4f2')}">`)}
    </div>
    <div class="grid3">
      ${field('Цена 1 катушки, ₽', numInput('price', base.price ?? '', 'required'))}
      ${field('Сколько штук', numInput('count', '1', 'inputmode="numeric"'))}
      ${field('Доставка за всё, ₽', numInput('delivery', '', 'placeholder="0"'))}
    </div>
    <div class="grid3">
      ${field('Пластика в катушке, г', numInput('netG', base.netG || 1000))}
      ${field('Пустая катушка, г', numInput('tareG', base.tareG || '', 'placeholder="если знаете"'))}
      ${field('Дата покупки', `<input type="date" name="date" value="${today()}">`)}
    </div>
    <div class="grid2">
      ${field('Магазин', `<input name="shop" value="${esc(base.shop || '')}">`)}
      ${field('Где хранится', `<input name="location" value="${esc(base.location || '')}" placeholder="сушильный бокс…">`)}
    </div>
    ${base.id ? '' : field('Катушка уже начата? Остаток, г', numInput('left', '', 'placeholder="оставьте пустым для новой"'), 'Для катушек, купленных до начала учёта. Израсходованное раньше не попадёт ни в печати, ни в потери.')}
    <button class="btn primary big" type="submit">Добавить на склад</button>
    <p class="muted tiny">Покупка сразу появится в журнале покупок. Цена грамма = (цена + доля доставки) ÷ вес пластика.</p>
  </form>`);
}

export const spoolActions = {
  'spool-add': () => openSpoolForm(store.state),
  'spool-again': (el) => openSpoolForm(store.state, store.state.spools.find((s) => s.id === el.dataset.id)),
  'spool-close': (el) => {
    if (!confirm('Отметить катушку как закончившуюся? Остаток (если есть) спишется отдельной записью.')) return;
    store.commit((s) => closeSpool(s, el.dataset.id));
    toast('Катушка закрыта');
  },
};

export const spoolForms = {
  'spool-add': (form, f) => {
    if (!(C.num(f.price) > 0)) return toast('Укажите цену катушки', 'err');
    const created = store.commit((s) => addSpools(s, f));
    closeModal();
    toast(created.length > 1 ? `Добавлено катушек: ${created.length}` : 'Катушка добавлена');
    ctx.go(`#/spool/${created[0].id}`);
  },
  weigh: (form, f) => {
    const id = form.dataset.id;
    if (f.tareG !== undefined) {
      store.commit((s) => { s.spools.find((x) => x.id === id).tareG = C.num(f.tareG) || null; });
      return toast('Вес пустой катушки сохранён');
    }
    try {
      const diff = store.commit((s) => weighSpool(s, id, f.reading));
      toast(diff === 0 ? 'Остаток совпал с журналом' : `Остаток поправлен на ${diff > 0 ? '+' : '−'}${grams(Math.abs(diff))}`, diff === 0 ? 'ok' : 'warn');
    } catch (e) { toast(e.message, 'err'); }
  },
};
