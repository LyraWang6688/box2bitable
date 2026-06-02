const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { SalesTaskService, TASK_STATUS } = require('../src/services/salesTaskService');
const { SalesTaskStore } = require('../src/services/salesTaskStore');

const makeTempStore = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sales-task-store-'));
  return new SalesTaskStore({ dir });
};

const fakeFile = {
  filename: 'image-test.jpg',
  path: '/tmp/image-test.jpg',
  size: 123,
  mimetype: 'image/jpeg',
};

test('createTask stores pending task without auto-starting recognition', async () => {
  const service = new SalesTaskService({
    store: makeTempStore(),
    autoStart: false,
    recognizer: { recognizeLabels: async () => [] },
    writer: { createSalesOrder: async () => ({}) },
  });

  const task = await service.createTask({
    action: 'normal_sale',
    input: { sale_amount: '199', pay_method: '微信', remark: '测试' },
    file: fakeFile,
  });

  assert.equal(task.status, TASK_STATUS.PENDING);
  assert.equal(task.action, 'normal_sale');
  assert.equal(task.input.sale_amount, 199);
  assert.equal(task.input.pay_method, '微信');
  assert.equal((await service.getTask(task.task_id)).task_id, task.task_id);
});

test('processRecognition updates task with formatted recognition results', async () => {
  const service = new SalesTaskService({
    store: makeTempStore(),
    autoStart: false,
    recognizer: {
      recognizeLabels: async () => [{ item_no: 'A3357', color: '黑色', size: '240' }],
    },
    writer: { createSalesOrder: async () => ({}) },
  });

  const task = await service.createTask({
    action: 'normal_sale',
    input: { sale_amount: 199, pay_method: '微信' },
    file: fakeFile,
  });
  const updated = await service.processRecognition(task.task_id);

  assert.equal(updated.status, TASK_STATUS.DONE);
  assert.equal(updated.recognition_results[0].size, '38');
  assert.equal(updated.recognition_results[0].quantity, 1);
});

test('reviewTask builds draft and writes sales order through writer', async () => {
  const calls = [];
  const service = new SalesTaskService({
    store: makeTempStore(),
    autoStart: false,
    recognizer: { recognizeLabels: async () => [] },
    writer: {
      createSalesOrder: async (draft, context) => {
        calls.push({ draft, context });
        return {
          masterRecordId: 'rec_master',
          itemRecordIds: ['rec_item'],
          paymentRecordIds: [],
        };
      },
    },
  });

  const task = await service.createTask({
    action: 'presale_order',
    input: {
      receivable_amount: 399,
      payment_status: '未收款',
      customer_name: '王女士',
    },
    file: fakeFile,
  });
  const reviewed = await service.reviewTask(task.task_id, {
    items: [{ item_no: 'C76122', color: '黑色', size: 39, quantity: 1, default_price: 399 }],
  });

  assert.equal(reviewed.status, TASK_STATUS.SYNCED);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].context.task_id, task.task_id);
  assert.equal(calls[0].draft.master['支付状态'], '未收款');
  assert.equal(calls[0].draft.payments.length, 0);
});

test('listTasks filters by status', async () => {
  const service = new SalesTaskService({
    store: makeTempStore(),
    autoStart: false,
    recognizer: { recognizeLabels: async () => [] },
    writer: { createSalesOrder: async () => ({}) },
  });

  const task = await service.createTask({
    action: 'normal_sale',
    input: { sale_amount: 199, pay_method: '微信' },
    file: fakeFile,
  });
  await service.store.update(task.task_id, { status: TASK_STATUS.DONE });

  assert.equal((await service.listTasks({ status: TASK_STATUS.DONE })).length, 1);
  assert.equal((await service.listTasks({ status: TASK_STATUS.PENDING })).length, 0);
});
