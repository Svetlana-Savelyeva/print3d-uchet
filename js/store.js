// Состояние приложения, сохранение в браузере (IndexedDB) и все операции учёта.
import * as C from './calc.js';

const DB_NAME = 'print3d-uchet';
const KEY = 'state';

// ---------- IndexedDB ----------
let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('kv');
        req.result.createObjectStore('photos');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}
async function idb(storeName, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(storeName, mode);
    const st = tx.objectStore(storeName);
    const req = fn(st);
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}
export const kv = {
  get: (key) => idb('kv', 'readonly', (s) => s.get(key)),
  put: (key, value) => idb('kv', 'readwrite', (s) => s.put(value, key)),
  del: (key) => idb('kv', 'readwrite', (s) => s.delete(key)),
};
export const photos = {
  put: (id, blob) => idb('photos', 'readwrite', (s) => s.put(blob, id)),
  get: (id) => idb('photos', 'readonly', (s) => s.get(id)),
  del: (id) => idb('photos', 'readwrite', (s) => s.delete(id)),
  keys: () => idb('photos', 'readonly', (s) => s.getAllKeys()),
  clear: () => idb('photos', 'readwrite', (s) => s.clear()),
};

// ---------- Утилиты ----------
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export const DEFAULT_PURPOSES = [
  { id: 'business', name: 'Merino Home', group: 'business' },
  { id: 'sale', name: 'Продажа', group: 'sale' },
  { id: 'home', name: 'Для дома', group: 'personal' },
  { id: 'family', name: 'Ребёнку / семье', group: 'personal' },
  { id: 'gift', name: 'Подарок', group: 'gift' },
  { id: 'test', name: 'Тест / прототип', group: 'test' },
  { id: 'other', name: 'Другое', group: 'other' },
];

export const FAILURE_REASONS = ['Проблема адгезии', 'Влажный филамент', 'Ошибка модели', 'Ошибка настроек', 'Механическая проблема', 'Закончился материал', 'Ошибка пользователя', 'Другое'];

export function emptyState() {
  return {
    version: 1,
    demo: false,
    setupDone: false,
    settings: { currency: '₽', tariff: 7, printerW: 150, extraW: 0, lowStockG: 150, mpFee: 15, packCost: 30 },
    purposes: DEFAULT_PURPOSES.map((p) => ({ ...p })),
    equipment: [],
    spools: [],
    movements: [],
    consumables: [],
    purchases: [],
    models: [],
    prints: [],
    sales: [],
  };
}

// ---------- Хранилище ----------
export const store = {
  state: emptyState(),
  listeners: new Set(),
  async load() {
    try {
      const saved = await idb('kv', 'readonly', (s) => s.get(KEY));
      if (saved && saved.version) this.state = migrate(saved);
      else this.state = null;
    } catch (e) {
      console.error(e);
      this.state = null;
    }
    try { navigator.storage?.persist?.(); } catch (e) { /* не критично */ }
    return this.state;
  },
  async save() {
    await idb('kv', 'readwrite', (s) => s.put(this.state, KEY));
  },
  // Любое изменение проходит через commit: применяем, сохраняем, перерисовываем.
  commit(fn) {
    const result = fn(this.state);
    this.save().catch((e) => alert('Не удалось сохранить данные: ' + e.message));
    this.listeners.forEach((l) => l());
    return result;
  },
  replace(newState) {
    this.state = migrate(newState);
    return this.save().then(() => this.listeners.forEach((l) => l()));
  },
};

export function migrate(s) {
  const base = emptyState();
  return { ...base, ...s, settings: { ...base.settings, ...(s.settings || {}) } };
}

// ---------- Покупки ----------
export function addPurchase(state, f) {
  const cat = C.PURCHASE_CATEGORIES[f.category] || C.PURCHASE_CATEGORIES.other;
  const p = {
    id: uid(),
    date: f.date || today(),
    name: f.name,
    category: f.category,
    kind: f.kind || cat.kind,
    qty: C.num(f.qty) || 1,
    amount: C.round2(C.num(f.amount)),
    shop: f.shop || '',
    comment: f.comment || '',
    link: f.link || null,
  };
  state.purchases.push(p);
  return p;
}

// ---------- Оборудование ----------
export function addEquipment(state, f) {
  const eq = {
    id: uid(),
    name: f.name,
    type: f.type || 'printer',
    brand: f.brand || '',
    model: f.model || '',
    date: f.date || today(),
    price: C.num(f.price),
    extra: C.num(f.extra),
    residual: C.num(f.residual),
    resourceHours: C.num(f.resourceHours),
    initialHours: C.num(f.initialHours),
    watts: C.num(f.watts),
    includeInCost: f.includeInCost !== false && f.includeInCost !== 'no',
    attachTo: f.attachTo || '',
    status: 'active',
    notes: f.notes || '',
    photoId: f.photoId || null,
  };
  state.equipment.push(eq);
  if (eq.price + eq.extra > 0) {
    addPurchase(state, { date: eq.date, name: eq.name, category: 'equipment', amount: eq.price + eq.extra, shop: f.shop, link: { type: 'equipment', id: eq.id } });
  }
  return eq;
}

export function updateEquipment(state, id, f) {
  const eq = state.equipment.find((e) => e.id === id);
  if (!eq) return;
  // Новые значения влияют только на будущие печати: прошлые хранят свои ставки.
  Object.assign(eq, {
    name: f.name ?? eq.name,
    residual: f.residual !== undefined ? C.num(f.residual) : eq.residual,
    resourceHours: f.resourceHours !== undefined ? C.num(f.resourceHours) : eq.resourceHours,
    initialHours: f.initialHours !== undefined ? C.num(f.initialHours) : eq.initialHours,
    watts: f.watts !== undefined ? C.num(f.watts) : eq.watts,
    includeInCost: f.includeInCost !== undefined ? f.includeInCost === true || f.includeInCost === 'yes' : eq.includeInCost,
    attachTo: f.attachTo ?? eq.attachTo,
    status: f.status ?? eq.status,
    notes: f.notes ?? eq.notes,
  });
}

export const printers = (state) => state.equipment.filter((e) => e.type === 'printer' && e.status !== 'retired');

// ---------- Филамент ----------
export function spoolLabel(s) {
  return [s.material, s.line, s.colorName].filter(Boolean).join(' ') + (s.brand ? ` · ${s.brand}` : '');
}

/**
 * Исправляет данные катушки. Цена грамма пересчитывается для будущих печатей;
 * завершённые печати хранят свою цену грамма (snapshot) и не меняются.
 */
export function updateSpool(state, id, f) {
  const s = state.spools.find((x) => x.id === id);
  if (!s) return;
  for (const k of ['brand', 'material', 'line', 'colorName', 'hex', 'shop', 'batch', 'location', 'notes', 'date']) {
    if (f[k] !== undefined) s[k] = f[k];
  }
  if (f.tareG !== undefined) s.tareG = C.num(f.tareG) || null;
  if (f.price !== undefined) s.price = C.num(f.price);
  if (f.delivery !== undefined) s.delivery = C.num(f.delivery);
  if (f.netG !== undefined && C.num(f.netG) > 0 && C.num(f.netG) !== s.netG) {
    const diff = C.num(f.netG) - s.netG;
    s.netG = C.num(f.netG);
    const buy = state.movements.find((m) => m.spoolId === id && m.type === 'purchase');
    if (buy) buy.grams += diff;
  }
  s.costPerG = C.costPerGram(s.price, s.delivery, s.netG);
  s.label = spoolLabel(s);
  // Покупка в журнале покупок пересчитывается по всем катушкам этого чека.
  const pur = state.purchases.find((p) => p.link?.type === 'spools' && p.link.ids.includes(id));
  if (pur) {
    const group = state.spools.filter((x) => pur.link.ids.includes(x.id));
    pur.amount = C.round2(group.reduce((a, x) => a + C.num(x.price) + C.num(x.delivery), 0));
    pur.name = `Филамент ${spoolLabel(group[0])}${group.length > 1 ? ` × ${group.length}` : ''}`;
    pur.date = s.date;
    pur.shop = s.shop;
  }
}

export function addSpools(state, f) {
  const count = Math.max(1, Math.round(C.num(f.count) || 1));
  const netG = C.num(f.netG) || 1000;
  const price = C.num(f.price);
  const delivery = C.num(f.delivery);
  const perSpoolDelivery = delivery / count;
  const date = f.date || today();
  const created = [];
  for (let i = 0; i < count; i++) {
    const s = {
      id: uid(),
      brand: f.brand || '',
      material: f.material || 'PLA',
      line: f.line || '',
      colorName: f.colorName || '',
      hex: f.hex || '#cccccc',
      netG,
      tareG: C.num(f.tareG) || null,
      price,
      delivery: C.round2(perSpoolDelivery),
      costPerG: C.costPerGram(price, perSpoolDelivery, netG),
      date,
      shop: f.shop || '',
      batch: f.batch || '',
      location: f.location || '',
      notes: f.notes || '',
      closed: false,
    };
    s.label = spoolLabel(s);
    state.spools.push(s);
    state.movements.push({ id: uid(), spoolId: s.id, date, type: 'purchase', grams: netG, comment: 'Покупка' });
    const left = f.left !== undefined && f.left !== '' ? C.num(f.left) : null;
    if (left !== null && left < netG) {
      state.movements.push({ id: uid(), spoolId: s.id, date, type: 'initial', grams: -(netG - left), comment: 'Израсходовано до начала учёта' });
    }
    created.push(s);
  }
  if (f.skipPurchase !== true && price + delivery > 0) {
    addPurchase(state, {
      date,
      name: `Филамент ${spoolLabel(created[0])}${count > 1 ? ` × ${count}` : ''}`,
      category: 'filament',
      qty: count,
      amount: price * count + delivery,
      shop: f.shop,
      link: { type: 'spools', ids: created.map((s) => s.id) },
    });
  }
  return created;
}

export function weighSpool(state, spoolId, reading, date) {
  const s = state.spools.find((x) => x.id === spoolId);
  if (!s || !s.tareG) throw new Error('Для взвешивания нужен вес пустой катушки');
  const actual = C.round2(C.num(reading) - s.tareG);
  const left = C.spoolStats(s, state.movements).left;
  const diff = C.round2(actual - left);
  if (diff !== 0) {
    state.movements.push({ id: uid(), spoolId, date: date || today(), type: 'adjust', grams: diff, comment: `Взвешивание: весы ${C.fmtNum(C.num(reading))} г − катушка ${C.fmtNum(s.tareG)} г = ${C.fmtNum(actual)} г` });
  }
  return diff;
}

export function closeSpool(state, spoolId) {
  const s = state.spools.find((x) => x.id === spoolId);
  if (!s) return;
  const left = C.spoolStats(s, state.movements).left;
  if (left > 0) state.movements.push({ id: uid(), spoolId, date: today(), type: 'writeoff', grams: -left, comment: 'Остаток катушки списан' });
  s.closed = true;
}

// ---------- Расходники ----------
export function addConsumable(state, f) {
  const c = {
    id: uid(),
    name: f.name,
    price: C.num(f.price),
    mode: f.mode || 'money',
    life: C.num(f.life),
    activeFrom: f.date || today(),
    activeTo: '',
    notes: f.notes || '',
  };
  state.consumables.push(c);
  if (c.price > 0) addPurchase(state, { date: c.activeFrom, name: c.name, category: f.category || 'consumable', amount: c.price, shop: f.shop, link: { type: 'consumable', id: c.id } });
  return c;
}

export function retireConsumable(state, id) {
  const c = state.consumables.find((x) => x.id === id);
  if (c) c.activeTo = today();
}

// ---------- Модели ----------
export function saveModel(state, f) {
  let m = f.id ? state.models.find((x) => x.id === f.id) : null;
  if (!m) {
    m = { id: uid(), created: today(), photoId: null };
    state.models.push(m);
  }
  Object.assign(m, {
    name: f.name ?? m.name,
    category: f.category ?? m.category ?? '',
    description: f.description ?? m.description ?? '',
    sourceUrl: f.sourceUrl ?? m.sourceUrl ?? '',
    defaultPurpose: f.defaultPurpose ?? m.defaultPurpose ?? 'business',
    notes: f.notes ?? m.notes ?? '',
  });
  if (f.photoId) m.photoId = f.photoId;
  return m;
}

export function findOrCreateModel(state, { modelId, modelName, purposeId }) {
  if (modelId) return state.models.find((m) => m.id === modelId);
  const name = (modelName || '').trim() || 'Без названия';
  const existing = state.models.find((m) => m.name.toLowerCase() === name.toLowerCase());
  return existing || saveModel(state, { name, defaultPurpose: purposeId });
}

// ---------- Печати ----------
function costInput(state, p, excludeId) {
  const printer = state.equipment.find((e) => e.id === p.printerId) || null;
  return {
    date: p.date,
    hours: p.hours,
    kwhActual: p.kwhActual,
    extraCost: p.extraCost,
    extraLabel: p.extraLabel,
    printer,
    printerW: printer?.watts || state.settings.printerW,
    equipment: state.equipment,
    consumables: state.consumables,
    prints: state.prints.filter((x) => x.id !== excludeId),
    settings: state.settings,
    materials: (p.materials || []).map((m) => ({ ...m, spool: state.spools.find((s) => s.id === m.spoolId) })),
  };
}

/** Предварительный расчёт без изменений склада (для формы и «Рассчитать варианты»). */
export function previewCost(state, draft) {
  return C.computeCost(costInput(state, draft, draft.id));
}

/** Создаёт печать в статусе «печатается»: склад и начисления не трогаются. */
export function startPrint(state, f) {
  const model = findOrCreateModel(state, f);
  const p = {
    id: uid(),
    modelId: model.id,
    printerId: f.printerId,
    date: f.date || today(),
    status: 'printing',
    finalized: false,
    hours: C.num(f.hours),
    kwhActual: C.num(f.kwhActual) || null,
    extraCost: C.num(f.extraCost) || 0,
    extraLabel: f.extraLabel || '',
    qty: Math.max(1, Math.round(C.num(f.qty) || 1)),
    purposeId: f.purposeId,
    analogPrice: C.num(f.analogPrice) || null,
    materials: f.materials,
    comment: f.comment || '',
    photoIds: f.photoIds || [],
  };
  state.prints.push(p);
  return p;
}

/**
 * Завершает печать: списывает материал со склада, считает себестоимость и замораживает её (snapshot).
 * f.status: done | partial | failed
 */
export function finalizePrint(state, f) {
  let p = f.id ? state.prints.find((x) => x.id === f.id) : null;
  if (!p) p = startPrint(state, f);
  if (p.finalized) throw new Error('Печать уже завершена');
  Object.assign(p, {
    printerId: f.printerId ?? p.printerId,
    date: f.date || p.date,
    hours: f.hours !== undefined ? C.num(f.hours) : p.hours,
    kwhActual: f.kwhActual !== undefined ? C.num(f.kwhActual) || null : p.kwhActual,
    extraCost: f.extraCost !== undefined ? C.num(f.extraCost) : p.extraCost,
    qty: f.qty !== undefined ? Math.max(1, Math.round(C.num(f.qty))) : p.qty,
    purposeId: f.purposeId ?? p.purposeId,
    analogPrice: f.analogPrice !== undefined ? C.num(f.analogPrice) || null : p.analogPrice,
    materials: f.materials ?? p.materials,
    comment: f.comment ?? p.comment,
  });
  const status = f.status || 'done';
  const goodQty = status === 'done' ? p.qty : status === 'failed' ? 0 : Math.min(p.qty, Math.max(0, Math.round(C.num(f.goodQty))));

  const cost = C.computeCost(costInput(state, p, p.id));
  p.materials = cost.materials;
  p.charges = cost.charges;
  p.totals = cost.totals;
  p.split = C.splitByQuality(cost.totals.full, cost.totals.direct + cost.totals.ops, p.qty, goodQty);
  p.status = status;
  p.failureReason = status === 'done' ? '' : f.failureReason || '';
  p.outputs = goodQty > 0 ? [{ purposeId: p.purposeId, qty: goodQty, analogPrice: purposeGroupOf(state, p.purposeId) === 'business' ? p.analogPrice : null }] : [];
  p.snapshot = {
    at: new Date().toISOString(),
    tariff: state.settings.tariff,
    printerW: state.settings.printerW,
    extraW: state.settings.extraW,
    formula: 1,
  };
  p.finalized = true;

  for (const m of p.materials) {
    state.movements.push({ id: uid(), spoolId: m.spoolId, date: p.date, type: status === 'failed' ? 'failure' : 'print', grams: -m.grams, printId: p.id, comment: modelName(state, p.modelId) });
  }
  return p;
}

const purposeGroupOf = (state, id) => state.purposes.find((x) => x.id === id)?.group || 'other';
export const modelName = (state, id) => state.models.find((m) => m.id === id)?.name || 'Без названия';

export function deletePrint(state, id) {
  const p = state.prints.find((x) => x.id === id);
  if (!p) return;
  if (state.sales.some((s) => s.printId === id)) throw new Error('Сначала удалите продажи этой печати');
  if (p.finalized) {
    // Сторно: склад возвращается отдельными записями, история движений не теряется.
    for (const m of p.materials) {
      state.movements.push({ id: uid(), spoolId: m.spoolId, date: today(), type: 'reverse', grams: m.grams, printId: p.id, comment: `Отмена печати «${modelName(state, p.modelId)}» от ${p.date}` });
    }
  }
  state.prints = state.prints.filter((x) => x.id !== id);
}

// ---------- Продажи ----------
const soldQty = (state, printId) => state.sales.filter((s) => s.printId === printId).reduce((a, s) => a + s.qty, 0);

export function sellableQty(state, printId) {
  const p = state.prints.find((x) => x.id === printId);
  if (!p || !p.finalized) return 0;
  return Math.max(0, p.split.good - soldQty(state, printId));
}

export function recordSale(state, f) {
  const p = state.prints.find((x) => x.id === f.printId);
  if (!p || !p.finalized) throw new Error('Продать можно только изделия из завершённой печати');
  const qty = Math.round(C.num(f.qty));
  if (qty < 1 || qty > sellableQty(state, p.id)) throw new Error('Столько изделий в этой печати нет');
  const mp = f.channel === 'mp';
  // Проданные штуки переходят в назначение «Продажа»; себестоимость не меняется.
  // Сначала берём изделия, которые уже печатались на продажу и ещё не проданы.
  const saleReady = (p.outputs.find((o) => o.purposeId === 'sale')?.qty || 0) - soldQty(state, p.id);
  let need = Math.max(0, qty - Math.max(0, saleReady));
  const movedFrom = [];
  for (const o of p.outputs.filter((o) => o.purposeId !== 'sale')) {
    const take = Math.min(o.qty, need);
    if (!take) continue;
    o.qty -= take;
    need -= take;
    movedFrom.push({ purposeId: o.purposeId, qty: take, analogPrice: o.analogPrice });
  }
  p.outputs = p.outputs.filter((o) => o.qty > 0);
  const moved = movedFrom.reduce((a, m) => a + m.qty, 0);
  if (moved) {
    const saleOut = p.outputs.find((o) => o.purposeId === 'sale');
    if (saleOut) saleOut.qty += moved;
    else p.outputs.push({ purposeId: 'sale', qty: moved, analogPrice: null });
  }

  const sale = {
    id: uid(),
    date: f.date || today(),
    printId: p.id,
    modelId: p.modelId,
    qty,
    price: C.num(f.price),
    channel: mp ? 'mp' : 'own',
    feePct: mp ? C.num(state.settings.mpFee) : 0,
    packCost: mp ? C.num(state.settings.packCost) : 0,
    unitCost: p.split.unit,
    unitContribution: p.split.unitContribution,
    movedFrom,
    comment: f.comment || '',
  };
  state.sales.push(sale);
  return sale;
}

export function deleteSale(state, id) {
  const s = state.sales.find((x) => x.id === id);
  if (!s) return;
  const p = state.prints.find((x) => x.id === s.printId);
  if (p) {
    const saleOut = p.outputs.find((o) => o.purposeId === 'sale');
    const moved = s.movedFrom.reduce((a, m) => a + m.qty, 0);
    if (saleOut) saleOut.qty -= moved;
    for (const m of s.movedFrom) {
      const o = p.outputs.find((x) => x.purposeId === m.purposeId);
      if (o) o.qty += m.qty;
      else p.outputs.push({ ...m });
    }
    p.outputs = p.outputs.filter((o) => o.qty > 0);
  }
  state.sales = state.sales.filter((x) => x.id !== id);
}
