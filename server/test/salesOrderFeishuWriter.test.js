const test = require('node:test');
const assert = require('node:assert/strict');

const { SalesOrderFeishuWriter, compactFields, mapWritableFields } = require('../src/services/salesOrderFeishuWriter');
const { buildSalesOrderDraft } = require('../src/utils/salesOrderBuilder');
const { getSalesTableFields } = require('../src/config/salesTableFields');

const createMockClient = () => {
  const calls = [];
  let cursor = 0;
  const ids = ['rec_master', 'rec_item_1', 'rec_item_2', 'rec_payment_1'];
  return {
    calls,
    client: {
      bitable: {
        appTableRecord: {
          create: async (payload) => {
            calls.push(payload);
            const id = ids[cursor] || `rec_extra_${cursor}`;
            cursor += 1;
            return {
              code: 0,
              data: {
                record: {
                  record_id: id,
                },
              },
            };
          },
        },
      },
    },
  };
};

const config = {
  appToken: 'app_token_mock',
  tables: {
    master: { tableId: 'tbl_master' },
    item: { tableId: 'tbl_item', masterLinkField: '销售总单表' },
    payment: { tableId: 'tbl_payment', masterLinkField: '销售总单表' },
  },
};

test('compactFields removes undefined values but keeps empty string and zero', () => {
  assert.deepEqual(compactFields({ a: undefined, b: '', c: 0, d: null }), { b: '', c: 0, d: null });
});

test('sales table field config matches current Feishu table names and link fields', () => {
  assert.equal(getSalesTableFields('master').tableName, '销售总单表');
  assert.equal(getSalesTableFields('item').writableFields.masterLink, '销售总单表');
  assert.equal(getSalesTableFields('payment').writableFields.masterLink, '销售总单表');
  assert.ok(getSalesTableFields('master').readonlyFields.includes('总单ID'));
  assert.ok(getSalesTableFields('master').readonlyFields.includes('待收金额'));
});

test('mapWritableFields maps draft fields through config and drops readonly fields', () => {
  assert.deepEqual(
    mapWritableFields(
      'master',
      {
        总单ID: 'readonly',
        业务类型: '普通销售',
        待收金额: 0,
        售价合计: 199,
        备注: '',
      },
      {}
    ),
    {
      业务类型: '普通销售',
      售价合计: 199,
      备注: '',
    }
  );
});

test('createSalesOrder writes master, items, and payment with master links', async () => {
  const { client, calls } = createMockClient();
  const writer = new SalesOrderFeishuWriter({ client, config });
  const draft = buildSalesOrderDraft({
    action: 'normal_sale',
    input: {
      sale_amount: 140,
      pay_method: '微信',
      remark: '两双鞋优惠10元',
    },
    items: [
      { item_no: 'A100', color: '黑色', size: 40, quantity: 1, default_price: 100 },
      { item_no: 'B200', color: '白色', size: 38, quantity: 1, default_price: 50 },
    ],
    now: new Date('2026-06-01T10:00:00.000Z'),
  });

  const result = await writer.createSalesOrder(draft, { task_id: 'task_1' });

  assert.deepEqual(result, {
    masterRecordId: 'rec_master',
    itemRecordIds: ['rec_item_1', 'rec_item_2'],
    paymentRecordIds: ['rec_payment_1'],
  });
  assert.equal(calls.length, 4);
  assert.equal(calls[0].path.table_id, 'tbl_master');
  assert.equal(calls[1].path.table_id, 'tbl_item');
  assert.equal(calls[2].path.table_id, 'tbl_item');
  assert.equal(calls[3].path.table_id, 'tbl_payment');
  assert.equal(calls[0].data.fields['总单ID'], undefined);
  assert.equal(calls[0].data.fields['待收金额'], undefined);
  assert.deepEqual(calls[1].data.fields['销售总单表'], ['rec_master']);
  assert.deepEqual(calls[2].data.fields['销售总单表'], ['rec_master']);
  assert.deepEqual(calls[3].data.fields['销售总单表'], ['rec_master']);
  assert.equal(calls[3].data.fields['金额'], 140);
});

test('createSalesOrder skips payment table when presale is unpaid', async () => {
  const { client, calls } = createMockClient();
  const writer = new SalesOrderFeishuWriter({ client, config });
  const draft = buildSalesOrderDraft({
    action: 'presale_order',
    input: {
      receivable_amount: 399,
      payment_status: '未收款',
      customer_name: '王女士',
      expected_delivery_date: '2026-06-05',
    },
    items: [{ item_no: 'C76122', color: '黑色', size: 39, quantity: 1, default_price: 399 }],
    now: new Date('2026-06-01T10:00:00.000Z'),
  });

  const result = await writer.createSalesOrder(draft, { task_id: 'task_2' });

  assert.deepEqual(result, {
    masterRecordId: 'rec_master',
    itemRecordIds: ['rec_item_1'],
    paymentRecordIds: [],
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].path.table_id, 'tbl_master');
  assert.equal(calls[1].path.table_id, 'tbl_item');
  assert.equal(calls[0].data.fields['支付状态'], '未收款');
});

test('createSalesOrder surfaces Feishu create errors', async () => {
  const client = {
    bitable: {
      appTableRecord: {
        create: async () => ({ code: 999, msg: 'bad request' }),
      },
    },
  };
  const writer = new SalesOrderFeishuWriter({ client, config });
  const draft = buildSalesOrderDraft({
    action: 'normal_sale',
    input: { sale_amount: 199, pay_method: '微信' },
    items: [{ item_no: 'A3357', color: '黑色', size: 40, quantity: 1, default_price: 199 }],
  });

  await assert.rejects(() => writer.createSalesOrder(draft), /飞书新增失败: bad request \(Code: 999\)/);
});
