// Запуск: node tests/calc.test.mjs
import assert from 'node:assert/strict';
import { computeCost, splitByQuality, priceOptions, saleResult, spoolStats, round2, payback, dashboard, periodRange } from '../js/calc.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('✓', name); };

const settings = { tariff: 7, printerW: 150, extraW: 0, mpFee: 15, packCost: 30 };
const printer = { id: 'p1', name: 'Bambu P1S', price: 60000, extra: 0, residual: 0, resourceHours: 5000, includeInCost: true };
const nozzle = { id: 'n1', name: 'Сопло', price: 900, mode: 'hour', life: 1800, activeFrom: '2026-01-01' };
const spool = { id: 's1', name: 'PETG Белый A', costPerG: 1.37 };

const example = () => computeCost({
  date: '2026-10-08', hours: 4.5, printer, equipment: [printer], consumables: [nozzle], prints: [], settings,
  materials: [{ spool, role: 'model', grams: 112 }, { spool, role: 'support', grams: 9 }, { spool, role: 'purge', grams: 5 }],
});

test('пример из архитектуры: прямая 177,35 ₽, полная 233,60 ₽', () => {
  const r = example();
  assert.equal(r.totals.material, 172.62);
  assert.equal(r.totals.electricity, 4.73);
  assert.equal(r.totals.direct, 177.35);
  assert.equal(r.totals.amortization, 54);
  assert.equal(r.totals.ops, 2.25);
  assert.equal(r.totals.full, 233.6);
});

test('расшифровка сходится до копейки', () => {
  const r = example();
  const lines = r.materials.reduce((a, m) => a + m.amount, 0) + r.charges.reduce((a, c) => a + c.amount, 0);
  assert.equal(round2(lines), r.totals.full);
});

test('фактические кВт·ч заменяют расчёт', () => {
  const r = computeCost({ date: '2026-10-08', hours: 4.5, kwhActual: 1, printer, equipment: [], consumables: [], prints: [], settings, materials: [] });
  assert.equal(r.totals.electricity, 7);
});

test('амортизация не превышает стоимость принтера', () => {
  const small = { ...printer, price: 100, resourceHours: 10 }; // 10 ₽/ч, база 100 ₽
  const prev = [{ finalized: true, charges: [{ sourceId: 'p1', amount: 95 }] }];
  const r = computeCost({ date: '2026-10-08', hours: 4, printer: small, equipment: [small], consumables: [], prints: prev, settings, materials: [] });
  assert.equal(r.totals.amortization, 5);
});

test('выключенная амортизация не начисляется', () => {
  const off = { ...printer, includeInCost: false };
  const r = computeCost({ date: '2026-10-08', hours: 4, printer: off, equipment: [off], consumables: [], prints: [], settings, materials: [] });
  assert.equal(r.totals.amortization, 0);
});

test('расходник вне периода установки не начисляется', () => {
  const old = { ...nozzle, activeTo: '2026-09-30' };
  const r = computeCost({ date: '2026-10-08', hours: 4, printer, equipment: [], consumables: [old], prints: [], settings, materials: [] });
  assert.equal(r.totals.ops, 0);
});

test('частичный брак: 4 шт., 1 испорчена, 400 ₽', () => {
  const s = splitByQuality(400, 300, 4, 3);
  assert.equal(s.unit, 100);
  assert.equal(s.failCost, 100);
  assert.equal(s.goodCost, 300);
  assert.equal(s.unitWithFailures, 133.33);
});

test('рекомендуемая цена: (2 × 116,80 + 30) ÷ 0,85 = 310,12 → 320 ₽', () => {
  const p = priceOptions(116.8, settings);
  assert.equal(p.m50, 175.2);
  assert.equal(p.m100, 233.6);
  assert.equal(p.recRaw, 310.12);
  assert.equal(p.rec, 320);
});

test('продажа: прибыль по полной, вклад — без амортизации', () => {
  const r = saleResult({ qty: 1, price: 310, feePct: 15, packCost: 30, unitCost: 116.8, unitContribution: 89.8 });
  assert.equal(r.revenue, 310);
  assert.equal(r.fee, 46.5);
  assert.equal(r.profit, 116.7);
  assert.equal(r.contribution, 143.7);
});

test('остаток катушки = сумма движений', () => {
  const mv = [
    { spoolId: 's1', type: 'purchase', grams: 1000 },
    { spoolId: 's1', type: 'print', grams: -610 },
    { spoolId: 's1', type: 'failure', grams: -25 },
    { spoolId: 's1', type: 'adjust', grams: -8 },
  ];
  const st = spoolStats({ id: 's1', netG: 1000, costPerG: 1.25 }, mv);
  assert.equal(st.left, 357);
  assert.equal(st.used, 643);
  assert.equal(st.value, 446.25);
});

test('окупаемость не вычитает амортизацию повторно', () => {
  const state = {
    purposes: [{ id: 'mh', group: 'business' }],
    purchases: [{ kind: 'capital', amount: 18000, date: '2026-07-01' }, { kind: 'tooling', amount: 2000, date: '2026-07-01' }, { kind: 'material', amount: 1500, date: '2026-07-01' }],
    prints: [{ finalized: true, date: '2026-10-01', outputs: [{ purposeId: 'mh', qty: 2, analogPrice: 200 }], split: { unit: 116.8, unitContribution: 89.8, good: 2, failCost: 0 }, totals: {}, materials: [] }],
    sales: [],
  };
  const pb = payback(state);
  assert.equal(pb.invested, 20000);
  assert.equal(pb.economy, 220.4);
  const d = dashboard(state, periodRange('all', '2026-10-09'));
  assert.equal(d.economy, 166.4);
});

console.log(`\nВсе проверки пройдены: ${passed}`);
