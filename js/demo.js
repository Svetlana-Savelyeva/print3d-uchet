// Демо-данные: строятся теми же операциями, что и настоящие записи, поэтому все цифры согласованы.
import { emptyState, addEquipment, addPurchase, addConsumable, addSpools, saveModel, finalizePrint, startPrint, weighSpool, recordSale } from './store.js';

export function buildDemo() {
  const s = emptyState();
  s.demo = true;
  s.setupDone = true;

  const printer = addEquipment(s, { name: 'Bambu Lab P1S', type: 'printer', price: 16500, extra: 0, resourceHours: 5000, initialHours: 0, watts: 150, includeInCost: 'yes', date: '2026-07-10' });
  addPurchase(s, { date: '2026-07-12', name: 'Весы, шпатель, бокорезы', category: 'tools', amount: 2500, shop: 'Маркетплейс' });
  addConsumable(s, { name: 'Сопло 0,4 мм', price: 900, mode: 'hour', life: 1500, date: '2026-07-10' });
  addConsumable(s, { name: 'Силикагель', price: 350, mode: 'money', category: 'silica', date: '2026-09-02' });

  const sp = (f) => addSpools(s, f)[0];
  const C = sp({ material: 'PLA', line: 'Matte', brand: 'Bambu', colorName: 'Чёрный', hex: '#2A2B30', price: 1120, tareG: 250, date: '2026-08-20', shop: 'Bambu Store' });
  const D = sp({ material: 'PLA', line: 'Basic', brand: 'Bambu', colorName: 'Зелёный', hex: '#4FA36A', price: 1250, tareG: 250, date: '2026-09-02', shop: 'Bambu Store' });
  const B = sp({ material: 'PETG', brand: 'Другой бренд', colorName: 'Белый', hex: '#EDEDE8', price: 1080, tareG: 230, date: '2026-09-02', shop: 'Маркетплейс' });
  const E = sp({ material: 'TPU', line: '95A', brand: '', colorName: 'Синий', hex: '#3E6FD8', price: 1450, netG: 500, date: '2026-09-10', shop: 'Маркетплейс' });
  const A = sp({ material: 'PETG', line: 'Basic', brand: 'Bambu', colorName: 'Белый', hex: '#F4F4F2', price: 1370, tareG: 250, date: '2026-09-24', shop: 'Bambu Store' });
  const F = sp({ material: 'PETG', line: 'HF', brand: 'Bambu', colorName: 'Серый', hex: '#9AA0AA', price: 1300, tareG: 250, date: '2026-10-07', shop: 'Bambu Store' });

  const M = (name, purpose, url = '') => saveModel(s, { name, defaultPurpose: purpose, sourceUrl: url });
  const stand = M('Подставка для телефона', 'sale');
  const cat = M('Брелок-котик', 'sale');
  const tea = M('Коробочка для чая', 'home');
  const feet = M('Ножки для полки', 'business');
  const hook = M('Крючок для полотенец', 'business');
  const org = M('Органайзер для ниток', 'gift');
  const holder = M('Держатель пульта', 'business');
  const dino = M('Динозавр на шарнирах', 'family');

  const P = (f) => finalizePrint(s, { printerId: printer.id, status: 'done', ...f });
  const m = (spool, grams, role = 'model') => ({ spoolId: spool.id, grams, role });

  const p1 = P({ modelId: stand.id, date: '2026-08-25', hours: 4, qty: 3, purposeId: 'sale', materials: [m(C, 112), m(C, 8, 'support')] });
  const p2 = P({ modelId: cat.id, date: '2026-09-05', hours: 2, qty: 5, purposeId: 'sale', materials: [m(C, 40)] });
  P({ modelId: tea.id, date: '2026-09-12', hours: 6.5, qty: 1, purposeId: 'home', materials: [m(D, 205), m(D, 7, 'purge')] });
  P({ modelId: tea.id, date: '2026-09-15', hours: 6.5, qty: 1, purposeId: 'home', materials: [m(B, 220)] });
  P({ modelId: feet.id, date: '2026-09-18', hours: 3, qty: 8, purposeId: 'business', analogPrice: 60, materials: [m(E, 60)] });
  P({ modelId: hook.id, date: '2026-09-20', hours: 3, qty: 4, purposeId: 'business', analogPrice: 120, materials: [m(D, 96)] });
  P({ modelId: tea.id, date: '2026-09-27', hours: 0.5, qty: 1, purposeId: 'home', status: 'failed', failureReason: 'Проблема адгезии', materials: [m(D, 25)] });
  P({ modelId: org.id, date: '2026-10-01', hours: 4.6, qty: 1, purposeId: 'gift', materials: [m(A, 125), m(A, 6, 'support')] });
  P({ modelId: holder.id, date: '2026-10-03', hours: 9, qty: 4, purposeId: 'business', analogPrice: 450, materials: [m(D, 286), m(D, 16, 'support')] });
  P({ modelId: dino.id, date: '2026-10-04', hours: 5, qty: 2, purposeId: 'family', status: 'partial', goodQty: 1, failureReason: 'Ошибка настроек', materials: [m(C, 98)] });
  P({ modelId: hook.id, date: '2026-10-05', hours: 3, qty: 4, purposeId: 'business', analogPrice: 120, materials: [m(C, 96)] });
  weighSpool(s, D.id, 607, '2026-10-06');
  P({ modelId: holder.id, date: '2026-10-08', hours: 4.5, qty: 2, purposeId: 'business', analogPrice: 450, materials: [m(A, 112), m(A, 9, 'support'), m(A, 5, 'purge')] });
  startPrint(s, { modelId: tea.id, printerId: printer.id, date: '2026-10-09', hours: 6.5, qty: 1, purposeId: 'home', materials: [m(F, 212)] });

  recordSale(s, { printId: p1.id, qty: 3, price: 350, channel: 'own', date: '2026-09-20' });
  recordSale(s, { printId: p2.id, qty: 5, price: 150, channel: 'mp', date: '2026-10-02' });
  return s;
}
