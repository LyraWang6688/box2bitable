const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeSize, validateSize, generateSkuCode } = require('../src/utils/formatter');

test('normalizeSize converts millimeter sizes to EUR sizes', () => {
  assert.equal(normalizeSize(240), '38');
  assert.equal(normalizeSize('250'), '40');
  assert.equal(normalizeSize(262.5), '42.5');
});

test('normalizeSize keeps EUR sizes unchanged', () => {
  assert.equal(normalizeSize(38), '38');
  assert.equal(normalizeSize('42.5'), '42.5');
});

test('validateSize flags normal and anomalous sizes', () => {
  assert.deepEqual(validateSize('42'), { isValid: true, isAnomaly: false });
  assert.deepEqual(validateSize('50'), {
    isValid: false,
    isAnomaly: true,
    message: '超出常规尺码范围(34-48)',
  });
  assert.deepEqual(validateSize('abc'), { isValid: false, isAnomaly: true });
});

test('generateSkuCode normalizes empty and mixed-case values', () => {
  assert.equal(generateSkuCode(' cw2288-111 ', '白色', '42'), 'CW2288-111-白色-42');
  assert.equal(generateSkuCode('', '', ''), '未知-默认-均码');
});
