// «Новая печать»: быстрый ввод, живой расчёт себестоимости, завершение и брак.
import * as C from '../calc.js';
import { store, today, printers, previewCost, finalizePrint, startPrint, modelName, FAILURE_REASONS, spoolLabel } from '../store.js';
import { ctx, esc, money, grams, nf, hoursText, icon, swatch, field, numInput, selectEl, openModal, closeModal, modalHead, toast, formData, GROUP_STYLE } from '../ui.js';

const ROLES = [['model', 'Изделие'], ['support', 'Supports'], ['purge', 'Purge'], ['tower', 'Prime tower'], ['waste', 'Отходы']];
const MODE_KEY = 'p3d-input-mode';
const savedMode = () => { try { return localStorage.getItem(MODE_KEY) === 'total' ? 'total' : 'unit'; } catch { return 'unit'; } };

/** Часы: «4,5», «0,5» или «1:30» (часы:минуты). */
export function parseHours(v) {
  const s = String(v ?? '').trim();
  const m = s.match(/^(\d+)\s*[:.ч]\s*(\d{1,2})\s*(мин)?$/);
  if (m && s.includes(':')) return Number(m[1]) + Number(m[2]) / 60;
  return C.num(s);
}
/** Два поля «ч» и «мин» вместо дробных часов. hours — десятичные часы. */
export function timeFields(name, hours, label, hint = '') {
  const total = Math.max(0, Math.round(C.num(hours) * 60));
  const has = String(hours ?? '').trim() !== '' && C.num(hours) > 0;
  const h = has ? Math.floor(total / 60) : '';
  const m = has ? total % 60 : '';
  return `<div class="field"><span>${label}</span><div class="time-pair">
    <span class="tp">${numInput(`${name}_h`, h, 'inputmode="numeric" placeholder="0" aria-label="Часы"')}<em>ч</em></span>
    <span class="tp">${numInput(`${name}_m`, m, 'inputmode="numeric" placeholder="0" aria-label="Минуты"')}<em>мин</em></span>
  </div>${hint ? `<small>${hint}</small>` : ''}</div>`;
}
/** Читает часы из пары полей формы; пусто — ''. */
export function readTime(f, name) {
  const h = String(f[`${name}_h`] ?? '').trim();
  const m = String(f[`${name}_m`] ?? '').trim();
  if (h === '' && m === '') return '';
  return C.num(h) + C.num(m) / 60;
}
const qtyOf = (d) => Math.max(1, Math.round(C.num(d.qty) || 1));
/** Множитель: в режиме «за 1 шт.» граммы, часы и доп. расходы умножаются на количество. */
const factor = (d) => (d.inputMode === 'unit' ? qtyOf(d) : 1);
const fmt = (n) => String(C.round2(n)).replace('.', ',');

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
    inputMode: savedMode(),
    purposeId: 'business',
    analogPrice: '',
    ownerShare: String(state.settings.ownerShare ?? 70),
    ownerPriceMode: 'm100',
    ownerPrice: '',
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
    const mode = base.inputMode || draft.inputMode;
    const k = mode === 'unit' ? Math.max(1, base.qty) : 1;
    Object.assign(draft, {
      inputMode: mode,
      printerId: state.equipment.some((e) => e.id === base.printerId) ? base.printerId : draft.printerId,
      hours: String(base.hours / k),
      extraCost: base.extraCost ? fmt(base.extraCost / k) : '',
      qty: String(base.qty),
      purposeId: base.purposeId || draft.purposeId,
      analogPrice: base.analogPrice ? String(base.analogPrice) : '',
      ownerShare: base.ownerShare != null ? String(base.ownerShare) : String(state.settings.ownerShare ?? 70),
      ownerPriceMode: base.ownerPriceMode || 'm100',
      ownerPrice: base.ownerPrice ? String(base.ownerPrice) : '',
      materials: base.materials.map((m) => ({
        spoolId: pickSpool(state, state.spools.find((s) => s.id === m.spoolId), m.grams),
        role: m.role,
        grams: fmt(m.grams / k),
      })),
    });
  }
  return draft;
}

export const draftToPrint = (d) => {
  const k = factor(d);
  return {
    id: d.printId,
    printerId: d.printerId,
    date: d.date,
    hours: Math.round(parseHours(d.hours) * k * 10000) / 10000,
    kwhActual: C.num(d.kwhActual) || null,
    extraCost: C.round2(C.num(d.extraCost) * k),
    materials: d.materials.map((m) => ({ spoolId: m.spoolId, role: m.role, grams: C.round2(C.num(m.grams) * k) })),
  };
};

export function renderNewPrint(state) {
  const d = ctx.ui.draft;
  const ps = printers(state);
  const purpose = state.purposes.find((p) => p.id === d.purposeId);
  const choices = spoolChoices(state);

  return `
  <div class="page-head"><div><h1>Новая печать</h1><div class="muted">${d.modelId ? 'Поля заполнены из прошлой печати этой модели — проверьте и сохраните' : 'Выберите модель или впишите новую'}</div></div></div>
  <form id="np" class="np-grid" autocomplete="off" onsubmit="return false">
    <div class="np-main">
      <div class="card stack-12">
        <div class="step"><span>1</span>Что печатаем</div>
        <label class="search-input">${icon.search(18)}<input name="modelName" value="${esc(d.modelName)}" list="models-list" placeholder="Начните вводить название" aria-label="Название модели" autocomplete="off"></label>
        <small class="muted">${d.modelId ? 'Модель из каталога — данные взяты из её последней печати' : 'Появятся подсказки из каталога. Новое название — новая модель.'}</small>
        <datalist id="models-list">${state.models.map((m) => `<option value="${esc(m.name)}"></option>`).join('')}</datalist>
        <div class="grid3">
          ${field('Принтер', ps.length ? selectEl('printerId', ps.map((p) => [p.id, p.name]), d.printerId) : '<div class="muted small">Добавьте принтер в «Ещё → Оборудование»</div>')}
          ${field('Дата', `<input type="date" name="date" value="${esc(d.date)}">`)}
        </div>
      </div>

      <div class="card stack-12">
        <div class="step"><span>2</span>Сколько и из чего</div>
        <div class="mode-row">
          <div class="mode-toggle" role="radiogroup" aria-label="Как вводить граммы и время">
            <label><input type="radio" name="inputMode" value="unit" ${d.inputMode === 'unit' ? 'checked' : ''}><span>За 1 шт.</span></label>
            <label><input type="radio" name="inputMode" value="total" ${d.inputMode === 'total' ? 'checked' : ''}><span>За всю печать</span></label>
          </div>
          <label class="qty-field"><span>Напечатано, шт.</span>${numInput('qty', d.qty, 'inputmode="numeric" aria-label="Сколько штук напечатано"')}</label>
        </div>
        <p class="muted small mode-hint">${d.inputMode === 'unit' ? 'Граммы и время — на <b>одно изделие</b>. Приложение умножит их на количество.' : 'Граммы и время — на <b>всю печать</b> целиком, как в слайсере для всего стола.'}</p>
        ${!choices.length ? '<div class="warn">На складе нет катушек. <a href="#/spools">Добавьте филамент</a>, чтобы списывать материал.</div>' : ''}
        ${d.materials.map((m, i) => materialRow(state, m, i, choices)).join('')}
        <div class="row wrap gap8">
          <button type="button" class="btn ghost small" data-act="np-add-row">${icon.plus(16)} Ещё катушка или отходы</button>
        </div>
        <div class="grid3">
          ${timeFields('hours', parseHours(d.hours), d.inputMode === 'unit' ? 'Время на 1 шт.' : 'Время всей печати', 'как в слайсере: например, 0 ч 49 мин')}
          ${field(d.inputMode === 'unit' ? 'Доп. расходы на 1 шт., ₽' : 'Доп. расходы на всё, ₽', numInput('extraCost', d.extraCost, 'placeholder="магниты, вставки…"'))}
          ${field('Факт кВт·ч за всю печать', numInput('kwhActual', d.kwhActual, 'placeholder="если есть счётчик"'), 'заменит расчёт по мощности')}
        </div>
        <div class="totals-line" id="np-totals"></div>
      </div>

      <div class="card stack-12">
        <div class="step"><span>3</span>Для чего</div>
        <div class="row wrap gap8">${state.purposes.map((p) => `
          <label class="pill-radio"><input type="radio" name="purposeId" value="${p.id}" ${p.id === d.purposeId ? 'checked' : ''}><span>${esc(p.name)}</span></label>`).join('')}</div>
        ${purpose?.group === 'business' ? `
          <div class="owner-box stack-12">
            <div class="fw700">Цена для Merino Home <span class="muted small">— делится между собственником и вами</span></div>
            <div class="row wrap gap8">
              ${[['m50', 'Наценка 50 %'], ['m100', 'Наценка 100 %'], ['own', 'Своя цена']].map(([v, l]) => `<label class="pill-radio"><input type="radio" name="ownerPriceMode" value="${v}" ${d.ownerPriceMode === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}
            </div>
            <div class="grid3">
              ${d.ownerPriceMode === 'own' ? field('Своя цена за 1 шт., ₽', numInput('ownerPrice', d.ownerPrice, 'placeholder="например, 300"')) : ''}
              ${field('Доля собственника, %', numInput('ownerShare', d.ownerShare, 'inputmode="numeric"'), 'остальное платите вы')}
              ${field('Готовый аналог за 1 шт., ₽', numInput('analogPrice', d.analogPrice, 'placeholder="необязательно"'), 'для расчёта экономии')}
            </div>
          </div>` : `<div class="muted small">${purposeHint(purpose?.group)}</div>`}
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
      <span class="mat-g">${numInput(`m-grams-${i}`, m.grams, 'placeholder="0" aria-label="Граммы"')}<em>г</em></span>
    </div>
    <span class="mat-left small" id="np-left-${i}"></span>
    ${i > 0 ? `<button type="button" class="icon-btn" data-act="np-del-row" data-i="${i}" aria-label="Убрать строку">${icon.close(16)}</button>` : ''}
  </div>`;
}

function ownerSplitHtml(state, d, full, contribution) {
  const purpose = state.purposes.find((p) => p.id === d.purposeId);
  if (purpose?.group !== 'business' || !full) return '';
  const q = qtyOf(d);
  const unit = full / q;
  const o = { qty: q, ownerShare: d.ownerShare, unitPrice: C.ownerUnitPrice(unit, d.ownerPriceMode, d.ownerPrice) };
  const r = C.ownerResult(o, unit, contribution / q);
  const line = (l, v, cls = '') => `<div class="sum-line ${cls}"><span>${l}</span><b>${v}</b></div>`;
  return `<div class="split-box">
    ${line('Цена для Merino Home', `${money(r.price)} × ${q}`)}
    ${line(`Собственнику ${nf(r.share * 100, 1)} %`, money(r.owner))}
    ${line(`Ваша доля ${nf(100 - r.share * 100, 1)} %`, money(r.mine))}
    ${line('Ваша прибыль', `<span class="${r.profit < 0 ? 'neg' : 'pos'}">${money(r.profit)}</span>`, 'subtotal')}
  </div>`;
}

export function summaryHtml(state, d) {
  const preview = previewCost(state, draftToPrint(d));
  const t = preview.totals;
  const qty = qtyOf(d);
  const roleSum = {};
  for (const m of preview.materials) roleSum[m.role] = (roleSum[m.role] || 0) + m.amount;
  const line = (l, v, cls = '') => `<div class="sum-line ${cls}"><span>${l}</span><b>${money(v)}</b></div>`;
  return `
    <div class="eyebrow">Себестоимость печати</div>
    ${Object.entries(roleSum).map(([r, v]) => line(C.ROLE_LABELS[r], v)).join('') || line('Материал', 0)}
    ${preview.charges.filter((c) => c.kind === 'electricity' || c.kind === 'extra').map((c) => line(c.label, c.amount)).join('')}
    ${line('Прямая', t.direct, 'subtotal')}
    ${preview.charges.filter((c) => c.kind === 'amortization' || c.kind === 'ops').map((c) => line(c.label, c.amount)).join('')}
    <div class="total-box"><span>Полная себестоимость</span><b>${money(t.full)}</b><small>${money(t.full / qty)} за 1 шт. · ${qty} шт.</small></div>
    ${ownerSplitHtml(state, d, t.full, t.direct + t.ops)}`;
}

// Обновляет итог и «останется на катушке» без перерисовки формы (чтобы не терять курсор).
export function refreshLive(state) {
  const d = ctx.ui.draft;
  const el = document.getElementById('np-summary');
  if (el) el.innerHTML = summaryHtml(state, d);
  const need = {};
  const k = factor(d);
  d.materials.forEach((m) => (need[m.spoolId] = (need[m.spoolId] || 0) + C.num(m.grams) * k));
  const tl = document.getElementById('np-totals');
  if (tl) {
    const g = d.materials.reduce((a, m) => a + C.num(m.grams), 0);
    const h = parseHours(d.hours);
    tl.innerHTML = d.inputMode === 'unit' && (g || h)
      ? `Всего на ${k} шт.: <b>${grams(g * k)}</b> пластика${h ? ` · <b>${hoursText(h * k)}</b> печати` : ''}${h ? ` <span class="muted">(${hoursText(h)} × ${k})</span>` : ''}`
      : d.inputMode === 'total' && qtyOf(d) > 1 && g ? `На 1 шт.: <b>${nf(g / qtyOf(d), 1)} г</b>${h ? ` · <b>${hoursText(h / qtyOf(d))}</b>` : ''}` : '';
  }
  d.materials.forEach((m, i) => {
    const out = document.getElementById(`np-left-${i}`);
    const s = state.spools.find((x) => x.id === m.spoolId);
    if (!out || !s) return;
    const after = C.round2(C.spoolStats(s, state.movements).left - need[m.spoolId]);
    if (i !== d.materials.findIndex((x) => x.spoolId === m.spoolId)) { out.innerHTML = ''; return; }
    out.innerHTML = C.num(m.grams) > 0 ? (after >= 0 ? `<span class="pos">останется ${grams(after)}</span>` : `<span class="neg">не хватит ${grams(-after)}</span>`) : '';
  });
}

/** Выбрана знакомая модель (из подсказок) и данные ещё не введены — подставляем её последнюю печать. */
export function onModelChosen(state, target) {
  const d = ctx.ui.draft;
  const m = state.models.find((x) => x.name.toLowerCase() === target.value.trim().toLowerCase());
  if (!m) return;
  const empty = d.materials.every((x) => !C.num(x.grams)) && !parseHours(d.hours);
  const hasPrints = state.prints.some((p) => p.modelId === m.id && p.finalized);
  if (empty && hasPrints) ctx.go(`#/new?model=${m.id}`);
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
  } else if (name === 'hours_h' || name === 'hours_m') {
    const v = readTime(formData(target.form), 'hours');
    d.hours = v === '' ? '' : String(v);
  } else if (name === 'inputMode') {
    switchMode(d, target.value);
    try { localStorage.setItem(MODE_KEY, d.inputMode); } catch { /* не критично */ }
    return 'rerender';
  } else if (name in d) {
    d[name] = target.value;
    if (name === 'purposeId' || name === 'ownerPriceMode') return 'rerender';
  }
  return 'live';
}

// При переключении режима пересчитываем уже введённые числа, чтобы итог не изменился.
function switchMode(d, mode) {
  if (mode === d.inputMode) return;
  const q = qtyOf(d);
  const conv = (v) => (String(v).trim() === '' ? v : fmt(mode === 'unit' ? C.num(v) / q : C.num(v) * q));
  d.materials.forEach((m) => (m.grams = conv(m.grams)));
  if (String(d.hours).trim() !== '') d.hours = String(mode === 'unit' ? parseHours(d.hours) / q : parseHours(d.hours) * q);
  d.extraCost = conv(d.extraCost);
  d.inputMode = mode;
}

function validate(state, d, needMaterials = true) {
  if (!d.modelName.trim()) return 'Впишите название модели';
  if (needMaterials) {
    const rows = d.materials.filter((m) => C.num(m.grams) > 0);
    if (!rows.length) return 'Укажите граммы материала';
    if (rows.some((m) => !m.spoolId)) return 'Выберите катушку';
    if (!(parseHours(d.hours) > 0) && !(C.num(d.kwhActual) > 0)) return 'Укажите время печати';
  }
  return '';
}

const draftForm = (d) => {
  const tot = draftToPrint(d);
  return {
  modelId: d.modelId,
  modelName: d.modelName,
  printerId: d.printerId,
  date: d.date,
  hours: tot.hours,
  kwhActual: d.kwhActual,
  extraCost: tot.extraCost,
  inputMode: d.inputMode,
  qty: d.qty,
  purposeId: d.purposeId,
  analogPrice: d.analogPrice,
  ownerShare: d.ownerShare,
  ownerPriceMode: d.ownerPriceMode,
  ownerPrice: d.ownerPrice,
  comment: d.comment,
  materials: tot.materials.filter((m) => m.spoolId && m.grams > 0),
  };
};

export const newPrintActions = {
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
        ${timeFields('hours', p.hours, 'Время всей печати')}
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
        ${timeFields('hours', draftOrPrint.hours, 'Сколько успело напечататься', 'до остановки, на всю печать')}
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
    const done = store.commit((s) => finalizePrint(s, { id: p.id, status: 'done', hours: readTime(f, 'hours') || p.hours, date: f.date, materials }));
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
    const p = store.commit((s) => finalizePrint(s, { ...src, status, goodQty: f.goodQty, hours: readTime(f, 'hours') === '' ? src.hours : readTime(f, 'hours'), materials, failureReason: f.failureReason, comment: f.comment || src.comment }));
    ctx.ui.draft = null;
    closeModal();
    toast(`Брак записан: ${money(p.split.failCost)}`, 'warn');
    ctx.go(`#/print/${p.id}`);
  },
};
