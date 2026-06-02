const lark = require('@larksuiteoapi/node-sdk');
const { getSalesTablesConfig, validateSalesTablesConfig } = require('../config/salesTables');
const { getSalesTableFields } = require('../config/salesTableFields');
const { logError, logInfo } = require('../utils/logger');

const DRAFT_FIELD_KEYS = {
  master: {
    业务类型: 'businessType',
    订单状态: 'orderStatus',
    支付状态: 'paymentStatus',
    交付状态: 'deliveryStatus',
    售价合计: 'listAmount',
    优惠金额: 'discountAmount',
    应收金额: 'receivableAmount',
    已收金额: 'paidAmount',
    客户姓名: 'customerName',
    客户电话: 'customerPhone',
    预计交付日期: 'expectedDeliveryDate',
    完成日期: 'completedDate',
    备注: 'remark',
  },
  item: {
    业务类型: 'businessType',
    订单状态: 'orderStatus',
    支付状态: 'paymentStatus',
    交付状态: 'deliveryStatus',
    货号: 'itemNo',
    颜色: 'color',
    尺码: 'size',
    数量: 'quantity',
    应收金额: 'receivableAmount',
    已收金额: 'paidAmount',
    备注: 'remark',
  },
  payment: {
    流水类型: 'flowType',
    收支方向: 'direction',
    金额: 'amount',
    支付方式: 'payMethod',
    操作类型: 'operationType',
    备注: 'remark',
  },
};

const compactFields = (fields) => {
  const out = {};
  Object.keys(fields || {}).forEach((key) => {
    const value = fields[key];
    if (value === undefined) return;
    out[key] = value;
  });
  return out;
};

const mapWritableFields = (tableKey, draftFields, extraFields = {}) => {
  const tableFields = getSalesTableFields(tableKey);
  const sourceKeyMap = DRAFT_FIELD_KEYS[tableKey] || {};
  const out = {};

  Object.keys(draftFields || {}).forEach((sourceField) => {
    const semanticKey = sourceKeyMap[sourceField];
    if (!semanticKey) return;
    const targetField = tableFields.writableFields[semanticKey];
    if (!targetField) return;
    out[targetField] = draftFields[sourceField];
  });

  Object.keys(extraFields || {}).forEach((semanticKey) => {
    const targetField = tableFields.writableFields[semanticKey];
    if (!targetField) return;
    out[targetField] = extraFields[semanticKey];
  });

  return compactFields(out);
};

const extractRecordId = (resp) => {
  return resp?.data?.record?.record_id || resp?.data?.record_id || '';
};

class SalesOrderFeishuWriter {
  constructor(options = {}) {
    this.client =
      options.client ||
      new lark.Client({
        appId: process.env.FEISHU_APP_ID,
        appSecret: process.env.FEISHU_APP_SECRET,
      });
    this.config = options.config || getSalesTablesConfig();
  }

  async createRecord(tableId, fields) {
    const resp = await this.client.bitable.appTableRecord.create({
      path: {
        app_token: this.config.appToken,
        table_id: tableId,
      },
      data: {
        fields: compactFields(fields),
      },
    });

    if (resp.code !== 0) {
      throw new Error(`飞书新增失败: ${resp.msg || 'unknown'} (Code: ${resp.code})`);
    }

    const recordId = extractRecordId(resp);
    if (!recordId) throw new Error('飞书新增成功但缺少 record_id');
    return recordId;
  }

  async createSalesOrder(draft, context = {}) {
    const startedAt = Date.now();
    validateSalesTablesConfig(this.config);

    logInfo('sales_order.feishu.create.started', {
      task_id: context.task_id,
      action: draft.action,
      item_count: draft.items.length,
      payment_count: draft.payments.length,
    });

    try {
      const masterRecordId = await this.createRecord(
        this.config.tables.master.tableId,
        mapWritableFields('master', draft.master)
      );

      const itemRecordIds = [];
      for (const item of draft.items) {
        const fields = mapWritableFields('item', item, { masterLink: [masterRecordId] });
        itemRecordIds.push(await this.createRecord(this.config.tables.item.tableId, fields));
      }

      const paymentRecordIds = [];
      for (const payment of draft.payments) {
        const fields = mapWritableFields('payment', payment, { masterLink: [masterRecordId] });
        paymentRecordIds.push(await this.createRecord(this.config.tables.payment.tableId, fields));
      }

      logInfo('sales_order.feishu.create.completed', {
        task_id: context.task_id,
        action: draft.action,
        duration_ms: Date.now() - startedAt,
        master_record_id: masterRecordId,
        item_count: itemRecordIds.length,
        payment_count: paymentRecordIds.length,
      });

      return {
        masterRecordId,
        itemRecordIds,
        paymentRecordIds,
      };
    } catch (e) {
      logError('sales_order.feishu.create.failed', {
        task_id: context.task_id,
        action: draft.action,
        duration_ms: Date.now() - startedAt,
        error: e.message,
      });
      throw e;
    }
  }
}

module.exports = {
  SalesOrderFeishuWriter,
  compactFields,
  mapWritableFields,
};
