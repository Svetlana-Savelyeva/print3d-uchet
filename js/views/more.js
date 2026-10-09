// «Ещё»: оборудование, расходники, покупки, настройки, резервная копия, первый запуск.
import * as C from '../calc.js';
import { store, today, emptyState, addEquipment, updateEquipment, addConsumable, retireConsumable, addPurchase, photos, modelName, spoolLabel } from '../store.js';
import { buildDemo } from '../demo.js';
import { getConfig } from '../sync.js';
import { ctx, esc, money, money0, nf, dateText, dateShort, icon, chip, GROUP_STYLE, pageHead, emptyBox, field, numInput, selectEl, openModal, closeModal, modalHead, toast } from '../ui.js';

export function renderMore(state) {
  const tile = (href, ic, title, sub) => `<a class="more-tile" href="${href}"><span class="ico-badge blue">${ic}</span><span><b>${title}</b><small class="muted">${sub}</small></span></a>`;
  const pb = C.payback(state);
  return `${pageHead('Ещё', '')}
  <div class="more-grid">
    ${tile('#/equipment', icon.printer(20), 'Оборудование', `${state.equipment.length} шт. · амортизация`)}
    ${tile('#/consumables', icon.box(20), 'Расходники', 'сопла, клей, силикагель')}
    ${tile('#/purchases', icon.receipt(20), 'Покупки', `всего вложено ${money0(state.purchases.reduce((a, p) => a + p.amount, 0))}`)}
    ${tile('#/sync', icon.repeat(20), 'Синхронизация', getConfig() ? 'телефон и компьютер — общие данные' : 'включить общие данные для телефона и компьютера')}
    ${tile('#/settings', icon.gear(20), 'Настройки', 'тариф, мощность, комиссия')}
    ${tile('#/backup', icon.download(20), 'Резервная копия', 'сохранить, восстановить, Excel')}
  </div>
  <p class="muted small">Окупаемость: вложено ${money0(pb.invested)}, вернулось ${money0(pb.effect)}.</p>`;
}

// ---------- Оборудование ----------
export function renderEquipment(state) {
  return `${pageHead('Оборудование', 'Принтеры, AMS, сушилки — всё, что изнашивается', '<button class="btn primary" data-act="eq-add">' + icon.plus(18) + ' Добавить</button>')}
  ${state.equipment.length ? `<div class="stack-12">${state.equipment.map((e) => {
    const hrs = C.equipmentHours(e, state.prints);
    const acc = C.chargeAccrued(e.id, state.prints);
    const base = C.amortBase(e);
    const rate = C.amortRate(e);
    const pct = base > 0 ? Math.min(100, (acc / base) * 100) : 0;
    return `<div class="card stack-12">
      <div class="row-between wrap"><div class="row gap12"><span class="ico-badge blue">${icon.printer(20)}</span><div><b class="h3">${esc(e.name)}</b><div class="muted small">${e.type === 'printer' ? 'Принтер' : e.type === 'addon' ? 'Дополнение к принтеру' : 'Оборудование'} · куплено ${dateText(e.date)} · ${money0(e.price + e.extra)}</div></div></div>
      <button class="btn ghost small" data-act="eq-edit" data-id="${e.id}">Изменить</button></div>
      <div class="tiles">
        <div class="tile"><span>Отработано</span><b>${nf(hrs, 1)} ч</b><small>${e.resourceHours ? `ресурс ${nf(e.resourceHours, 0)} ч` : 'ресурс не задан'}</small></div>
        <div class="tile"><span>Амортизация за час</span><b>${rate ? money(rate) : '—'}</b><small>${e.includeInCost ? (e.resourceHours ? `(${money0(e.price)} + ${money0(e.extra)} − ${money0(e.residual)}) ÷ ${nf(e.resourceHours, 0)} ч` : 'задайте ресурс в часах') : 'не включается в себестоимость'}</small></div>
        <div class="tile"><span>Начислено</span><b>${money0(acc)}</b><small>${base ? `${nf(pct, 1)} % стоимости` : ''}</small></div>
      </div>
      ${base ? `<div class="bar"><i style="width:${pct}%;background:#4F62E0"></i></div>` : ''}
    </div>`;
  }).join('')}</div>` : emptyBox('Добавьте принтер: от него считаются амортизация и окупаемость.', '<button class="btn primary" data-act="eq-add">Добавить принтер</button>')}`;
}

function equipmentForm(state, e = null) {
  const ps = state.equipment.filter((x) => x.type === 'printer' && x.id !== e?.id);
  return `${modalHead(e ? e.name : 'Новое оборудование')}
  <form data-form="${e ? 'eq-edit' : 'eq-add'}" ${e ? `data-id="${e.id}"` : ''} class="stack-12">
    ${e ? '' : `<div class="grid2">
      ${field('Название', '<input name="name" required placeholder="Bambu Lab P1S">')}
      ${field('Тип', selectEl('type', [['printer', 'Принтер'], ['addon', 'Дополнение к принтеру (AMS)'], ['other', 'Другое оборудование']], 'printer'))}
    </div>
    <div class="grid3">
      ${field('Стоимость, ₽', numInput('price', '', 'required'))}
      ${field('Доп. расходы при покупке, ₽', numInput('extra', '', 'placeholder="доставка, настройка"'))}
      ${field('Дата покупки', `<input type="date" name="date" value="${today()}">`)}
    </div>`}
    ${e ? field('Название', `<input name="name" value="${esc(e.name)}">`) : ''}
    <div class="grid3">
      ${field('Плановый ресурс, ч', numInput('resourceHours', e?.resourceHours || '', 'placeholder="ваша оценка"'), 'Сколько часов вы рассчитываете на нём печатать')}
      ${field('Отработано до учёта, ч', numInput('initialHours', e?.initialHours || '', 'placeholder="0"'))}
      ${field('Остаточная стоимость, ₽', numInput('residual', e?.residual || '', 'placeholder="0"'), 'за сколько продадите в конце')}
    </div>
    <div class="grid2">
      ${field('Средняя мощность, Вт', numInput('watts', e?.watts || '', `placeholder="${state.settings.printerW}"`), 'для принтера — для расчёта электричества')}
      ${field('Учитывать амортизацию в себестоимости', selectEl('includeInCost', [['yes', 'Да'], ['no', 'Нет']], e ? (e.includeInCost ? 'yes' : 'no') : 'yes'))}
    </div>
    ${ps.length ? field('Работает вместе с принтером', selectEl('attachTo', [['', '— нет —'], ...ps.map((p) => [p.id, p.name])], e?.attachTo || ''), 'Для AMS: амортизация начисляется в печатях этого принтера') : ''}
    ${e ? field('Статус', selectEl('status', [['active', 'В работе'], ['retired', 'Продан / списан']], e.status)) : ''}
    <button class="btn primary big" type="submit">Сохранить</button>
    <p class="muted tiny">${e ? 'Изменения влияют только на будущие печати — прошлые сохраняют свои ставки.' : 'Покупка сразу попадёт в журнал покупок как инвестиция.'}</p>
  </form>`;
}

// ---------- Расходники ----------
const MODE_LABEL = { hour: 'по часам печати', print: 'за каждую печать', money: 'только деньги' };
export function renderConsumables(state) {
  const list = [...state.consumables].sort((a, b) => (a.activeTo ? 1 : 0) - (b.activeTo ? 1 : 0));
  return `${pageHead('Расходники', 'Сопла, пластины, клей, силикагель', '<button class="btn primary" data-act="cons-add">' + icon.plus(18) + ' Добавить</button>')}
  <div class="note">В себестоимость попадает только то, у чего задана ставка: «по часам» или «за печать». Мелочь лучше учитывать «только деньгами» — она видна в покупках, но не размазывается по изделиям.</div>
  ${list.length ? `<div class="stack-12">${list.map((c) => {
    const rate = C.consumableRate(c);
    const acc = C.chargeAccrued(c.id, state.prints);
    return `<div class="card row-between wrap ${c.activeTo ? 'dim' : ''}">
      <div><b class="h3">${esc(c.name)}</b><div class="muted small">${money(c.price)} · ${MODE_LABEL[c.mode]}${rate ? ` · ${money(rate)} ${c.mode === 'hour' ? '/ч' : '/печать'}` : ''} · с ${dateShort(c.activeFrom)}${c.activeTo ? ` по ${dateShort(c.activeTo)}` : ''}</div>
      ${c.mode !== 'money' ? `<div class="small">Начислено в печати: <b>${money(acc)}</b>${c.price > acc && c.activeTo ? ` · не распределено ${money(c.price - acc)}` : ''}</div>` : ''}</div>
      ${!c.activeTo && c.mode !== 'money' ? `<button class="btn ghost small" data-act="cons-retire" data-id="${c.id}">Заменён / снят</button>` : ''}
    </div>`;
  }).join('')}</div>` : emptyBox('Расходников пока нет.')}`;
}

function consumableForm() {
  return `${modalHead('Новый расходник')}
  <form data-form="cons-add" class="stack-12">
    <div class="grid2">
      ${field('Название', '<input name="name" required placeholder="Сопло 0,4 мм">')}
      ${field('Категория', selectEl('category', [['consumable', 'Расходники'], ['parts', 'Запасные части'], ['glue', 'Клей'], ['silica', 'Силикагель'], ['cleaning', 'Средства для очистки'], ['packaging', 'Упаковка']], 'consumable'))}
    </div>
    <div class="grid3">
      ${field('Цена, ₽', numInput('price', '', 'required'))}
      ${field('Как учитывать', selectEl('mode', [['money', 'Только деньги'], ['hour', 'По часам печати'], ['print', 'За каждую печать']], 'money'))}
      ${field('Срок службы', numInput('life', '', 'placeholder="часов или печатей"'), 'для «по часам» и «за печать»')}
    </div>
    ${field('Дата покупки / установки', `<input type="date" name="date" value="${today()}">`)}
    <button class="btn primary big" type="submit">Добавить</button>
  </form>`;
}

// ---------- Покупки ----------
export function renderPurchases(state) {
  const total = state.purchases.reduce((a, p) => a + p.amount, 0);
  const byKind = {};
  for (const p of state.purchases) byKind[p.kind] = (byKind[p.kind] || 0) + p.amount;
  const list = [...state.purchases].sort((a, b) => (a.date < b.date ? 1 : -1));
  return `${pageHead('Покупки', 'Все деньги, потраченные на 3D-печать', '<button class="btn primary" data-act="pur-add">' + icon.plus(18) + ' Покупка</button>')}
  <div class="card stack-12">
    <div class="row-between wrap"><div><div class="eyebrow" style="color:#2F8BA8">С самого начала</div><div class="h2">Всего потрачено на 3D-печать</div></div><b class="big">${money0(total)}</b></div>
    <div class="tiles">${Object.entries(C.MONEY_KIND_LABELS).filter(([k]) => byKind[k]).map(([k, l]) => `<div class="tile"><span>${l}</span><b>${money0(byKind[k])}</b></div>`).join('')}</div>
  </div>
  <div class="note">Филамент добавляйте через «Филаменты», принтер — через «Оборудование»: покупка запишется сама, без двойного ввода.</div>
  ${list.length ? `<div class="card flush">${list.map((p) => `<div class="move-row">
    <span class="muted">${dateShort(p.date)}</span>
    <span class="grow"><b>${esc(p.name)}</b><small class="muted">${esc(C.PURCHASE_CATEGORIES[p.category]?.label || '')} · ${esc(C.MONEY_KIND_LABELS[p.kind])}${p.shop ? ' · ' + esc(p.shop) : ''}</small></span>
    <b>${money(p.amount)}</b>
    ${!p.link ? `<button class="icon-btn" data-act="pur-del" data-id="${p.id}" aria-label="Удалить покупку">${icon.trash(15)}</button>` : ''}
  </div>`).join('')}</div>` : emptyBox('Покупок пока нет.')}`;
}

function purchaseForm() {
  const cats = Object.entries(C.PURCHASE_CATEGORIES).filter(([k]) => k !== 'filament' && k !== 'equipment').map(([k, v]) => [k, v.label]);
  return `${modalHead('Новая покупка')}
  <form data-form="pur-add" class="stack-12">
    ${field('Что купили', '<input name="name" required placeholder="Весы, шпатель, бокорезы">')}
    <div class="grid3">
      ${field('Категория', selectEl('category', cats, 'tools'))}
      ${field('Сумма, ₽', numInput('amount', '', 'required'))}
      ${field('Дата', `<input type="date" name="date" value="${today()}">`)}
    </div>
    <div class="grid2">
      ${field('Магазин', '<input name="shop">')}
      ${field('Комментарий', '<input name="comment">')}
    </div>
    <button class="btn primary big" type="submit">Сохранить</button>
    <p class="muted tiny">Инструменты и оснащение входят во «вложено» для окупаемости, но не в себестоимость изделий. Сопла и другие расходники с распределением добавляйте в «Расходники».</p>
  </form>`;
}

// ---------- Настройки ----------
export function renderSettings(state) {
  const s = state.settings;
  return `${pageHead('Настройки', '')}
  <form class="card stack-12" data-form="settings">
    <div class="h3">Электричество</div>
    <div class="grid3">
      ${field('Тариф, ₽ за кВт·ч', numInput('tariff', s.tariff))}
      ${field('Средняя мощность принтера, Вт', numInput('printerW', s.printerW), 'если у принтера не задана своя')}
      ${field('Доп. оборудование во время печати, Вт', numInput('extraW', s.extraW), 'например, сушилка')}
    </div>
    <div class="h3">Продажи</div>
    <div class="grid3">
      ${field('Комиссия маркетплейса, %', numInput('mpFee', s.mpFee))}
      ${field('Упаковка, ₽ за шт.', numInput('packCost', s.packCost))}
      ${field('Валюта', `<input name="currency" value="${esc(s.currency)}">`)}
    </div>
    <div class="h3">Склад</div>
    ${field('Предупреждать, когда остаток меньше, г', numInput('lowStockG', s.lowStockG))}
    <button class="btn primary" type="submit">Сохранить</button>
    <p class="muted tiny">Новые значения применяются к будущим печатям. Завершённые печати сохраняют свою себестоимость.</p>
  </form>
  <form class="card stack-12" data-form="purposes">
    <div class="h3">Назначения</div>
    <p class="muted small">Названия можно менять. Группа определяет, как назначение попадает в аналитику.</p>
    ${state.purposes.map((p) => `<div class="grid2">${field(C.PURPOSE_GROUPS[p.group], `<input name="p_${p.id}" value="${esc(p.name)}">`)}</div>`).join('')}
    <button class="btn soft" type="submit">Сохранить названия</button>
  </form>`;
}

// ---------- Резервная копия ----------
export function renderBackup(state) {
  return `${pageHead('Резервная копия', 'Все данные хранятся в этом браузере — сохраняйте копию')}
  <div class="card stack-12">
    <div class="h3">Полная копия</div>
    <p class="muted small">Один файл со всеми записями и фотографиями. Им же можно перенести данные на телефон или другой компьютер.</p>
    <div class="row wrap gap10">
      <button class="btn primary" data-act="backup-save">${icon.download(18)} Скачать копию</button>
      <label class="btn soft">${icon.upload(18)} Восстановить из файла<input type="file" accept=".json,application/json" data-act-change="backup-load" hidden></label>
    </div>
  </div>
  <div class="card stack-12">
    <div class="h3">Таблицы для Excel</div>
    <div class="row wrap gap10">
      <button class="btn soft" data-act="csv" data-v="prints">Печати</button>
      <button class="btn soft" data-act="csv" data-v="spools">Склад</button>
      <button class="btn soft" data-act="csv" data-v="purchases">Покупки</button>
      <button class="btn soft" data-act="csv" data-v="sales">Продажи</button>
    </div>
  </div>
  <div class="card stack-12">
    <div class="h3">${state.demo ? 'Сейчас открыты демо-данные' : 'Начать заново'}</div>
    <div class="row wrap gap10">
      <button class="btn ${state.demo ? 'primary' : 'danger-soft'}" data-act="reset-empty">${state.demo ? 'Очистить и начать своё' : 'Удалить все данные'}</button>
      ${state.demo ? '' : '<button class="btn ghost" data-act="reset-demo">Открыть демо-данные</button>'}
    </div>
    ${state.demo ? '' : '<p class="muted tiny">Перед удалением скачайте копию — восстановить без неё не получится.</p>'}
  </div>`;
}

// ---------- Первый запуск ----------
export function renderSetup(state) {
  return `<div class="setup">
    <div class="card stack-16">
      <h1>Учёт 3D-печати</h1>
      <p class="muted">Себестоимость каждой печати, склад филамента, продажи и окупаемость принтера. Данные хранятся в этом браузере.</p>
      <button class="btn soft big" data-act="reset-demo">Сначала посмотреть на демо-данных</button>
      <a class="btn ghost big" href="#/sync">Уже веду учёт на другом устройстве — подключить синхронизацию</a>
    </div>
    <form class="card stack-12" data-form="setup">
      <div class="h2">Или начать со своих данных</div>
      ${field('Тариф на электричество, ₽ за кВт·ч', numInput('tariff', state.settings.tariff))}
      <div class="h3">Ваш принтер</div>
      <div class="grid2">
        ${field('Название', '<input name="name" required placeholder="Bambu Lab P1S">')}
        ${field('Стоимость с доставкой, ₽', numInput('price', '', 'required'))}
      </div>
      <div class="grid3">
        ${field('Дата покупки', `<input type="date" name="date" value="${today()}">`)}
        ${field('Плановый ресурс, ч', numInput('resourceHours', '', 'required placeholder="ваша оценка"'), 'на сколько часов печати рассчитываете')}
        ${field('Уже отработано, ч', numInput('initialHours', '', 'placeholder="0"'))}
      </div>
      ${field('Средняя мощность, Вт', numInput('watts', state.settings.printerW))}
      <button class="btn primary big" type="submit">Начать</button>
      <p class="muted tiny">Катушки, которые уже есть дома, добавите следующим шагом в «Филаментах».</p>
    </form>
  </div>`;
}

// ---------- CSV ----------
function csv(rows) {
  const cell = (v) => {
    const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}
function download(name, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function csvFor(state, kind) {
  const pName = (id) => state.purposes.find((p) => p.id === id)?.name || '';
  if (kind === 'prints') return [['Дата', 'Модель', 'Статус', 'Шт.', 'Годных', 'Назначение', 'Граммы', 'Часы', 'Материалы', 'Электричество', 'Доп. расходы', 'Прямая', 'Амортизация', 'Эксплуатационные', 'Полная', 'За 1 шт.', 'Брак, ₽'],
    ...state.prints.filter((p) => p.finalized).map((p) => [p.date, modelName(state, p.modelId), p.status, p.qty, p.split.good, (p.outputs || []).map((o) => `${pName(o.purposeId)} ${o.qty}`).join(', '), p.materials.reduce((a, m) => a + m.grams, 0), p.hours, p.totals.material, p.totals.electricity, p.totals.extra, p.totals.direct, p.totals.amortization, p.totals.ops, p.totals.full, p.split.unit, p.split.failCost])];
  if (kind === 'spools') return [['Катушка', 'Материал', 'Цвет', 'Куплено, г', 'Потрачено, г', 'Остаток, г', 'Цена грамма', 'Стоимость остатка', 'Дата покупки'],
    ...state.spools.map((s) => { const st = C.spoolStats(s, state.movements); return [spoolLabel(s), s.material, s.colorName, st.bought, st.used, st.left, C.round2(s.costPerG), st.value, s.date]; })];
  if (kind === 'purchases') return [['Дата', 'Название', 'Категория', 'Тип', 'Сумма', 'Магазин', 'Комментарий'],
    ...state.purchases.map((p) => [p.date, p.name, C.PURCHASE_CATEGORIES[p.category]?.label, C.MONEY_KIND_LABELS[p.kind], p.amount, p.shop, p.comment])];
  return [['Дата', 'Изделие', 'Шт.', 'Цена', 'Канал', 'Выручка', 'Комиссия', 'Упаковка', 'Себестоимость', 'Прибыль'],
    ...state.sales.map((s) => { const r = C.saleResult(s); return [s.date, modelName(state, s.modelId), s.qty, s.price, s.channel === 'mp' ? 'Маркетплейс' : 'Лично', r.revenue, r.fee, r.pack, r.cost, r.profit]; })];
}

const blobToDataUrl = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });

export const moreActions = {
  'eq-add': () => openModal(equipmentForm(store.state)),
  'eq-edit': (el) => openModal(equipmentForm(store.state, store.state.equipment.find((e) => e.id === el.dataset.id))),
  'cons-add': () => openModal(consumableForm()),
  'cons-retire': (el) => {
    if (!confirm('Отметить, что расходник заменён или снят? Начисления по нему прекратятся с сегодняшнего дня.')) return;
    store.commit((s) => retireConsumable(s, el.dataset.id));
  },
  'pur-add': () => openModal(purchaseForm()),
  'pur-del': (el) => {
    if (!confirm('Удалить покупку?')) return;
    store.commit((s) => { s.purchases = s.purchases.filter((p) => p.id !== el.dataset.id); });
  },
  csv: (el) => download(`3d-${el.dataset.v}-${today()}.csv`, csv(csvFor(store.state, el.dataset.v)), 'text/csv;charset=utf-8'),
  'backup-save': async () => {
    const ids = await photos.keys();
    const pics = {};
    for (const id of ids) pics[id] = await blobToDataUrl(await photos.get(id));
    download(`3d-uchet-${today()}.json`, JSON.stringify({ app: 'print3d-uchet', exportedAt: new Date().toISOString(), state: store.state, photos: pics }), 'application/json');
    toast('Копия скачана');
  },
  'reset-empty': async () => {
    const cloud = getConfig() ? ' Синхронизация включена: данные удалятся и в облаке, и на всех устройствах.' : '';
    const msg = (store.state.demo ? 'Удалить демо-данные и начать со своих?' : 'Удалить ВСЕ данные? Это нельзя отменить без резервной копии.') + cloud;
    if (!confirm(msg)) return;
    await photos.clear();
    await store.replace(emptyState());
    ctx.go('#/setup');
  },
  'reset-demo': async () => {
    if (getConfig()) return toast('Сначала отключите синхронизацию, чтобы демо-данные не попали в облако', 'err');
    if (store.state.setupDone && !store.state.demo && !confirm('Заменить ваши данные демо-данными? Сначала скачайте копию.')) return;
    await photos.clear();
    await store.replace(buildDemo());
    ctx.go('#/home');
    toast('Открыты демо-данные');
  },
};

export const moreChange = {
  'backup-load': async (input) => {
    const file = input.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'print3d-uchet' || !data.state) throw new Error('Это не файл копии этого приложения');
      if (!confirm(`Восстановить копию от ${dateText(data.exportedAt?.slice(0, 10))}? Текущие данные в этом браузере будут заменены.`)) return;
      await photos.clear();
      for (const [id, url] of Object.entries(data.photos || {})) await photos.put(id, await (await fetch(url)).blob());
      await store.replace(data.state);
      toast('Данные восстановлены');
      ctx.go('#/home');
    } catch (e) { toast('Не получилось: ' + e.message, 'err'); }
  },
};

export const moreForms = {
  'eq-add': (form, f) => {
    store.commit((s) => addEquipment(s, f));
    closeModal();
    toast('Оборудование добавлено');
  },
  'eq-edit': (form, f) => {
    store.commit((s) => updateEquipment(s, form.dataset.id, f));
    closeModal();
    toast('Сохранено. Прошлые печати не пересчитываются');
  },
  'cons-add': (form, f) => {
    if ((f.mode === 'hour' || f.mode === 'print') && !(C.num(f.life) > 0)) return toast('Укажите срок службы', 'err');
    store.commit((s) => addConsumable(s, f));
    closeModal();
    toast('Расходник добавлен');
  },
  'pur-add': (form, f) => {
    store.commit((s) => addPurchase(s, f));
    closeModal();
    toast('Покупка сохранена');
  },
  settings: (form, f) => {
    store.commit((s) => {
      for (const k of ['tariff', 'printerW', 'extraW', 'mpFee', 'packCost', 'lowStockG']) s.settings[k] = C.num(f[k]);
      s.settings.currency = f.currency || '₽';
    });
    toast('Настройки сохранены');
  },
  purposes: (form, f) => {
    store.commit((s) => { for (const p of s.purposes) if (f[`p_${p.id}`]) p.name = f[`p_${p.id}`]; });
    toast('Названия сохранены');
  },
  setup: async (form, f) => {
    if (!(C.num(f.resourceHours) > 0)) return toast('Укажите плановый ресурс в часах', 'err');
    store.commit((s) => {
      s.settings.tariff = C.num(f.tariff);
      s.settings.printerW = C.num(f.watts) || s.settings.printerW;
      addEquipment(s, { ...f, type: 'printer', includeInCost: 'yes' });
      s.setupDone = true;
      s.demo = false;
    });
    toast('Готово! Теперь добавьте катушки');
    ctx.go('#/spools');
  },
};
