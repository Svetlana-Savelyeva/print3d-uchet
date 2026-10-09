// Общие элементы интерфейса: форматирование, иконки, мелкие компоненты.
import { store } from './store.js';
import { round2 } from './calc.js';

export const ctx = {
  ui: { period: 'month', draft: null, printsFilter: 'all', catFilter: 'all' },
  rerender: () => {},
  go: (hash) => { location.hash = hash; },
};

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const cur = () => store.state?.settings?.currency || '₽';
export const money = (n) => `${round2(n || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur()}`;
export const money0 = (n) => `${Math.round(n || 0).toLocaleString('ru-RU')} ${cur()}`;
export const grams = (n) => `${Math.round(n || 0).toLocaleString('ru-RU')} г`;
export const nf = (n, d = 2) => Number(n || 0).toLocaleString('ru-RU', { maximumFractionDigits: d });
export const hoursText = (h) => {
  const t = Math.round((h || 0) * 60);
  const hh = Math.floor(t / 60), mm = t % 60;
  return hh ? `${hh} ч${mm ? ` ${mm} мин` : ''}` : `${mm} мин`;
};
export const dateText = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
export const dateShort = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : '');

const svg = (inner, size = 20, sw = 2) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
export const icon = {
  plus: (s) => svg('<path d="M12 5v14M5 12h14"/>', s, 2.4),
  cube: (s, sw) => svg('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>', s, sw),
  chart: (s) => svg('<path d="M4 19h16M7 15V9M12 15V5M17 15v-4"/>', s),
  wallet: (s) => svg('<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M16 12.5h2M3 10h18"/>', s),
  trend: (s) => svg('<path d="M4 16l5-5 4 4 7-7"/><path d="M15 8h5v5"/>', s),
  alert: (s) => svg('<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>', s),
  camera: (s) => svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', s, 1.8),
  lock: (s) => svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', s),
  clock: (s) => svg('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>', s),
  search: (s) => svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>', s),
  back: (s) => svg('<path d="M15 5l-7 7 7 7"/>', s, 2.2),
  close: (s) => svg('<path d="M6 6l12 12M18 6L6 18"/>', s, 2.2),
  home: (s) => svg('<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-6h4v6"/>', s),
  list: (s) => svg('<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>', s),
  spool: (s) => svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/>', s),
  more: (s) => svg('<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>', s, 2.4),
  trash: (s) => svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', s),
  scale: (s) => svg('<path d="M5 20h14M12 4v16M6 8h12M6 8l-3 6h6zM18 8l-3 6h6z"/>', s),
  repeat: (s) => svg('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>', s),
  download: (s) => svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', s),
  upload: (s) => svg('<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>', s),
  gear: (s) => svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', s, 1.6),
  printer: (s) => svg('<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z"/>', s),
  box: (s) => svg('<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>', s),
  receipt: (s) => svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>', s),
  check: (s) => svg('<path d="M5 12l5 5 9-10"/>', s, 2.4),
};

// Цвета назначений: группа → оттенок плашки.
export const GROUP_STYLE = {
  business: { bg: '#E8EBFC', fg: '#3C4DC4', bar: '#4F62E0', tint: 'linear-gradient(135deg,#6F86F2,#4458D6)' },
  sale: { bg: '#F1ECFC', fg: '#5A3FB8', bar: '#6440C8', tint: 'linear-gradient(135deg,#8E6FE8,#6440C8)' },
  personal: { bg: '#E4F6EC', fg: '#1F7A4D', bar: '#2F9C6C', tint: 'linear-gradient(135deg,#4CBF8C,#2F9C6C)' },
  gift: { bg: '#FFF3E3', fg: '#A35A12', bar: '#D9775B', tint: 'linear-gradient(135deg,#E99A4C,#D9775B)' },
  test: { bg: '#E3F3F7', fg: '#1F6F87', bar: '#2F8BA8', tint: 'linear-gradient(135deg,#3FAFC2,#2F8BA8)' },
  other: { bg: '#F3F5FB', fg: '#4A5270', bar: '#8B93AD', tint: 'linear-gradient(135deg,#9AA3BD,#6F7894)' },
};

export const STATUS = {
  printing: { label: 'Печатается', bg: '#FFF3E3', fg: '#A35A12' },
  done: { label: 'Успешно', bg: '#E4F6EC', fg: '#1F7A4D' },
  partial: { label: 'Частичный брак', bg: '#FFF3E3', fg: '#A35A12' },
  failed: { label: 'Брак', bg: '#FDECEA', fg: '#B23A2F' },
};

export const chip = (label, st) => `<span class="chip" style="background:${st.bg};color:${st.fg}">${esc(label)}</span>`;

export function purposeChip(state, purposeId) {
  const p = state.purposes.find((x) => x.id === purposeId);
  if (!p) return '';
  return chip(p.name, GROUP_STYLE[p.group] || GROUP_STYLE.other);
}

export const swatch = (hex, size = 30) => `<span class="swatch" style="width:${size}px;height:${size}px;background:${esc(hex || '#ccc')}"></span>`;

export function pageHead(title, sub, right = '') {
  return `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<div class="muted">${sub}</div>` : ''}</div>${right}</div>`;
}

export const emptyBox = (text, action = '') => `<div class="card empty"><div class="muted">${text}</div>${action}</div>`;

// Модальные окна и уведомления.
export function openModal(html) {
  const m = document.getElementById('modal');
  m.innerHTML = `<div class="modal-back" data-act="modal-close"></div><div class="modal-card" role="dialog" aria-modal="true">${html}</div>`;
  m.hidden = false;
  document.body.classList.add('no-scroll');
  m.querySelector('input:not([type=hidden]),select,textarea')?.focus();
}
export function closeModal() {
  const m = document.getElementById('modal');
  m.hidden = true;
  m.innerHTML = '';
  document.body.classList.remove('no-scroll');
}
export const modalHead = (title) => `<div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-act="modal-close" aria-label="Закрыть">${icon.close()}</button></div>`;

let toastTimer;
export function toast(text, kind = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), 3200);
}

// Поля форм.
export const field = (label, input, hint = '') => `<label class="field"><span>${label}</span>${input}${hint ? `<small>${hint}</small>` : ''}</label>`;
export const inputEl = (name, value = '', attrs = '') => `<input name="${name}" value="${esc(value)}" ${attrs}>`;
export const numInput = (name, value = '', attrs = '') => `<input name="${name}" value="${esc(value)}" inputmode="decimal" autocomplete="off" ${attrs}>`;
export const selectEl = (name, options, value, attrs = '') =>
  `<select name="${name}" ${attrs}>${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

export function formData(form) {
  const o = {};
  for (const [k, v] of new FormData(form).entries()) o[k] = typeof v === 'string' ? v.trim() : v;
  return o;
}

// Фото: сжимаем перед сохранением, чтобы база не разрасталась.
export async function compressImage(file, max = 1400) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.82));
}
export const photoImg = (id, cls = 'photo') => (id ? `<img class="${cls}" data-photo="${esc(id)}" alt="">` : '');
