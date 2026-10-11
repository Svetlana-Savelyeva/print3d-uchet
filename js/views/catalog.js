// Каталог изделий: модель отдельно от конкретных печатей.
import * as C from '../calc.js';
import { store, saveModel } from '../store.js';
import { ctx, esc, money, nf, hoursText, dateText, icon, chip, GROUP_STYLE, pageHead, emptyBox, field, selectEl, toast, photoImg, formData } from '../ui.js';
import { printRow } from './home.js';

const groupOf = (state, purposeId) => state.purposes.find((p) => p.id === purposeId)?.group || 'other';

function variants(state, modelId) {
  const seen = new Map();
  for (const p of state.prints.filter((x) => x.modelId === modelId && x.finalized)) {
    for (const m of p.materials.filter((m) => m.role === 'model')) {
      const s = state.spools.find((x) => x.id === m.spoolId);
      if (!s) continue;
      const key = `${s.material}|${s.colorName}`;
      if (!seen.has(key)) seen.set(key, { hex: s.hex, label: [s.colorName, s.material].filter(Boolean).join(' ') });
    }
  }
  return [...seen.values()];
}

export function renderCatalog(state) {
  const f = ctx.ui.catFilter;
  const groups = [['all', 'Все'], ...state.purposes.map((p) => [p.id, p.name])];
  const models = state.models
    .filter((m) => f === 'all' || m.defaultPurpose === f)
    .map((m) => ({ m, st: C.modelStats(m.id, state.prints) }))
    .sort((a, b) => ((b.st.last?.date || b.m.created || '') > (a.st.last?.date || a.m.created || '') ? 1 : -1));
  return `
  ${pageHead('Изделия', `Каталог всего, что вы печатали · ${state.models.length} моделей`, '<button class="btn soft" data-act="model-new">' + icon.plus(16) + ' Добавить модель</button>')}
  <div class="row wrap gap8">${groups.map(([k, l]) => `<button class="seg-chip ${k === f ? 'on' : ''}" data-act="cat-filter" data-v="${k}">${esc(l)}</button>`).join('')}</div>
  ${models.length ? `<div class="model-grid">${models.map(({ m, st }) => {
    const g = GROUP_STYLE[groupOf(state, m.defaultPurpose)];
    const purpose = state.purposes.find((p) => p.id === m.defaultPurpose);
    return `<a class="model-card" href="#/model/${m.id}">
      <span class="model-cover" style="background:${g.tint}">${m.photoId ? photoImg(m.photoId, 'cover-img') : icon.cube(54, 1.6)}
        <span class="dots">${variants(state, m.id).slice(0, 5).map((v) => `<i style="background:${esc(v.hex)}"></i>`).join('')}</span></span>
      <span class="stack-6 pad-s">
        <b class="h3">${esc(m.name)}</b>
        ${purpose ? chip(purpose.name, g) : ''}
        <span class="small muted">напечатано ${st.units} шт.</span>
      </span>
    </a>`;
  }).join('')}</div>` : emptyBox('Моделей пока нет — они появятся сами после первой печати.')}`;
}

export function renderModel(state, route) {
  const m = state.models.find((x) => x.id === route.id);
  if (!m) return emptyBox('Модель не найдена.', '<a class="btn soft" href="#/models">К каталогу</a>');
  const st = C.modelStats(m.id, state.prints);
  const g = GROUP_STYLE[groupOf(state, m.defaultPurpose)];
  const prints = state.prints.filter((p) => p.modelId === m.id).sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.id < b.id ? 1 : -1));
  const gallery = prints.flatMap((p) => p.photoIds || []);
  const stat = (l, v) => `<div class="tile"><span>${l}</span><b>${v}</b></div>`;
  return `
  <div class="page-head"><div class="stack-8"><a class="back" href="#/models">${icon.back(16)} Изделия</a><h1>${esc(m.name)}</h1>
    ${m.sourceUrl ? `<a class="link small" href="${esc(m.sourceUrl)}" target="_blank" rel="noopener">${esc(m.sourceUrl)}</a>` : ''}</div>
    <a class="btn primary" href="#/new?model=${m.id}">${icon.repeat(16)} Повторить печать</a></div>
  <div class="detail-grid">
    <div class="stack-20" style="min-width:0">
      <div class="tiles">
        ${stat('Напечатано', `${st.units} шт.`)}
        ${stat('Печатей: успешно / брак', `${st.ok} / ${st.failed}`)}
        ${stat('Средняя себестоимость', st.avgUnit ? money(st.avgUnit) : '—')}
        ${stat('Последняя', st.lastUnit ? money(st.lastUnit) : '—')}
        ${stat('Материала', st.grams >= 1000 ? `${nf(st.grams / 1000, 2)} кг` : `${nf(st.grams, 0)} г`)}
        ${stat('Время печати', hoursText(st.hours))}
      </div>
      <div class="card flush">
        <div class="h3 pad">История печатей</div>
        ${prints.length ? `<div class="table-scroll"><div class="ptable"><div class="pt-head"><span>Дата</span><span>Изделие</span><span>Назначение</span><span>Статус</span><span class="right" title="Полная себестоимость: пластик, электричество, износ принтера и расходники">Себестоимость</span></div>${prints.map((p) => printRow(state, p)).join('')}</div></div>` : '<div class="pad muted">Ещё не печаталась</div>'}
      </div>
      ${variants(state, m.id).length ? `<div class="card stack-8"><div class="h3">Варианты исполнения</div><div class="row wrap gap8">${variants(state, m.id).map((v) => `<span class="var-chip"><i style="background:${esc(v.hex)}"></i>${esc(v.label)}</span>`).join('')}</div></div>` : ''}
      ${gallery.length ? `<div class="card stack-8"><div class="h3">Фото печатей</div><div class="gallery">${gallery.map((id) => photoImg(id, 'gal')).join('')}</div></div>` : ''}
    </div>
    <div class="stack-20">
      <div class="card stack-12">
        <div class="cover-big" style="background:${g.tint}">${m.photoId ? photoImg(m.photoId, 'cover-img') : icon.cube(72, 1.5)}</div>
        <label class="photo-drop small">${icon.camera(22)}<span>${m.photoId ? 'Заменить основное фото' : 'Основное фото'}</span><input type="file" accept="image/*" data-photo-for="model:${m.id}" hidden></label>
      </div>
      <form class="card stack-12" data-form="model" data-id="${m.id}">
        <div class="h3">Карточка модели</div>
        ${field('Название', `<input name="name" value="${esc(m.name)}" required>`)}
        ${field('Назначение по умолчанию', selectEl('defaultPurpose', state.purposes.map((p) => [p.id, p.name]), m.defaultPurpose))}
        ${field('Ссылка на модель', `<input name="sourceUrl" value="${esc(m.sourceUrl)}" placeholder="MakerWorld, Printables…">`)}
        ${field('Описание и настройки', `<textarea name="description" rows="3" placeholder="профиль, высота слоя, заметки">${esc(m.description)}</textarea>`)}
        <button class="btn soft" type="submit">Сохранить</button>
      </form>
    </div>
  </div>`;
}

export const catalogActions = {
  'cat-filter': (el) => { ctx.ui.catFilter = el.dataset.v; ctx.rerender(); },
  'model-new': () => {
    const name = prompt('Название модели');
    if (!name) return;
    const m = store.commit((s) => saveModel(s, { name }));
    ctx.go(`#/model/${m.id}`);
  },
};

export const catalogForms = {
  model: (form, f) => {
    store.commit((s) => saveModel(s, { ...f, id: form.dataset.id }));
    toast('Сохранено');
  },
};
