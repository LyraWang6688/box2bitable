const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSalesOrderDraft, toDateTimestamp } = require('../src/utils/salesOrderBuilder');

const fixedNow = new Date('2026-06-01T10:00:00.000Z');

test('toDateTimestamp parses business date in Asia/Shanghai', () => {
  assert.equal(toDateTimestamp('2026-06-05'), new Date('2026-06-05T00:00:00+08:00').getTime());
});

test('normal single-item sale creates master, item, and full payment flow', () => {
  const draft = buildSalesOrderDraft({
    action: 'normal_sale',
    now: fixedNow,
    input: {
      sale_amount: 199,
      pay_method: '微信',
      remark: '普通销售单鞋测试',
    },
    items: [{ item_no: 'A3357', color: '黑色', size: 40, quantity: 1, default_price: 199 }],
  });

  assert.deepEqual(draft.master, {
    业务类型: '普通销售',
    订单状态: '已完成',
    支付状态: '已收清',
    交付状态: '已交付',
    售价合计: 199,
    优惠金额: 0,
    应收金额: 199,
    已收金额: 199,
    完成日期: fixedNow.getTime(),
    备注: '普通销售单鞋测试',
  });
  assert.deepEqual(draft.items, [
    {
      业务类型: '普通销售',
      订单状态: '已完成',
      支付状态: '已收清',
      交付状态: '已交付',
      货号: 'A3357',
      颜色: '黑色',
      尺码: 40,
      数量: 1,
      应收金额: 199,
      已收金额: 199,
      备注: '普通销售单鞋测试',
    },
  ]);
  assert.deepEqual(draft.payments, [
    {
      流水类型: '全款收款',
      收支方向: '收入',
      金额: 199,
      支付方式: '微信',
      操作类型: '创建订单',
      备注: '普通销售单鞋测试',
    },
  ]);
});

test('normal multi-item sale keeps totals and creates one payment flow', () => {
  const draft = buildSalesOrderDraft({
    action: 'normal_sale',
    now: fixedNow,
    input: {
      sale_amount: 349,
      pay_method: '支付宝',
      remark: '普通销售多鞋测试',
    },
    items: [
      { item_no: 'A3357', color: '黑色', size: 40, quantity: 1, default_price: 199 },
      { item_no: 'B8805', color: '白色', size: 38, quantity: 1, default_price: 150 },
    ],
  });

  assert.equal(draft.master['售价合计'], 349);
  assert.equal(draft.master['优惠金额'], 0);
  assert.equal(draft.master['应收金额'], 349);
  assert.equal(draft.items.length, 2);
  assert.equal(draft.payments.length, 1);
  assert.equal(draft.payments[0]['金额'], 349);
});

test('presale without payment creates no payment flow', () => {
  const draft = buildSalesOrderDraft({
    action: 'presale_order',
    now: fixedNow,
    input: {
      receivable_amount: 399,
      payment_status: '未收款',
      customer_name: '王女士',
      customer_phone: '13800000000',
      expected_delivery_date: '2026-06-05',
      remark: '预售未收款测试',
    },
    items: [{ item_no: 'C76122', color: '黑色', size: 39, quantity: 1, default_price: 399 }],
  });

  assert.equal(draft.master['业务类型'], '预售订单');
  assert.equal(draft.master['订单状态'], '进行中');
  assert.equal(draft.master['支付状态'], '未收款');
  assert.equal(draft.master['交付状态'], '未交付');
  assert.equal(draft.master['已收金额'], 0);
  assert.equal(draft.master['完成日期'], undefined);
  assert.deepEqual(draft.payments, []);
});

test('presale partial payment creates deposit flow', () => {
  const draft = buildSalesOrderDraft({
    action: 'presale_order',
    now: fixedNow,
    input: {
      receivable_amount: 399,
      payment_status: '部分收款',
      paid_amount: 100,
      pay_method: '现金',
      customer_name: '李先生',
      customer_phone: '13900000000',
      expected_delivery_date: '2026-06-06',
      remark: '预售部分收款测试',
    },
    items: [{ item_no: 'D26336', color: '灰色', size: 42, quantity: 1, default_price: 399 }],
  });

  assert.equal(draft.master['已收金额'], 100);
  assert.deepEqual(draft.payments, [
    {
      流水类型: '定金',
      收支方向: '收入',
      金额: 100,
      支付方式: '现金',
      操作类型: '创建订单',
      备注: '预售部分收款测试',
    },
  ]);
});

test('discount is allocated by original amount with last item adjustment', () => {
  const draft = buildSalesOrderDraft({
    action: 'normal_sale',
    now: fixedNow,
    input: {
      sale_amount: 140,
      pay_method: '微信',
      remark: '两双鞋优惠10元',
    },
    items: [
      { item_no: 'A100', color: '黑色', size: 40, quantity: 1, default_price: 100 },
      { item_no: 'B200', color: '白色', size: 38, quantity: 1, default_price: 50 },
    ],
  });

  assert.equal(draft.master['售价合计'], 150);
  assert.equal(draft.master['优惠金额'], 10);
  assert.equal(draft.master['应收金额'], 140);
  assert.deepEqual(
    draft.allocation.items.map((item) => ({
      item_no: item.item_no,
      original_amount: item.original_amount,
      discount_amount: item.discount_amount,
      receivable_amount: item.receivable_amount,
    })),
    [
      { item_no: 'A100', original_amount: 100, discount_amount: 7, receivable_amount: 93 },
      { item_no: 'B200', original_amount: 50, discount_amount: 3, receivable_amount: 47 },
    ]
  );
});
