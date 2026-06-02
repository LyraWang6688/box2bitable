const crypto = require('crypto');
const doubaoService = require('./doubaoService');
const { SalesTaskStore } = require('./salesTaskStore');
const { SalesOrderFeishuWriter } = require('./salesOrderFeishuWriter');
const { buildSalesOrderDraft } = require('../utils/salesOrderBuilder');
const { formatRecognitionResults } = require('../utils/recognitionFormatter');
const { getSalesAction } = require('../config/salesActions');
const { logError, logInfo } = require('../utils/logger');

const TASK_STATUS = {
  PENDING: 'pending_recognition',
  RECOGNIZING: 'recognizing',
  DONE: 'recognition_done',
  FAILED: 'recognition_failed',
  SYNCED: 'synced',
  SYNC_FAILED: 'sync_failed',
};

const createTaskId = () => `sales_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

const toNumberIfPresent = (value) => {
  if (value == null || value === '') return value;
  const num = Number(value);
  return Number.isFinite(num) ? num : value;
};

const normalizeInput = (raw = {}) => ({
  sale_amount: toNumberIfPresent(raw.sale_amount),
  receivable_amount: toNumberIfPresent(raw.receivable_amount),
  paid_amount: toNumberIfPresent(raw.paid_amount),
  payment_status: raw.payment_status || '',
  pay_method: raw.pay_method || '',
  customer_name: raw.customer_name || '',
  customer_phone: raw.customer_phone || '',
  expected_delivery_date: raw.expected_delivery_date || '',
  remark: raw.remark || '',
});

class SalesTaskService {
  constructor(options = {}) {
    this.store = options.store || new SalesTaskStore();
    this.recognizer = options.recognizer || doubaoService;
    this.writer = options.writer || new SalesOrderFeishuWriter();
    this.autoStart = options.autoStart !== false;
  }

  async createTask({ action, input, file }) {
    const salesAction = getSalesAction(action);
    if (!file) throw new Error('未接收到图片文件');

    const task = await this.store.create({
      task_id: createTaskId(),
      action: salesAction.key,
      action_label: salesAction.label,
      status: TASK_STATUS.PENDING,
      input: normalizeInput(input),
      image: {
        filename: file.filename,
        path: file.path,
        size: file.size,
        mime_type: file.mimetype,
      },
      recognition_results: [],
      review_result: null,
      sync_result: null,
    });

    logInfo('sales_task.created', {
      task_id: task.task_id,
      action: task.action,
      image_file: task.image.filename,
    });

    if (this.autoStart) {
      setImmediate(() => {
        this.processRecognition(task.task_id).catch((e) => {
          logError('sales_task.recognition.unhandled', { task_id: task.task_id, error: e.message });
        });
      });
    }

    return task;
  }

  async processRecognition(taskId) {
    const task = await this.store.get(taskId);
    if (!task) throw new Error(`任务不存在: ${taskId}`);
    const startedAt = Date.now();

    await this.store.update(taskId, { status: TASK_STATUS.RECOGNIZING, recognition_error: '' });
    logInfo('sales_task.recognition.started', { task_id: taskId, action: task.action });

    try {
      const rawResults = await this.recognizer.recognizeLabels(task.image.path, 'sales');
      const formattedResults = formatRecognitionResults(rawResults);
      const next = await this.store.update(taskId, {
        status: TASK_STATUS.DONE,
        recognition_results: formattedResults,
        recognition_completed_at: new Date().toISOString(),
      });
      logInfo('sales_task.recognition.completed', {
        task_id: taskId,
        action: task.action,
        duration_ms: Date.now() - startedAt,
        result_count: formattedResults.length,
      });
      return next;
    } catch (e) {
      const next = await this.store.update(taskId, {
        status: TASK_STATUS.FAILED,
        recognition_error: e.message,
      });
      logError('sales_task.recognition.failed', {
        task_id: taskId,
        action: task.action,
        duration_ms: Date.now() - startedAt,
        error: e.message,
      });
      return next;
    }
  }

  async listTasks(filter = {}) {
    return this.store.list(filter);
  }

  async getTask(taskId) {
    return this.store.get(taskId);
  }

  async reviewTask(taskId, payload = {}) {
    const task = await this.store.get(taskId);
    if (!task) throw new Error(`任务不存在: ${taskId}`);
    const items = payload.items || payload.reviewed_items || [];
    const draft = buildSalesOrderDraft({
      action: task.action,
      input: task.input,
      items,
    });

    await this.store.update(taskId, {
      review_result: {
        items,
        reviewed_at: new Date().toISOString(),
      },
    });

    try {
      const syncResult = await this.writer.createSalesOrder(draft, { task_id: taskId });
      return this.store.update(taskId, {
        status: TASK_STATUS.SYNCED,
        sync_result: syncResult,
        sync_error: '',
        synced_at: new Date().toISOString(),
      });
    } catch (e) {
      await this.store.update(taskId, {
        status: TASK_STATUS.SYNC_FAILED,
        sync_error: e.message,
      });
      throw e;
    }
  }
}

module.exports = {
  SalesTaskService,
  TASK_STATUS,
};
