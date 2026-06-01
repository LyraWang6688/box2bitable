const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSalesAnalytics, formatDateKey, parseDateValue } = require('../src/utils/salesAnalytics');

test('parseDateValue handles Feishu timestamp values', () => {
  assert.equal(parseDateValue(1764576000000).toISOString(), '2025-12-01T08:00:00.000Z');
  assert.equal(parseDateValue('1764576000000').toISOString(), '2025-12-01T08:00:00.000Z');
  assert.equal(parseDateValue({ timestamp: 1764576000000 }).toISOString(), '2025-12-01T08:00:00.000Z');
});

test('formatDateKey uses business timezone', () => {
  const date = new Date('2026-05-31T16:30:00.000Z');
  assert.equal(formatDateKey(date, 'Asia/Shanghai'), '2026-06-01');
});

test('buildSalesAnalytics aggregates today sales by payment method', () => {
  const records = [
    {
      record_id: 'rec1',
      fields: {
        货号: 'A1',
        颜色: '白',
        尺码: 38,
        数量: 2,
        '金额（元）': 199.9,
        支付方式: '微信',
        销售日期: '2026-06-01T02:00:00.000Z',
      },
    },
    {
      record_id: 'rec2',
      fields: {
        货号: 'B2',
        颜色: '黑',
        尺码: 40,
        数量: 1,
        '金额（元）': '100.1',
        支付方式: '支付宝',
        销售日期: '2026-06-01T04:00:00.000Z',
      },
    },
    {
      record_id: 'old',
      fields: {
        货号: 'C3',
        数量: 1,
        '金额（元）': 300,
        支付方式: '微信',
        销售日期: '2026-05-31T02:00:00.000Z',
      },
    },
  ];

  const result = buildSalesAnalytics(records, { dateKey: '2026-06-01', timeZone: 'Asia/Shanghai' });

  assert.deepEqual(result.summary, {
    total_amount: 300,
    total_quantity: 3,
    order_count: 2,
  });
  assert.deepEqual(result.pay_methods, [
    { pay_method: '微信', amount: 199.9, quantity: 2, count: 1 },
    { pay_method: '支付宝', amount: 100.1, quantity: 1, count: 1 },
  ]);
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].record_id, 'rec2');
});
