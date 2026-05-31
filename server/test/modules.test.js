const test = require('node:test');
const assert = require('node:assert/strict');

const { getModuleDefinition, normalizeModule } = require('../src/config/modules');

test('normalizeModule defaults to purchase', () => {
  assert.equal(normalizeModule(), 'purchase');
  assert.equal(normalizeModule(''), 'purchase');
});

test('normalizeModule accepts supported modules case-insensitively', () => {
  assert.equal(normalizeModule('purchase'), 'purchase');
  assert.equal(normalizeModule(' Sales '), 'sales');
  assert.equal(normalizeModule('INVENTORY'), 'inventory');
});

test('normalizeModule rejects unsupported modules', () => {
  assert.throws(() => normalizeModule('returns'), /Invalid module: returns/);
});

test('module definitions expose recognition and sync strategy config', () => {
  assert.equal(getModuleDefinition('purchase').recognition.requireSupplier, true);
  assert.equal(getModuleDefinition('purchase').sync.payloadMode, 'aggregate_by_sku');
  assert.equal(getModuleDefinition('inventory').sync.payloadMode, 'aggregate_by_sku');
  assert.equal(getModuleDefinition('sales').recognition.requireSupplier, false);
  assert.equal(getModuleDefinition('sales').sync.payloadMode, 'detail_rows');
});
