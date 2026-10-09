// Каркас: маршруты, разметка страницы, обработка нажатий и форм.
import { store, photos } from './store.js';
import { ctx, esc, icon, closeModal, formData, toast } from './ui.js';
import { renderHome } from './views/home.js';
import { renderPrints, renderPrint, printActions, printForms, salePreview, attachPhoto } from './views/prints.js';
import { renderNewPrint, initDraft, newPrintActions, newPrintForms, onDraftInput, refreshLive } from './views/newprint.js';
import { renderCatalog, renderModel, catalogActions, catalogForms } from './views/catalog.js';
import { renderSpools, renderSpool, spoolActions, spoolForms } from './views/spools.js';
import { renderSync, syncActions, syncForms, syncPill, paintSyncPill } from './views/syncview.js';
import { sync, startSync, fetchPhoto } from './sync.js';
import { renderMore, renderEquipment, renderConsumables, renderPurchases, renderSettings, renderBackup, renderSetup, moreActions, moreForms, moreChange } from './views/more.js';

const NAV = [
  ['home', 'Главная', icon.home],
  ['prints', 'Печати', icon.list],
  ['models', 'Изделия', icon.cube],
  ['spools', 'Филаменты', icon.spool],
  ['more', 'Ещё', icon.more],
];
const SECTION = { print: 'prints', new: 'new', model: 'models', spool: 'spools', equipment: 'more', consumables: 'more', purchases: 'more', settings: 'more', backup: 'more', sync: 'more' };

const VIEWS = {
  home: renderHome,
  prints: renderPrints,
  print: renderPrint,
  new: renderNewPrint,
  models: renderCatalog,
  model: renderModel,
  spools: renderSpools,
  spool: renderSpool,
  more: renderMore,
  equipment: renderEquipment,
  consumables: renderConsumables,
  purchases: renderPurchases,
  settings: renderSettings,
  backup: renderBackup,
  setup: renderSetup,
  sync: renderSync,
};

const actions = { ...syncActions, ...printActions, ...newPrintActions, ...catalogActions, ...spoolActions, ...moreActions,
  period: (el) => { ctx.ui.period = el.dataset.v; render(); },
  'modal-close': () => closeModal(),
};
const forms = { ...syncForms, ...printForms, ...newPrintForms, ...catalogForms, ...spoolForms, ...moreForms };

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '') || 'home';
  const [path, qs] = raw.split('?');
  const [name, id] = path.split('/');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  return { name: VIEWS[name] ? name : 'home', id, query, key: raw };
}

let lastKey = '';
function render() {
  const state = store.state;
  let route = parseRoute();
  if (!state.setupDone && route.name !== 'setup' && route.name !== 'sync') { location.replace('#/setup'); return; }
  if (route.name === 'new' && (!ctx.ui.draft || ctx.ui.draftKey !== route.key)) {
    ctx.ui.draft = initDraft(state, route.query);
    ctx.ui.draftKey = route.key;
  }
  const section = SECTION[route.name] || route.name;
  const content = VIEWS[route.name](state, route);
  const app = document.getElementById('app');
  const keepScroll = route.key === lastKey;
  const y = window.scrollY;
  app.innerHTML = route.name === 'setup' || (route.name === 'sync' && !state.setupDone) ? `<main class="wrap">${content}</main>` : `
    <header class="topbar">
      <div class="brand"><a href="#/home" class="logo" aria-label="Главная">3D</a><span><a href="#/home"><b>Мастерская 3D</b></a><span id="sync-pill">${syncPill()}</span></span></div>
      <nav class="nav" aria-label="Разделы">${NAV.map(([k, l]) => `<a href="#/${k}" class="${k === section ? 'on' : ''}">${l}</a>`).join('')}</nav>
      <a class="btn primary new-btn" href="#/new">${icon.plus(18)} Новая печать</a>
    </header>
    <main class="wrap">${content}</main>
    <nav class="tabbar" aria-label="Разделы">
      ${NAV.slice(0, 2).map(tab).join('')}
      <a class="tab-new" href="#/new" aria-label="Новая печать">${icon.plus(26)}</a>
      ${NAV.slice(2, 4).map(tab).join('')}
    </nav>`;
  function tab([k, l, ic]) { return `<a href="#/${k}" class="${k === section ? 'on' : ''}">${ic(22)}<span>${l}</span></a>`; }
  if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
  lastKey = route.key;
  if (route.name === 'new') refreshLive(state);
  loadPhotos();
}

const photoUrls = new Map();
async function loadPhotos() {
  for (const img of document.querySelectorAll('img[data-photo]')) {
    const id = img.dataset.photo;
    if (!photoUrls.has(id)) {
      let blob = await photos.get(id);
      if (!blob) blob = await fetchPhoto(id).catch(() => null);
      if (!blob) continue;
      photoUrls.set(id, URL.createObjectURL(blob));
    }
    img.src = photoUrls.get(id);
  }
}

// ---------- События ----------
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  Promise.resolve(fn(el)).catch((err) => toast(err.message, 'err'));
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const fn = forms[form.dataset.form];
  if (fn) Promise.resolve(fn(form, formData(form))).catch((err) => toast(err.message, 'err'));
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.closest('#np')) {
    const res = onDraftInput(store.state, t);
    if (res === 'rerender') render(); else refreshLive(store.state);
    return;
  }
  const sale = t.closest('form[data-live="sale"]');
  if (sale) {
    const p = store.state.prints.find((x) => x.id === sale.dataset.id);
    document.getElementById('sale-preview').innerHTML = salePreview(p, formData(sale));
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.photoFor && t.files[0]) {
    attachPhoto(t.dataset.photoFor, t.files[0]).catch((err) => toast('Фото не сохранилось: ' + err.message, 'err'));
    return;
  }
  if (t.dataset.actChange) { moreChange[t.dataset.actChange]?.(t); return; }
  if (t.dataset.nav === 'purpose') {
    const r = parseRoute();
    const q = new URLSearchParams(r.query);
    if (t.value) q.set('purpose', t.value); else q.delete('purpose');
    location.hash = `#/prints?${q}`;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.getElementById('modal').hidden) closeModal();
});

window.addEventListener('hashchange', () => { closeModal(); render(); });

ctx.rerender = render;
ctx.go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };

(async function start() {
  const loaded = await store.load();
  if (!loaded) {
    const { emptyState } = await import('./store.js');
    store.state = emptyState();
  }
  store.listeners.add(render);
  sync.listeners.add(() => { paintSyncPill(); if (parseRoute().name === 'sync') render(); });
  render();
  startSync();
  registerUpdates();
})();

// Обновления: при выходе новой версии приложение тихо перезагружается само.
function registerUpdates() {
  if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    // Не перебиваем ввод: если открыта форма новой печати или окно, перезагрузимся позже.
    const busy = () => location.hash.startsWith('#/new') || !document.getElementById('modal').hidden;
    if (!busy()) location.reload();
    else window.addEventListener('hashchange', function once() { if (!busy()) { window.removeEventListener('hashchange', once); location.reload(); } });
  });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 30 * 60 * 1000);
  }).catch(() => {});
}
