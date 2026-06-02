const path = require('path');
const dotenv = require('dotenv');
const { buildSalesOrderDraft } = require('../src/utils/salesOrderBuilder');
const { SalesOrderFeishuWriter } = require('../src/services/salesOrderFeishuWriter');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const shouldWrite = process.argv.includes('--yes');

const sample = {
  action: 'normal_sale',
  input: {
    sale_amount: 140,
    pay_method: '微信',
    remark: `真实飞书写入测试 ${new Date().toISOString()}`,
  },
  items: [
    { item_no: 'TEST-A100', color: '黑色', size: 40, quantity: 1, default_price: 100 },
    { item_no: 'TEST-B200', color: '白色', size: 38, quantity: 1, default_price: 50 },
  ],
};

const main = async () => {
  const draft = buildSalesOrderDraft(sample);
  console.log(JSON.stringify({ mode: shouldWrite ? 'write' : 'dry-run', draft }, null, 2));

  if (!shouldWrite) {
    console.log('\nDry-run only. Re-run with --yes to create records in Feishu.');
    return;
  }

  const writer = new SalesOrderFeishuWriter();
  const result = await writer.createSalesOrder(draft, { task_id: 'manual_sales_sample' });
  console.log('\nCreated Feishu records:');
  console.log(JSON.stringify(result, null, 2));
};

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
