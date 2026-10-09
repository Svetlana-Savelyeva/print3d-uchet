// «Новая печать»: быстрый ввод, живой расчёт себестоимости, завершение и брак.
import * as C from '../calc.js';
import { store, today, printers, previewCost, finalizePrint, startPrint, modelName, FAILURE_REASONS, spoolLabel } from '../store.js';
import { ctx, esc, money, grams, nf, hoursText, icon, swatch, field, numInput, selectEl, openModal, closeModal, modalHead, toast, formData, GROUP_STYLE } from '../ui.js';

const ROLES = Object.entries(C.ROLE_LABELS);

export function spoolChoices(state, includeId) {
  return state.spools
    .filter((s) => !s.closed || s.id === includeId)
    .map((s) => ({ s, st: C.spoolStats(s, state.movements) }))
    .filter(({ s, st }) => st.left > 0 || s.id === includeId);
}

// Подбор катушки для повтора: та же катушка, если хватает, иначе такая же по материалу и цвету.
function pickSpool(state, wanted, need) {
  const list = spoolChoices(state);
  const same = list.find(({ s }) => s.id === wanted?.id);
  if (same && same.st.left >= need) return same.s.id;
  const alike = list.find(({ s, st }) => wanted && s.material === wanted.material && s.colorName === wanted.colorName && st.left >= need);
  if (alike) return alike.s.id;
  return same?.s.id || list[0]?.s.id || '';
}

export function initDraft(state, query) {
  const ps = printers(state);
  const draft = {
    modelId: '',
    modelName: '',
    printerId: ps[0]?.id || '',
    date: today(),
    hours: '',
    qty: '1',
    purposeId: 'business',
    analogPrice: '',
    extraCost: '',
    kwhActual: '',
    comment: '',
    materials: [{ spoolId: spoolChoices(state)[0]?.s.id || '', role: 'model', grams: '' }],
  };
  let base = null;
  if (query.repeat) base = state.prints.find((p) => p.id === query.repeat);
  let model = null;
  if (query.model) {
    model = state.models.find((m) => m.id === query.model);
    base = state.prints.filter((p) => p.modelId === query.model && p.finalized).sort((a, b) => (a.date < b.date ? 1 : -1))[0] || null;
  }
  if (base) model = state.models.find((m) => m.id === base.modelId);
  if (model) {
    draft.modelId = model.id;
    draft.modelName = model.name;
    draft.purposeId = model.defaultPurpose || 'business';
  }
  if (base) {
    Object.assign(draft, {
      printerId: state.equipment.some((e) => e.id === base.printerId) ? base.printerId : draft.printerId,
      hours: String(base.hours).replace('.', ','),
      qty: String(base.qty),
      purposeId: base.purposeId || draft.purposeId,
      analogPrice: base.analogPrice ? String(base.analogPrice) : '',
      materials: base.materials.map((m) => ({
        spoolId: pickSpool(state, state.spools.find((s) => s.id === m.spoolId), m.grams),
        role: m.role,
        grams: String(m.grams).replace('.', ','),
      })),
    });
  }
  return draft;
}

export const draftToPrint = (d) => ({
  id: d.printId,
  printerId: d.printerId,
  date: d.date,
  hours: C.num(d.hours),
  kwhActual: C.num(d.kwhActual) || null,
  extraCost: C.num(d.extraCost),
  materials: d.materials.map((m) => ({ spoolId: m.spoolId, role: m.role, grams: C.num(m.grams) })),
});

export function renderNewPrint(state) {
  const d = ctx.ui.draft;
  const recentModels = [...state.prints]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((p) => p.modelId)
    .filter((id, i, arr) => arr.indexOf(id) === i)
    .slice(0, 6)
    .map((id) => state.models.find((m) => m.id === id))
    .filter(Boolean);
  const ps = printers(state);
  const purpose = state.purposes.find((p) => p.id === d.purposeId);
  const choices = spoolChoices(state);

  return `
  <div class="page-head"><div><h1>Новая печать</h1><div class="muted">${d.modelId ? 'Поля заполнены из прошлой печати этой модели — проверьте и сохраните' : 'Выберите модель или впишите новую'}</div></div></div>
  <form id="np" class="np-grid" autocomplete="off" onsubmit="return false">
    <div class="np-main">
      <div class="card stack-12">
        <div class="step"><span>1</span>Что печатаем</div>
        ${recentModels.length ? `<div class="row wrap gap8">${recentModels.map((m) => `<button type="button" class="pick ${m.id === d.modelId ? 'on' : ''}" data-act="np-model" data-id="${m.id}">${esc(m.name)}</button>`).join('')}</div>` : ''}
        <label class="search-input">${icon.search(18)}<input name="modelName" value="${esc(d.modelName)}" list="models-list" placeholder="Название модели — новой или из каталога" aria-label="Название модели"></label>
        <datalist id="models-list">${state.models.map((m) => `<option value="${esc(m.name)}"></option>`).join('')}</datalist>
        <div class="grid3">
          ${field('Принтер', ps.length ? selectEl('printerId', ps.map((p) => [p.id, p.name]), d.printerId) : '<div class="muted small">Добавьте принтер в «Ещё → Оборудование»</div>')}
          ${field('Дата', `<input type="date" name="date" value="${esc(d.date)}">`)}
          ${field('Изделий, шт.', numInput('qty', d.qty, 'inputmode="numeric"'))}
        </div>
      </div>

      <div class="card stack-12">
        <div class="step"><span>2</span>Катушки и граммы <small class="muted">из слайсера</small></div>
        ${!choices.length ? '<div class="warn">На складе нет катушек. <a href="#/spools">Добавьте филамент</a>, чтобы списывать материал.</div>' : ''}
        ${d.materials.map((m, i) => materialRow(state, m, i, choices)).join('')}
        <div class="row wrap gap8">
          <button type="button" class="btn ghost small" data-act="np-add-row">${icon.plus(16)} Ещё катушка или отходы</button>
        </div>
        <div class="grid3">
          ${field('Время печати, ч', numInput('hours', d.hours, 'placeholder="например, 4,5"'), 'можно дробью: 1,75 ч = 1 ч 45 мин')}
          ${field('Факт кВт·ч', numInput('kwhActual', d.kwhActual, 'placeholder="если есть счётчик"'), 'заменит расчёт по мощности')}
          ${field('Доп. прямые расходы, ₽', numInput('extraCost', d.extraCost, 'placeholder="магниты, вставки…"'))}
        </div>
      </div>

      <div class="card stack-12">
        <div class="step"><span>3</span>Для чего</div>
        <div class="row wrap gap8">${state.purposes.map((p) => `
          <label class="pill-radio"><input type="radio" name="purposeId" value="${p.id}" ${p.id === d.purposeId ? 'checked' : ''}><span>${esc(p.name)}</span></label>`).join('')}</div>
        ${purpose?.group === 'business' ? field('Сколько стоит готовый аналог (за 1 шт. с доставкой), ₽', numInput('analogPrice', d.analogPrice, 'placeholder="необязательно"'), 'Если указать, приложение посчитает экономию от самостоятельной печати.') : `<div class="muted small">${purposeHint(purpose?.group)}</div>`}
        ${field('Комментарий', `<input name="comment" value="${esc(d.comment)}" placeholder="необязательно">`)}
      </div>
    </div>

    <aside class="card np-side stack-12">
      <div id="np-summary">${summaryHtml(state, d)}</div>
      <button type="button" class="btn primary big" data-act="np-finish">${icon.check(18)} Печать завершена</button>
      <button type="button" class="btn soft big" data-act="np-start">Начать печать (ещё идёт)</button>
      <button type="button" class="btn danger-soft" data-act="np-fail">Брак…</button>
      <p class="muted small">До завершения склад не меняется и ничего не начисляется.</p>
    </aside>
  </form>`;
}

function purposeHint(group) {
  return {
    sale: 'Цену и продажу можно записать после печати в карточке печати.',
    personal: 'Личное потребление: не убыток бизнеса и не экономия.',
    gift: 'Подарки учитываются отдельной строкой.',
    test: 'Стоимость экспериментов показывается отдельно.',
    other: '',
  }[group] || '';
}

function materialRow(state, m, i, choices) {
  const opts = choices.map(({ s, st }) => [s.id, `${spoolLabel(s)} — ${grams(st.left)} · ${nf(s.costPerG)} ₽/г`]);
  if (!opts.length) opts.push(['', '— нет катушек —']);
  const sp = state.spools.find((s) => s.id === m.spoolId);
  return `<div class="mat-row">
    <span class="mat-sw">${swatch(sp?.hex, 28)}</span>
    <div class="mat-fields">
      ${selectEl(`m-spool-${i}`, opts, m.spoolId, 'aria-label="Катушка" class="mat-spool"')}
      ${selectEl(`m-role-${i}`, ROLES, m.role, 'aria-label="Для чего материал" class="mat-role"')}
      <span class="mat-g">${numInput(`m-grams-${i}`, m.grams, 'placeholder="г" aria-label="Граммы"')}<em>г</em></span>
    </div>
    <span class="mat-left small" id="np-left-${i}"></span>
    ${i > 0 ? `<button type="button" class="icon-btn" data-act="np-del-row" data-i="${i}" aria-label="Убрать строку">${icon.close(16)}</button>` : ''}
  </div>`;
}

export function summaryHtml(state, d) {
  const preview = previewCost(state, draftToPrint(d));
  const t = preview.totals;
  const qty = Math.max(1, Math.round(C.num(d.qty) || 1));
  const roleSum = {};
  for (const m of preview.materials) roleSum[m.role] = (roleSum[m.role] || 0) + m.amount;
  const line = (l, v, cls = '') => `<div class="sum-line ${cls}"><span>${l}</span><b>${money(v)}</b></div>`;
  return `
    <div class="eyebrow">Себестоимость печати</div>
    ${Object.entries(roleSum).map(([r, v]) => line(C.ROLE_LABELS[r], v)).join('') || line('Материал', 0)}
    ${preview.charges.filter((c) => c.kind === 'electricity' || c.kind === 'extra').map((c) => line(c.label, c.amount)).join('')}
    ${line('Прямая', t.direct, 'subtotal')}
    ${preview.charges.filter((c) => c.kind === 'amortization' || c.kind === 'ops').map((c) => line(c.label, c.amount)).join('')}
    <div class="total-box"><span>Полная себестоимость</span><b>${money(t.full)}</b><small>${money(t.full / qty)} за 1 шт. · ${qty} шт.</small></div>`;
}

// Обновляет итог и «останется на катушке» без перерисовки формы (чтобы не терять курсор).
export function refreshLive(state) {
  const d = ctx.ui.draft;
  const el = document.getElementById('np-summary');
  if (el) el.innerHTML = summaryHtml(state, d);
  const need = {};
  d.materials.forEach((m) => (need[m.spoolId] = (need[m.spoolId] || 0) + C.num(m.grams)));
  d.materials.forEach((m, i) => {
    const out = document.getElementById(`np-left-${i}`);
    const s = state.spools.find((x) => x.id === m.spoolId);
    if (!out || !s) return;
    const after = C.round2(C.spoolStats(s, state.movements).left - need[m.spoolId]);
    out.innerHTML = C.num(m.grams) > 0 ? (after >= 0 ? `<span class="pos">останется ${grams(after)}</span>` : `<span class="neg">не хватит ${grams(-after)}</span>`) : '';
  });
}

export function onDraftInput(state, target) {
  const d = ctx.ui.draft;
  const name = target.name;
  const mm = name.match(/^m-(spool|role|grams)-(\d+)$/);
  if (mm) {
    const key = { spool: 'spoolId', role: 'role', grams: 'grams' }[mm[1]];
    d.materials[Number(mm[2])][key] = target.value;
    if (mm[1] === 'spool') return 'rerender';
  } else if (name === 'modelName') {
    d.modelName = target.value;
    const m = state.models.find((x) => x.name.toLowerCase() === target.value.trim().toLowerCase());
    d.modelId = m ? m.id : '';
  } else if (name in d) {
    d[name] = target.value;
    if (name === 'purposeId') return 'rerender';
  }
  return 'live';
}

function validate(state, d, needMaterials = true) {
  if (!d.modelName.trim()) return 'Впишите название модели';
  if (needMaterials) {
    const rows = d.materials.filter((m) => C.num(m.grams) > 0);
    if (!rows.length) return 'Укажите граммы материала';
    if (rows.some((m) => !m.spoolId)) return 'Выберите катушку';
    if (!(C.num(d.hours) > 0) && !(C.num(d.kwhActual) > 0)) return 'Укажите время печати';
  }
  return '';
}

const draftForm = (d) => ({
  modelId: d.modelId,
  modelName: d.modelName,
  printerId: d.printerId,
  date: d.date,
  hours: d.hours,
  kwhActual: d.kwhActual,
  extraCost: d.extraCost,
  qty: d.qty,
  purposeId: d.purposeId,
  analogPrice: d.analogPrice,
  comment: d.comment,
  materials: d.materials.filter((m) => m.spoolId && C.num(m.grams) > 0).map((m) => ({ spoolId: m.spoolId, role: m.role, grams: C.num(m.grams) })),
});

export const newPrintActions = {
  'np-model': (el) => ctx.go(`#/new?model=${el.dataset.id}`),
  'np-add-row': () => {
    const d = ctx.ui.draft;
    const last = d.materials[d.materials.length - 1];
    d.materials.push({ spoolId: last?.spoolId || '', role: d.materials.length === 1 ? 'support' : 'purge', grams: '' });
    ctx.rerender();
  },
  'np-del-row': (el) => {
    ctx.ui.draft.materials.splice(Number(el.dataset.i), 1);
    ctx.rerender();
  },
  'np-finish': () => {
    const d = ctx.ui.draft;
    const err = validate(store.state, d);
    if (err) return toast(err, 'err');
    const p = store.commit((s) => finalizePrint(s, { ...draftForm(d), status: 'done' }));
    ctx.ui.draft = null;
    toast(`Сохранено. Полная себестоимость ${money(p.totals.full)}`);
    ctx.go(`#/print/${p.id}`);
  },
  'np-start': () => {
    const d = ctx.ui.draft;
    const err = validate(store.state, d);
    if (err) return toast(err, 'err');
    store.commit((s) => startPrint(s, draftForm(d)));
    ctx.ui.draft = null;
    toast('Печать начата. Склад спишется после завершения');
    ctx.go('#/home');
  },
  'np-fail': () => {
    const d = ctx.ui.draft;
    const err = validate(store.state, d);
    if (err) return toast(err, 'err');
    openFailureModal(store.state, { ...draftForm(d), materials: draftForm(d).materials });
  },
};

// ---------- Завершение начатой печати и брак ----------
export function openFinishModal(state, printId) {
  const p = state.prints.find((x) => x.id === printId);
  openModal(`${modalHead('Печать завершена')}
    <form data-form="finish" data-id="${p.id}" class="stack-12">
      <p class="muted">${esc(modelName(state, p.modelId))} · проверьте фактические значения</p>
      <div class="grid2">
        ${field('Время, ч', numInput('hours', String(p.hours).replace('.', ',')))}
        ${field('Дата', `<input type="date" name="date" value="${today()}">`)}
      </div>
      ${materialInputs(state, p.materials)}
      <button class="btn primary big" type="submit">Списать материал и сохранить</button>
    </form>`);
}

function materialInputs(state, materials) {
  return materials.map((m, i) => {
    const s = state.spools.find((x) => x.id === m.spoolId);
    return field(`${esc(C.ROLE_LABELS[m.role] || 'Материал')}: ${esc(s ? spoolLabel(s) : '')}, г`, `${numInput(`g-${i}`, String(m.grams).replace('.', ','))}<input type="hidden" name="s-${i}" value="${m.spoolId}"><input type="hidden" name="r-${i}" value="${m.role}">`);
  }).join('');
}

function readMaterials(f, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push({ spoolId: f[`s-${i}`], role: f[`r-${i}`], grams: C.num(f[`g-${i}`]) });
  return out.filter((m) => m.grams > 0);
}

let pendingFailure = null;
export function openFailureModal(state, draftOrPrint) {
  pendingFailure = draftOrPrint;
  const qty = Math.max(1, Math.round(C.num(draftOrPrint.qty) || 1));
  openModal(`${modalHead('Брак')}
    <form data-form="failure" class="stack-12">
      <div class="row wrap gap8">
        <label class="pill-radio"><input type="radio" name="kind" value="failed" checked><span>Полный брак</span></label>
        <label class="pill-radio"><input type="radio" name="kind" value="partial"><span>Частичный брак</span></label>
      </div>
      <div class="grid2">
        ${field(`Годных изделий (из ${qty})`, numInput('goodQty', '0', 'inputmode="numeric"'), 'для частичного брака')}
        ${field('Сколько успело напечататься, ч', numInput('hours', String(draftOrPrint.hours || '').replace('.', ',')), 'до остановки')}
      </div>
      <p class="muted small">Укажите фактически ушедший материал. Если не знаете — уменьшите пропорционально времени или взвесьте катушку позже.</p>
      ${materialInputs(state, draftOrPrint.materials)}
      ${field('Причина', selectEl('failureReason', FAILURE_REASONS.map((r) => [r, r]), FAILURE_REASONS[0]))}
      ${field('Комментарий', '<input name="comment" placeholder="необязательно">')}
      <button class="btn danger big" type="submit">Сохранить брак</button>
      <p class="muted small">Материал, электричество и износ учтутся полностью и попадут в «Стоимость брака».</p>
    </form>`);
}

export const newPrintForms = {
  finish: (form, f) => {
    const state = store.state;
    const p = state.prints.find((x) => x.id === form.dataset.id);
    const materials = readMaterials(f, p.materials.length);
    const done = store.commit((s) => finalizePrint(s, { id: p.id, status: 'done', hours: f.hours, date: f.date, materials }));
    closeModal();
    toast(`Сохранено. Полная себестоимость ${money(done.totals.full)}`);
    ctx.go(`#/print/${done.id}`);
  },
  failure: (form, f) => {
    const src = pendingFailure;
    const materials = readMaterials(f, src.materials.length);
    const status = f.kind === 'partial' ? 'partial' : 'failed';
    const qty = Math.max(1, Math.round(C.num(src.qty) || 1));
    if (status === 'partial' && !(C.num(f.goodQty) > 0 && C.num(f.goodQty) < qty)) return toast(`Годных должно быть от 1 до ${qty - 1}`, 'err');
    const p = store.commit((s) => finalizePrint(s, { ...src, status, goodQty: f.goodQty, hours: f.hours, materials, failureReason: f.failureReason, comment: f.comment || src.comment }));
    ctx.ui.draft = null;
    closeModal();
    toast(`Брак записан: ${money(p.split.failCost)}`, 'warn');
    ctx.go(`#/print/${p.id}`);
  },
};
