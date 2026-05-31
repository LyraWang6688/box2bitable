const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSyncPayload } = require('../src/utils/syncAggregation');

test('buildSyncPayload aggregates purchase and inventory rows by SKU', () => {
  const rows = [
    { item_no: 'a1', color: '白', size: '38', supplier: 'Nike' },
    { item_no: 'A1', color: '白', size: '38', supplier: 'Nike' },
    { item_no: 'a1', color: '黑', size: '38', supplier: 'Nike' },
  ];

  assert.deepEqual(buildSyncPayload(rows, 'purchase'), [
    { item_no: 'a1', color: '白', size: '38', supplier: 'Nike', quantity: 2 },
    { item_no: 'a1', color: '黑', size: '38', supplier: 'Nike', quantity: 1 },
  ]);
});

test('buildSyncPayload keeps sales rows as detail records', () => {
  const rows = [
    { item_no: 'A1', color: '白', size: '38', quantity: '', amount: '' },
    { item_no: 'A1', color: '白', size: '38', quantity: '2', amount: '199.5' },
  ];

  assert.deepEqual(buildSyncPayload(rows, 'sales'), [
    { item_no: 'A1', color: '白', size: '38', quantity: 1, amount: undefined },
    { item_no: 'A1', color: '白', size: '38', quantity: 2, amount: 199.5 },
  ]);
});
