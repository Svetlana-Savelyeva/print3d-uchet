// «Режим съёмки»: размывает суммы, чтобы на видео нельзя было понять себестоимость и наценку.
// Работает поверх готовой страницы: находит в тексте суммы с ₽ и денежные числа (с копейками)
// и оборачивает их в <span class="m">. Сами данные не меняются.
const KEY = 'p3d-filming';
const MONEY = /([−+-]?\s?\d[\d\s  ]*(?:,\d+)?\s?₽(?:\s?\/\s?[а-яёa-z·.]+)?)|(\d+,\d{2}(?!\d))/gi;

export const filming = {
  get on() { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } },
  set(v) {
    try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* не критично */ }
    apply();
  },
};

function maskText(node) {
  const text = node.nodeValue;
  MONEY.lastIndex = 0;
  if (!MONEY.test(text)) return;
  MONEY.lastIndex = 0;
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const m of text.matchAll(MONEY)) {
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
    const s = document.createElement('span');
    s.className = 'm';
    s.textContent = m[0];
    frag.appendChild(s);
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  node.parentNode.replaceChild(frag, node);
}

function mask(root) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const p = n.parentElement;
      if (!p || p.closest('.m, script, style, textarea, option')) return NodeFilter.FILTER_REJECT;
      return /\d/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(maskText);
}

let observer = null;
let scheduled = false;
const targets = () => ['app', 'modal', 'toast'].map((id) => document.getElementById(id)).filter(Boolean);

export function apply() {
  const on = filming.on;
  document.body.classList.toggle('filming', on);
  document.querySelectorAll('[data-act="film"]').forEach((b) => b.setAttribute('aria-pressed', String(on)));
  if (on) {
    targets().forEach(mask);
    if (!observer) {
      observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => { scheduled = false; if (filming.on) targets().forEach(mask); });
      });
      targets().forEach((t) => observer.observe(t, { childList: true, subtree: true, characterData: true }));
    }
  } else if (observer) {
    observer.disconnect();
    observer = null;
  }
}
