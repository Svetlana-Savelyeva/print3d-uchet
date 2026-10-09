// Запуск: node tests/merge.test.mjs
import assert from 'node:assert/strict';
import { merge3 } from '../js/merge.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('✓', name); };
const st = (o) => ({ version: 1, setupDone: true, settings: { tariff: 7 }, prints: [], spools: [], movements: [], sales: [], ...o });

test('новые записи с двух устройств объединяются', () => {
  const base = st({ prints: [{ id: 'a', v: 1 }] });
  const local = st({ prints: [{ id: 'a', v: 1 }, { id: 'phone', v: 1 }] });
  const remote = st({ prints: [{ id: 'a', v: 1 }, { id: 'pc', v: 1 }] });
  const m = merge3(base, local, remote);
  assert.deepEqual(m.prints.map((p) => p.id).sort(), ['a', 'pc', 'phone']);
});

test('изменение на другом устройстве приходит сюда', () => {
  const base = st({ prints: [{ id: 'a', status: 'printing' }] });
  const local = st({ prints: [{ id: 'a', status: 'printing' }] });
  const remote = st({ prints: [{ id: 'a', status: 'done' }] });
  assert.equal(merge3(base, local, remote).prints[0].status, 'done');
});

test('удаление на другом устройстве применяется', () => {
  const base = st({ sales: [{ id: 's1', qty: 1 }] });
  const m = merge3(base, st({ sales: [{ id: 's1', qty: 1 }] }), st({ sales: [] }));
  assert.equal(m.sales.length, 0);
});

test('удаление здесь не возвращается из облака', () => {
  const base = st({ sales: [{ id: 's1', qty: 1 }] });
  const m = merge3(base, st({ sales: [] }), st({ sales: [{ id: 's1', qty: 1 }] }));
  assert.equal(m.sales.length, 0);
});

test('удалили там, но здесь изменили — запись сохраняется', () => {
  const base = st({ spools: [{ id: 'k', price: 1000 }] });
  const m = merge3(base, st({ spools: [{ id: 'k', price: 1200 }] }), st({ spools: [] }));
  assert.equal(m.spools[0].price, 1200);
});

test('настройки сливаются по полям', () => {
  const base = st({ settings: { tariff: 7, mpFee: 15 } });
  const m = merge3(base, st({ settings: { tariff: 8, mpFee: 15 } }), st({ settings: { tariff: 7, mpFee: 12 } }));
  assert.deepEqual(m.settings, { tariff: 8, mpFee: 12 });
});

test('первое подключение без общей версии — объединение', () => {
  const m = merge3(null, st({ movements: [{ id: 'm1' }] }), st({ movements: [{ id: 'm2' }] }));
  assert.equal(m.movements.length, 2);
});

console.log(`\nВсе проверки пройдены: ${passed}`);
