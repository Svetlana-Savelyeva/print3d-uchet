// Журнал печатей и карточка печати: расшифровка себестоимости, фото, цена и продажа.
import * as C from '../calc.js';
import { store, today, modelName, setOwnerPrice, deletePrint, recordSale, deleteSale, sellableQty, photos, spoolLabel, uid } from '../store.js';
import { ctx, esc, money, money0, grams, nf, hoursText, dateText, dateShort, icon, chip, purposeChip, STATUS, GROUP_STYLE, pageHead, emptyBox, field, numInput, toast, photoImg, compressImage } from '../ui.js';
import { printRow } from './home.js';
import { queuePhoto } from '../sync.js';
import { openFinishModal, openFailureModal } from './newprint.js';

const FILTERS = [['all', 'Все'], ['done', 'Успешные'], ['failed', 'Брак'], ['printing', 'Печатаются'], ['sellable', 'Можно продать']];

export function renderPrints(state, route) {
  const filter = route.query.filter || ctx.ui.printsFilter || 'all';
  const purpose = route.query.purpose || '';
  let list = [...state.prints].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  if (filter === 'done') list = list.filter((p) => p.status === 'done');
  if (filter === 'failed') list = list.filter((p) => p.status === 'failed' || p.status === 'partial');
  if (filter === 'printing') list = list.filter((p) => p.status === 'printing');
  if (filter === 'sellable') list = list.filter((p) => p.finalized && sellableQty(state, p.id) > 0);
  if (purpose) list = list.filter((p) => (p.outputs || [{ purposeId: p.purposeId }]).some((o) => o.purposeId === purpose));
  return `
  ${pageHead('Печати', `${state.prints.length} записей`, '<a class="btn primary" href="#/new">' + icon.plus(18) + ' Новая печать</a>')}
  <div class="row wrap gap8">
    ${FILTERS.map(([k, l]) => `<a class="seg-chip ${k === filter ? 'on' : ''}" href="#/prints?filter=${k}${purpose ? `&purpose=${purpose}` : ''}">${l}</a>`).join('')}
    <span class="grow"></span>
    <select class="mini-select" data-nav="purpose" aria-label="Назначение">
      <option value="">Все назначения</option>
      ${state.purposes.map((p) => `<option value="${p.id}" ${p.id === purpose ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
    </select>
  </div>
  ${filter === 'sellable' ? '<div class="note">Выберите печать — в её карточке есть цена и кнопка «Подтвердить продажу».</div>' : ''}
  ${list.length ? `<div class="card flush"><div class="table-scroll"><div class="ptable">
    <div class="pt-head with-del"><span>Дата</span><span>Изделие</span><span>Назначение</span><span>Статус</span><span class="right">Полная</span></div>
    ${list.map((p) => printRow(state, p, true)).join('')}
  </div></div></div>` : emptyBox('Здесь пока пусто.')}`;
}

export function renderPrint(state, route) {
  const p = state.prints.find((x) => x.id === route.id);
  if (!p) return emptyBox('Печать не найдена.', '<a class="btn soft" href="#/prints">К журналу</a>');
  const printer = state.equipment.find((e) => e.id === p.printerId);
  const st = STATUS[p.status] || STATUS.done;
  const name = modelName(state, p.modelId);
  const head = `
  <div class="page-head">
    <div class="stack-8">
      <a class="back" href="#/prints">${icon.back(16)} Печати</a>
      <h1>${esc(name)} · ${p.qty} шт.</h1>
      <div class="row wrap gap8">${chip(st.label, st)}${(p.outputs?.length ? p.outputs : [{ purposeId: p.purposeId }]).map((o) => purposeChip(state, o.purposeId)).join('')}${printer ? chip(printer.name, GROUP_STYLE.other) : ''}${chip(hoursText(p.hours), GROUP_STYLE.other)}${chip(dateText(p.date), GROUP_STYLE.other)}</div>
    </div>
    <div class="row gap8 wrap">
      <a class="btn soft" href="#/new?repeat=${p.id}">${icon.repeat(16)} Повторить</a>
      <a class="btn ghost" href="#/model/${p.modelId}">Модель</a>
    </div>
  </div>`;

  if (!p.finalized) {
    const g = p.materials.reduce((a, m) => a + C.num(m.grams), 0);
    return `${head}
    <div class="card stack-12">
      <div class="h2">Печать идёт</div>
      <div class="muted">План: ${grams(g)} материала, ${hoursText(p.hours)}. Склад ещё не тронут, себестоимость посчитается при завершении.</div>
      <div class="row wrap gap10">
        <button class="btn primary" data-act="finish-print" data-id="${p.id}">Печать завершена</button>
        <button class="btn danger-soft" data-act="fail-print" data-id="${p.id}">Брак</button>
        <button class="btn ghost" data-act="delete-print" data-id="${p.id}">Отменить печать</button>
      </div>
    </div>`;
  }

  const rows = [
    ...p.materials.map((m) => ({ label: C.ROLE_LABELS[m.role] || 'Материал', base: `${nf(m.grams)} г · ${esc(m.spoolName || '')}`, rate: `${nf(m.costPerG)} ₽/г`, amount: m.amount })),
    ...p.charges.filter((c) => c.kind === 'electricity' || c.kind === 'extra'),
    { label: 'Прямая себестоимость', amount: p.totals.direct, total: true },
    ...p.charges.filter((c) => c.kind === 'amortization' || c.kind === 'ops'),
    { label: 'Полная себестоимость', amount: p.totals.full, total: true },
  ];
  const sp = p.split;
  const sellable = sellableQty(state, p.id);
  const sales = state.sales.filter((s) => s.printId === p.id);
  const economy = (p.outputs || []).filter((o) => C.num(o.analogPrice) > 0).map((o) => ({ qty: o.qty, analog: o.analogPrice, save: C.round2((o.analogPrice - sp.unit) * o.qty) }));

  return `${head}
  <div class="detail-grid">
    <div class="stack-20" style="min-width:0">
      <div class="card flush">
        <div class="row-between wrap pad">
          <div class="h2">Как рассчитано</div>
          <span class="snap">${icon.lock(15)} Цены зафиксированы ${dateText(p.snapshot?.at?.slice(0, 10) || p.date)}</span>
        </div>
        <div class="table-scroll"><div class="btable">
          <div class="bt-head"><span>Строка</span><span>База</span><span class="right">Ставка</span><span class="right">Сумма</span></div>
          ${rows.map((r) => `<div class="bt-row ${r.total ? 'total' : ''}"><span>${esc(r.label)}</span><span class="muted">${r.base || ''}</span><span class="right muted">${r.rate || ''}</span><span class="right">${money(r.amount)}</span></div>`).join('')}
          <div class="bt-foot"><span class="muted">На 1 изделие: ${money(p.totals.full)} ÷ ${sp.qty} шт.</span><b class="accent">${money(sp.unit)}</b></div>
          ${ownerRows(p)}
          ${sp.bad ? `<div class="bt-foot fail"><span>Брак: ${sp.bad} шт.${p.failureReason ? ` · ${esc(p.failureReason)}` : ''}</span><b>${money(sp.failCost)}</b></div>
          ${sp.good ? `<div class="bt-foot"><span class="muted small">Справочно: с учётом брака одно годное изделие обошлось в ${money(sp.unitWithFailures)}</span></div>` : ''}` : ''}
        </div></div>
      </div>
      ${economy.length ? `<div class="card stack-8"><div class="h3">Экономия для бизнеса</div>${economy.map((e) => `<div class="money-row"><span>Готовый аналог ${money(e.analog)} × ${e.qty} шт. − себестоимость ${money(sp.unit)} × ${e.qty}</span><b class="${e.save < 0 ? 'neg' : 'pos'}">${money(e.save)}</b></div>`).join('')}</div>` : ''}
      ${p.comment ? `<div class="card"><div class="muted small">Комментарий</div>${esc(p.comment)}</div>` : ''}
    </div>

    <div class="stack-20">
      <div class="card stack-12">
        ${(p.photoIds || []).length ? `<div class="gallery">${p.photoIds.map((id) => photoImg(id, 'gal')).join('')}</div>` : ''}
        <label class="photo-drop">${icon.camera(28)}<span>${(p.photoIds || []).length ? 'Добавить ещё фото' : 'Добавить фото изделия'}</span><input type="file" accept="image/*" data-photo-for="print:${p.id}" hidden></label>
      </div>
      <div class="card stack-12">
        <div class="h3">Что изменилось</div>
        ${p.materials.map((m) => { const s = state.spools.find((x) => x.id === m.spoolId); return `<a class="spool-mini" href="#/spool/${m.spoolId}"><span class="swatch" style="width:30px;height:30px;background:${esc(s?.hex || '#ccc')}"></span><span class="grow"><b>${esc(s ? spoolLabel(s) : m.spoolName)}</b><small class="muted">${esc(C.ROLE_LABELS[m.role])}</small></span><b class="neg">−${grams(m.grams)}</b></a>`; }).join('')}
        ${printer ? `<div class="spool-mini"><span class="ico-badge blue">${icon.clock(16)}</span><span class="grow"><b>${esc(printer.name)}</b><small class="muted">отработано ${nf(C.equipmentHours(printer, state.prints), 1)} ч${printer.resourceHours ? ` из ${nf(printer.resourceHours, 0)} ч` : ''}</small></span><b class="accent">+${nf(p.hours)} ч</b></div>` : ''}
      </div>
      ${ownerPriceCard(p)}
      ${sellable || sales.length ? saleBlock(state, p, sellable, sales) : ''}
      <button class="btn ghost danger-text" data-act="delete-print" data-id="${p.id}">${icon.trash(16)} Удалить печать</button>
    </div>
  </div>`;
}

// Для изделий Merino Home продажа на сторону — редкий случай, поэтому блок свёрнут.
function saleBlock(state, p, sellable, sales) {
  const html = priceAndSale(state, p, sellable, sales);
  const forOwner = (p.outputs || []).some((o) => C.num(o.ownerShare) > 0);
  if (!forOwner || sales.length) return html;
  return `<details class="card sale-details"><summary>Продать на сторону вместо Merino Home</summary>${html.replace('<div class="card stack-12">', '<div class="stack-12">')}</details>`;
}

function priceAndSale(state, p, sellable, sales) {
  const unit = p.split.unit;
  const o = C.priceOptions(unit, state.settings);
  const fee = state.settings.mpFee, pack = state.settings.packCost;
  const opt = (label, note, price) => `<button type="button" class="price-opt" data-act="price-pick" data-v="${price}"><span class="row-between"><b>${label}</b><b class="h3">${money(price)}</b></span><span class="row-between small muted"><span>${note}</span><span class="pos fw700">+${money(price - unit)} · ${Math.round(((price - unit) / price) * 100)} %</span></span></button>`;
  return `<div class="card stack-12">
    <div class="h3">Цена продажи <span class="muted small">за 1 шт.</span></div>
    ${sellable ? `
    ${opt('Наценка 50 %', `${nf(unit)} × 1,5`, o.m50)}
    ${opt('Наценка 100 %', `${nf(unit)} × 2`, o.m100)}
    ${opt('Рекомендуемая', 'с комиссией и упаковкой', o.rec)}
    <p class="muted tiny">Рекомендуемая: после комиссии маркетплейса ${nf(fee)} % и упаковки ${money0(pack)} остаётся себестоимость × 2. (2 × ${nf(unit)} + ${nf(pack)}) ÷ ${nf(1 - fee / 100)} = ${money(o.recRaw)}, округлено вверх до 10 ₽. Меняется в настройках.</p>
    <form data-form="sale" data-live="sale" data-id="${p.id}" class="stack-12 sale-form">
      <div class="h3">Записать продажу</div>
      <div class="grid2">
        ${field('Цена за 1 шт., ₽ — свой вариант', numInput('price', '', 'id="sale-price" placeholder="выберите вариант выше или впишите"'))}
        ${field(`Продано, шт. (доступно ${sellable})`, numInput('qty', '1', 'inputmode="numeric"'))}
      </div>
      <div class="row wrap gap8">
        <label class="pill-radio"><input type="radio" name="channel" value="own" checked><span>Лично / Авито</span></label>
        <label class="pill-radio"><input type="radio" name="channel" value="mp"><span>Маркетплейс · ${nf(fee)} %</span></label>
      </div>
      ${field('Дата', `<input type="date" name="date" value="${today()}">`)}
      <div class="sale-preview" id="sale-preview">${salePreview(p, {})}</div>
      <button class="btn green big" type="submit">Подтвердить продажу</button>
      <p class="muted tiny">Проданные штуки перейдут в назначение «Продажа». Себестоимость не изменится — она зафиксирована при печати.</p>
    </form>` : '<div class="muted small">Все изделия этой печати проданы.</div>'}
    ${sales.length ? `<div class="stack-8"><div class="fw700">Продажи этой печати</div>${sales.map((s) => { const r = C.saleResult(s); return `<div class="money-row"><span>${dateShort(s.date)} · ${s.qty} × ${money0(s.price)} · ${s.channel === 'mp' ? 'маркетплейс' : 'лично'}</span><span class="row gap8"><b class="${r.profit < 0 ? 'neg' : 'pos'}">${r.profit < 0 ? '−' : '+'}${money(Math.abs(r.profit))}</b><button class="icon-btn" data-act="delete-sale" data-id="${s.id}" aria-label="Удалить продажу">${icon.trash(15)}</button></span></div>`; }).join('')}</div>` : ''}
  </div>`;
}

function ownerRows(p) {
  const rows = (p.outputs || []).filter((o) => C.num(o.ownerShare) > 0);
  if (!rows.length) return '';
  return rows.map((o) => {
    const r = C.ownerResult(o, p.split.unit, p.split.unitContribution);
    return `<div class="bt-foot owner"><span>Merino Home · ${o.qty} шт. × ${money(r.price)} = ${money(r.total)}<br><small class="muted">собственнику ${nf(r.share * 100, 1)} % · вам ${nf(100 - r.share * 100, 1)} % (${money(r.mine)})</small></span><span class="right"><b>${money(r.owner)}</b><br><small class="${r.profit < 0 ? 'neg' : 'pos'}">прибыль ${money(r.profit)}</small></span></div>`;
  }).join('');
}

function ownerPriceCard(p) {
  const o = (p.outputs || []).find((x) => C.num(x.ownerShare) > 0);
  if (!o) return '';
  const unit = p.split.unit;
  const opts = [['m50', 'Наценка 50 %', C.ownerUnitPrice(unit, 'm50')], ['m100', 'Наценка 100 %', C.ownerUnitPrice(unit, 'm100')]];
  const mode = p.ownerPriceMode || 'm100';
  return `<form class="card stack-12" data-form="owner-price" data-id="${p.id}">
    <div class="h3">Цена для Merino Home <span class="muted small">за 1 шт.</span></div>
    <div class="stack-8">
      ${opts.map(([v, l, price]) => `<label class="price-opt ${mode === v ? 'on' : ''}"><input type="radio" name="mode" value="${v}" ${mode === v ? 'checked' : ''} hidden><span class="row-between"><b>${l}</b><b class="h3">${money(price)}</b></span><span class="row-between small muted"><span>${nf(unit)} × ${v === 'm50' ? '1,5' : '2'}</span><span class="pos fw700">+${money(price - unit)}</span></span></label>`).join('')}
      <label class="price-opt ${mode === 'own' ? 'on' : ''}"><input type="radio" name="mode" value="own" ${mode === 'own' ? 'checked' : ''} hidden><span class="row-between"><b>Своя цена</b></span>${numInput('price', mode === 'own' ? String(o.unitPrice).replace('.', ',') : '', 'placeholder="₽ за 1 шт."')}</label>
    </div>
    ${field('Доля собственника, %', numInput('share', String(o.ownerShare), 'inputmode="numeric"'))}
    <button class="btn soft" type="submit">Сохранить цену</button>
  </form>`;
}

export function salePreview(p, f) {
  const s = store.state.settings;
  const mp = f.channel === 'mp';
  const sale = { qty: C.num(f.qty) || 1, price: C.num(f.price), feePct: mp ? s.mpFee : 0, packCost: mp ? s.packCost : 0, unitCost: p.split.unit, unitContribution: p.split.unitContribution };
  if (!sale.price) return '<span class="muted small">Выберите цену — здесь появится расчёт прибыли.</span>';
  const r = C.saleResult(sale);
  const line = (l, v, cls = '') => `<div class="sum-line ${cls}"><span>${l}</span><b>${v}</b></div>`;
  return `${line(`Выручка: ${sale.qty} × ${money(sale.price)}`, money(r.revenue))}
    ${mp ? line(`Комиссия ${nf(s.mpFee)} %`, '−' + money(r.fee)) : ''}
    ${mp ? line(`Упаковка: ${sale.qty} × ${money0(s.packCost)}`, '−' + money(r.pack)) : ''}
    ${line(`Себестоимость: ${sale.qty} × ${money(sale.unitCost)}`, '−' + money(r.cost))}
    ${line('Прибыль', `<span class="${r.profit < 0 ? 'neg' : 'pos'}">${r.profit < 0 ? '−' : ''}${money(Math.abs(r.profit))}</span>`, 'subtotal')}`;
}

export const printActions = {
  'finish-print': (el) => openFinishModal(store.state, el.dataset.id),
  'fail-print': (el) => {
    const p = store.state.prints.find((x) => x.id === el.dataset.id);
    openFailureModal(store.state, { ...p });
  },
  'delete-print': (el) => {
    const state = store.state;
    const p = state.prints.find((x) => x.id === el.dataset.id);
    if (!p) return;
    const sales = state.sales.filter((s) => s.printId === p.id);
    const name = `«${modelName(state, p.modelId)}» от ${dateShort(p.date)}`;
    let msg = p.finalized
      ? `Удалить печать ${name}?\n\nМатериал (${grams(p.materials.reduce((a, m) => a + m.grams, 0))}) вернётся на катушки, себестоимость уйдёт из аналитики.`
      : `Отменить печать ${name}? Склад не менялся.`;
    if (sales.length) msg += `\n\nВместе с ней удалятся записанные продажи: ${sales.length} (${sales.reduce((a, s) => a + s.qty, 0)} шт.).`;
    if (!confirm(msg)) return;
    try {
      store.commit((s) => {
        for (const sale of sales) deleteSale(s, sale.id);
        deletePrint(s, p.id);
      });
      toast('Печать удалена');
      if (location.hash.startsWith('#/print/')) ctx.go('#/prints');
    } catch (e) { toast(e.message, 'err'); }
  },
  'price-pick': (el) => {
    const input = document.getElementById('sale-price');
    if (!input) return;
    input.value = String(el.dataset.v).replace('.', ',');
    el.closest('.card').querySelectorAll('.price-opt').forEach((b) => b.classList.toggle('on', b === el));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  },
  'delete-sale': (el) => {
    if (!confirm('Удалить продажу? Изделия вернутся в прежнее назначение.')) return;
    store.commit((s) => deleteSale(s, el.dataset.id));
    toast('Продажа удалена');
  },
};

export const printForms = {
  'owner-price': (form, f) => {
    if (f.mode === 'own' && !(C.num(f.price) > 0)) return toast('Впишите свою цену', 'err');
    store.commit((s) => setOwnerPrice(s, form.dataset.id, { mode: f.mode, price: f.price, share: f.share }));
    toast('Цена для Merino Home сохранена');
  },
  sale: (form, f) => {
    try {
      if (!(C.num(f.price) > 0)) return toast('Укажите цену продажи', 'err');
      const sale = store.commit((s) => recordSale(s, { ...f, printId: form.dataset.id }));
      const r = C.saleResult(sale);
      toast(`Продано ${sale.qty} шт. · прибыль ${money(r.profit)}`);
    } catch (e) { toast(e.message, 'err'); }
  },
};

export async function attachPhoto(target, file) {
  const [type, id] = target.split(':');
  const blob = await compressImage(file);
  const photoId = 'ph_' + uid();
  await photos.put(photoId, blob);
  queuePhoto(photoId);
  store.commit((s) => {
    if (type === 'print') {
      const p = s.prints.find((x) => x.id === id);
      p.photoIds = [...(p.photoIds || []), photoId];
      const m = s.models.find((x) => x.id === p.modelId);
      if (m && !m.photoId) m.photoId = photoId;
    } else if (type === 'model') {
      s.models.find((x) => x.id === id).photoId = photoId;
    } else if (type === 'equipment') {
      s.equipment.find((x) => x.id === id).photoId = photoId;
    } else if (type === 'spool') {
      s.spools.find((x) => x.id === id).photoId = photoId;
    }
  });
  toast('Фото добавлено');
}
