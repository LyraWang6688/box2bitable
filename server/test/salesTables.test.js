const test = require('node:test');
const assert = require('node:assert/strict');

const { validateSalesTablesConfig } = require('../src/config/salesTables');

test('validateSalesTablesConfig accepts complete sales table config', () => {
  assert.doesNotThrow(() =>
    validateSalesTablesConfig({
      appToken: 'app',
      tables: {
        master: { tableId: 'tbl_master' },
        item: { tableId: 'tbl_item' },
        payment: { tableId: 'tbl_payment' },
      },
    })
  );
});

test('validateSalesTablesConfig reports missing sales table env names', () => {
  assert.throws(
    () =>
      validateSalesTablesConfig({
        appToken: '',
        tables: {
          master: { tableId: '' },
          item: { tableId: '' },
          payment: { tableId: '' },
        },
      }),
    /FEISHU_BITABLE_APP_TOKEN.*FEISHU_BITABLE_SALES_MASTER_TABLE_ID.*FEISHU_BITABLE_SALES_ITEM_TABLE_ID.*FEISHU_BITABLE_PAYMENT_TABLE_ID/
  );
});
