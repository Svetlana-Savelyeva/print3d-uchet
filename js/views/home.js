import * as C from '../calc.js';
import { modelName, today, printers } from '../store.js';
import { ctx, esc, money, money0, grams, nf, hoursText, dateShort, icon, GROUP_STYLE, STATUS, chip, purposeChip, swatch } from '../ui.js';

const PERIODS = [['today', 'Сегодня', 'День'], ['week', 'Неделя', 'Неделя'], ['month', 'Месяц', 'Месяц'], ['year', 'Год', 'Год'], ['all', 'Всё время', 'Всё']];
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

function periodTitle(p) {
  const t = today();
  if (p === 'month') return `${MONTHS[Number(t.slice(5, 7)) - 1]} ${t.slice(0, 4)}`.replace(/^./, (c) => c.toUpperCase());
  if (p === 'year') return `${t.slice(0, 4)} год`;
  return PERIODS.find(([k]) => k === p)[1];
}

export function renderHome(state) {
  const period = ctx.ui.period;
  const d = C.dashboard(state, C.periodRange(period, today()));
  const pb = C.payback(state);
  const printing = state.prints.filter((p) => p.status === 'printing');
  const low = state.spools
    .filter((s) => !s.closed)
    .map((s) => ({ s, st: C.spoolStats(s, state.movements) }))
    .filter(({ st }) => st.left > 0 && st.left < state.settings.lowStockG);
  const recent = state.prints.filter((p) => p.finalized).sort(newestFirst).slice(0, 6);
  const dSales = d.sales;

  const groups = Object.entries(C.PURPOSE_GROUPS).map(([g, label]) => ({ g, label: g === 'business' ? 'Бизнес' : label, v: d.byGroup[g] }));
  groups.push({ g: 'fail', label: 'Брак', v: d.failCost });
  const groupMax = Math.max(1, ...groups.map((x) => x.v));

  const own = d.owner;
  // Merino Home по цене — это тоже заработок: выручка = доля собственника, прибыль = разница с себестоимостью.
  const earn = { revenue: dSales.revenue + own.revenue, profit: dSales.profit + own.profit };
  const effectPeriod = d.economy + earn.profit;

  return `
  <div class="page-head">
    <div><h1>${esc(periodTitle(period))}</h1>${state.demo ? '<div class="muted">Демо-данные · очистить можно в «Ещё → Резервная копия»</div>' : ''}</div>
    <div class="seg period-seg">${PERIODS.map(([k, l, s]) => `<button class="${k === period ? 'on' : ''}" data-act="period" data-v="${k}"><span class="l-full">${l}</span><span class="l-short">${s}</span></button>`).join('')}</div>
  </div>

  <div class="kpis">
    <a class="kpi orange" href="#/prints">
      <span class="kpi-ico">${icon.cube(26)}</span>
      <span class="kpi-label">Печатей</span>
      <span class="kpi-value">${d.printsCount}</span>
      <span class="kpi-sub">${d.success} успешно · ${d.failedCount} брак · ${d.items} изд.</span>
    </a>
    <div class="kpi blue">
      <span class="kpi-ico">${icon.chart(26)}</span>
      <span class="kpi-label">Себестоимость изделий</span>
      <span class="kpi-value">${money0(d.totals.full)}</span>
      <span class="kpi-sub">полная · прямая ${money0(d.totals.direct)}</span>
    </div>
    <a class="kpi teal" href="#/purchases">
      <span class="kpi-ico">${icon.wallet(26)}</span>
      <span class="kpi-label">Потрачено денег</span>
      <span class="kpi-value">${money0(d.money)}</span>
      <span class="kpi-sub">все покупки за период</span>
    </a>
    <div class="kpi green">
      <span class="kpi-ico">${icon.trend(26)}</span>
      <span class="kpi-label">Экономический эффект</span>
      <span class="kpi-value">${money0(effectPeriod)}</span>
      <span class="kpi-sub">экономия ${money0(d.economy)} + прибыль ${money0(earn.profit)}</span>
    </div>
  </div>

  ${printing.length ? `<div class="stack">${printing.map((p) => printingCard(state, p)).join('')}</div>` : ''}

  ${paybackCard(pb)}

  <div class="card stack-16">
    <div class="row-between wrap">
      <div><div class="eyebrow" style="color:#6B4FD0">Заработок · ${esc(periodTitle(period).toLowerCase())}</div><div class="h2">${dSales.count || own.qty ? 'Продажи и Merino Home' : 'Продаж пока нет'}</div></div>
      <a class="btn soft-purple" href="#/prints?filter=sellable">Записать продажу</a>
    </div>
    <div class="tiles">
      <div class="tile grad-purple"><span>Выручка</span><b>${money0(earn.revenue)}</b><small>продажи ${money0(dSales.revenue)} · Merino Home ${money0(own.revenue)}</small></div>
      <div class="tile mint"><span>Прибыль</span><b>${money0(earn.profit)}</b><small>продажи ${money0(dSales.profit)} · Merino Home ${money0(own.profit)}</small></div>
      <div class="tile"><span>Продано</span><b>${dSales.qty} шт.</b><small>${dSales.count} ${plural(dSales.count, 'сделка', 'сделки', 'сделок')}${own.qty ? ` · Merino Home ${own.qty} шт.` : ''}</small></div>
      <div class="tile"><span>Маржа</span><b class="m-all">${earn.revenue ? Math.round((earn.profit / earn.revenue) * 100) : 0} %</b><small>прибыль ÷ выручка</small></div>
    </div>
    ${earnList(state, d)}
  </div>

  <div class="two">
    <div class="card stack-16">
      <div class="row-between"><div><div class="eyebrow">Себестоимость</div><div class="h2">На что ушло произведённое</div></div><b class="h2">${money0(d.totals.full)}</b></div>
      ${groups.map(({ g, label, v }) => `
        <div class="bar-row">
          <div class="row-between"><span class="fw600">${label}</span><b>${money0(v)}</b></div>
          <div class="bar"><i style="width:${(v / groupMax) * 100}%;background:${g === 'fail' ? '#B23A2F' : GROUP_STYLE[g].bar}"></i></div>
          ${g === 'business' && own.revenue > 0 ? `<div class="row-between small muted"><span>собственники заплатят по цене</span><b class="accent">${money0(own.revenue)}</b></div>` : ''}
        </div>`).join('')}
      <details class="how"><summary>Как рассчитано</summary>
        <div class="how-grid">
          <span>Материалы</span><b>${money(d.totals.material)}</b>
          <span>Электричество</span><b>${money(d.totals.electricity)}</b>
          <span>Доп. прямые расходы</span><b>${money(d.totals.extra)}</b>
          <span class="fw700">Прямая себестоимость</span><b>${money(d.totals.direct)}</b>
          <span>Амортизация</span><b>${money(d.totals.amortization)}</b>
          <span>Эксплуатационные</span><b>${money(d.totals.ops)}</b>
          <span class="fw700">Полная себестоимость</span><b>${money(d.totals.full)}</b>
        </div>
        <p class="muted small">${nf(d.grams, 0)} г филамента · ${hoursText(d.hours)} печати. Брак выделен отдельно и в изделия не добавляется.</p>
      </details>
    </div>
    <div class="card stack-16">
      <div class="row-between"><div><div class="eyebrow" style="color:#2F8BA8">Деньги</div><div class="h2">Что оплачено за период</div></div><b class="h2">${money0(d.money)}</b></div>
      ${Object.entries(C.MONEY_KIND_LABELS).filter(([k]) => d.moneyByKind[k]).map(([k, l]) => `
        <div class="money-row"><span>${l}</span><b>${money0(d.moneyByKind[k])}</b></div>`).join('') || '<div class="muted">Покупок за период нет</div>'}
      <p class="muted small">Деньги и себестоимость не складываются: катушка оплачена в день покупки, а в себестоимость попадает по граммам.</p>
      <a class="link" href="#/purchases">Все покупки</a>
    </div>
  </div>

  <div class="two">
    <div class="card stack-12" style="flex:1 1 320px">
      <div class="row gap10"><span class="ico-badge red">${icon.alert(20)}</span><b class="h3">Заканчиваются</b></div>
      ${low.length ? low.map(({ s, st }) => `
        <a class="spool-mini" href="#/spool/${s.id}">${swatch(s.hex, 34)}<span class="grow"><b>${esc(s.colorName || s.material)}</b><small class="muted">${esc([s.material, s.line].filter(Boolean).join(' '))}${s.brand ? ' · ' + esc(s.brand) : ''}</small></span><b class="neg">${grams(st.left)}</b></a>`).join('') : '<div class="muted">Всего хватает</div>'}
      <a class="link" href="#/spools">Склад филаментов</a>
    </div>
    <div class="card flush" style="flex:999 1 560px;min-width:0">
      <div class="h3 pad">Последние печати</div>
      ${recent.length ? `<div class="table-scroll"><div class="ptable">
        <div class="pt-head"><span>Дата</span><span>Изделие</span><span>Назначение</span><span>Статус</span><span class="right" title="Полная себестоимость: пластик, электричество, износ принтера и расходники">Себестоимость</span></div>
        ${recent.map((p) => printRow(state, p)).join('')}
      </div></div>` : '<div class="pad muted">Пока ни одной печати. Нажмите «Новая печать».</div>'}
    </div>
  </div>`;
}

// Продажи и изделия Merino Home за период — одним списком, последние внесённые сверху.
const newestFirst = (a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.id < b.id ? 1 : -1);
function earnList(state, d) {
  const rows = d.sales.list.map((s) => ({
    id: s.id, date: s.date, printId: s.printId, name: modelName(state, s.modelId),
    qty: `${s.qty} × ${money0(s.price)}`, chip: chip(s.channel === 'mp' ? 'Маркетплейс' : 'Лично / Авито', GROUP_STYLE.sale),
    revenue: s.r.revenue, profit: s.r.profit,
  }));
  const range = C.periodRange(ctx.ui.period, today());
  for (const p of state.prints) {
    if (!p.finalized || p.date < range.from || p.date > range.to) continue;
    for (const o of p.outputs || []) {
      if (!(C.num(o.ownerShare) > 0)) continue;
      const r = C.ownerResult(o, p.split.unit, p.split.unitContribution);
      rows.push({ id: p.id, date: p.date, printId: p.id, name: modelName(state, p.modelId), qty: `${o.qty} × ${money0(r.price)}`, chip: chip('Merino Home', GROUP_STYLE.business), revenue: r.owner, profit: r.profit });
    }
  }
  if (!rows.length) return '';
  rows.sort(newestFirst);
  const SHOW = 3;
  const open = ctx.ui.earnOpen;
  const row = (r) => `<a class="sale-row" href="#/print/${r.printId}">
        <span class="muted">${dateShort(r.date)}</span>
        <b>${esc(r.name)}</b>
        <span class="muted">${r.qty}</span>
        <span>${r.chip}</span>
        <span class="right">${money0(r.revenue)}</span>
        <b class="right ${r.profit < 0 ? 'neg' : 'pos'}">${r.profit < 0 ? '−' : '+'}${money0(Math.abs(r.profit))}</b>
      </a>`;
  const shown = open ? rows : rows.slice(0, SHOW);
  return `<div class="table-scroll"><div class="sales-list">${shown.map(row).join('')}</div></div>
    ${rows.length > SHOW ? `<button class="btn ghost small" data-act="earn-toggle">${open ? 'Свернуть' : `Показать все (${rows.length})`}</button>` : ''}`;
}

export function printRow(state, p, withDelete = false) {
  const st = STATUS[p.status] || STATUS.done;
  const purpose = p.outputs?.length > 1 ? chip('несколько', GROUP_STYLE.other) : purposeChip(state, p.outputs?.[0]?.purposeId || p.purposeId);
  const row = `<a class="pt-row" href="#/print/${p.id}">
    <span class="muted">${dateShort(p.date)}</span>
    <span><b>${esc(modelName(state, p.modelId))}</b> <span class="muted">· ${p.qty} шт.</span></span>
    <span>${purpose}</span>
    <span>${chip(st.label, st)}</span>
    <span class="right cost-cell">${p.finalized ? `<b>${money(p.totals.full)}</b>${p.qty > 1 && p.split.good ? `<small class="muted">${money(p.split.unit)} за шт.</small>` : ''}` : '<b>—</b>'}</span>
  </a>`;
  if (!withDelete) return row;
  return `<div class="pt-wrap">${row}<button class="icon-btn del-btn" data-act="delete-print" data-id="${p.id}" aria-label="Удалить печать" title="Удалить">${icon.trash(17)}</button></div>`;
}

function printingCard(state, p) {
  const printer = state.equipment.find((e) => e.id === p.printerId);
  const g = p.materials.reduce((a, m) => a + C.num(m.grams), 0);
  return `<div class="card printing">
    <span class="thumb">${icon.cube(40, 1.8)}</span>
    <div class="grow stack-6" style="min-width:0">
      <div class="row gap8 wrap">${chip('Печатается', STATUS.printing)}<span class="muted small">${esc(printer?.name || '')} · ${grams(g)} · ${p.qty} шт. · ${hoursText(p.hours)}</span></div>
      <a class="h2 plain" href="#/print/${p.id}">${esc(modelName(state, p.modelId))}</a>
      <div class="muted small">Начата ${dateShort(p.date)} · склад спишется после завершения</div>
    </div>
    <div class="row gap10 wrap">
      <button class="btn primary" data-act="finish-print" data-id="${p.id}">Печать завершена</button>
      <button class="btn danger-soft" data-act="fail-print" data-id="${p.id}">Брак</button>
    </div>
  </div>`;
}

export function paybackCard(pb) {
  if (pb.invested <= 0) {
    return `<div class="card stack-12"><div class="eyebrow" style="color:#2F9C6C">Окупаемость</div><div class="muted">Добавьте принтер в разделе «Оборудование» — здесь появится шкала окупаемости.</div></div>`;
  }
  const econW = Math.min(100, (Math.max(0, pb.economy) / pb.invested) * 100);
  const salesW = Math.max(0, Math.min(100 - econW, (Math.max(0, pb.sales + pb.owner) / pb.invested) * 100));
  const months = pb.since ? Math.max(1, monthsBetween(pb.since, today())) : 1;
  const pace = pb.effect / months;
  const left = pb.left;
  const forecast = left <= 0 ? 'готово' : pace > 0 ? `≈ ${Math.ceil(left / pace)} мес.` : '—';
  const q = (k) => money0((pb.invested * k) / 4);
  return `<div class="card stack-16">
    <div class="row-between wrap end">
      <div>
        <div class="eyebrow" style="color:#2F9C6C">Окупаемость оборудования · всё время</div>
        <div class="row gap10 baseline"><span class="big">${nf(pb.pct, 1)} %</span><span class="fw700 muted2">${left > 0 ? `вернулось ${money0(pb.effect)} из ${money0(pb.invested)}` : 'оборудование окупилось!'}</span></div>
      </div>
      <div class="right"><div class="muted small fw600">До окупаемости</div><div class="h1">${money0(left)}</div></div>
    </div>
    <div class="stack-8">
      <div class="pbar"><i style="width:${econW}%" class="g"></i><i style="width:${salesW}%" class="p"></i><s style="left:25%"></s><s style="left:50%"></s><s style="left:75%"></s></div>
      <div class="row-between tiny muted"><span>0</span><span>25 % · ${q(1)}</span><span>50 % · ${q(2)}</span><span>75 % · ${q(3)}</span><span>${money0(pb.invested)}</span></div>
    </div>
    <div class="tiles">
      <div class="tile"><span>Вложено</span><b>${money0(pb.invested)}</b><small>оборудование ${money0(pb.capital)} + оснащение ${money0(pb.tooling)}</small></div>
      <div class="tile mint"><span><i class="dot" style="background:#2F9C6C"></i>Экономия для бизнеса</span><b>${money0(pb.economy)}</b><small>не купили готовое (где указан аналог)</small></div>
      <div class="tile lilac"><span><i class="dot" style="background:#6440C8"></i>Продажи и Merino Home</span><b>${money0(pb.sales + pb.owner)}</b><small>выручка − комиссии − материалы, свет, расходники</small></div>
      <div class="tile sand"><span>Прогноз</span><b>${forecast}</b><small>${pace > 0 ? `при темпе ${money0(pace)} в месяц` : 'появится после первых продаж или экономии'}</small></div>
    </div>
    <p class="muted small">Личные изделия и подарки в окупаемость не входят. Амортизация здесь не вычитается — иначе стоимость принтера учлась бы дважды.</p>
  </div>`;
}

function monthsBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + (d2 >= d1 ? 0 : -1) + 1;
}

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
