const { getSalesAction } = require('../config/salesActions');
const { allocateDiscount, toMoney } = require('./discountAllocation');

const requireValue = (value, message) => {
  if (value == null || value === '') throw new Error(message);
  return value;
};

const buildCompletedDate = (now = new Date()) => now.getTime();

const toDateTimestamp = (value) => {
  if (!value) return undefined;
  if (typeof value === 'number') return value;
  const raw = String(value).trim();
  if (!raw) return undefined;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00+08:00`) : new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date.getTime();
};

const buildMasterFields = ({ action, input, allocation, now }) => {
  const defaults = action.defaultMasterFields;
  if (action.key === 'normal_sale') {
    return {
      业务类型: defaults.business_type,
      订单状态: defaults.order_status,
      支付状态: defaults.payment_status,
      交付状态: defaults.delivery_status,
      售价合计: allocation.original_total,
      优惠金额: allocation.discount_total,
      应收金额: allocation.receivable_total,
      已收金额: allocation.receivable_total,
      完成日期: buildCompletedDate(now),
      备注: input.remark || '',
    };
  }

  const paymentStatus = requireValue(input.payment_status, '预售订单缺少支付状态');
  if (!action.allowedPaymentStatuses.includes(paymentStatus)) {
    throw new Error(`预售订单不支持的支付状态: ${paymentStatus}`);
  }
  const paidAmount = paymentStatus === '部分收款' ? toMoney(input.paid_amount) : 0;
  if (paymentStatus === '部分收款' && paidAmount <= 0) {
    throw new Error('预售订单部分收款时已收金额必须大于 0');
  }

  return {
    业务类型: defaults.business_type,
    订单状态: defaults.order_status,
    支付状态: paymentStatus,
    交付状态: defaults.delivery_status,
    售价合计: allocation.original_total,
    优惠金额: allocation.discount_total,
    应收金额: allocation.receivable_total,
    已收金额: paidAmount,
    客户姓名: input.customer_name || '',
    客户电话: input.customer_phone || '',
    预计交付日期: toDateTimestamp(input.expected_delivery_date),
    备注: input.remark || '',
  };
};

const buildItemFields = ({ item, masterFields }) => ({
  业务类型: masterFields['业务类型'],
  订单状态: masterFields['订单状态'],
  支付状态: masterFields['支付状态'],
  交付状态: masterFields['交付状态'],
  货号: item.item_no || '',
  颜色: item.color || '',
  尺码: item.size == null || item.size === '' ? undefined : Number(item.size),
  数量: item.quantity,
  应收金额: item.receivable_amount,
  已收金额: masterFields['业务类型'] === '普通销售' ? item.receivable_amount : 0,
  备注: masterFields['备注'] || '',
});

const shouldCreatePayment = (action, masterFields) => {
  if (action.payment.mode === 'required') return true;
  if (action.payment.mode === 'optional_when_partial_paid') return masterFields['支付状态'] === '部分收款';
  return false;
};

const buildPaymentFields = ({ action, input, masterFields }) => {
  if (!shouldCreatePayment(action, masterFields)) return null;
  const amount = action.key === 'normal_sale' ? masterFields['已收金额'] : toMoney(input.paid_amount);
  return {
    流水类型: action.payment.flow_type,
    收支方向: action.payment.direction,
    金额: amount,
    支付方式: requireValue(input.pay_method, '创建资金流水缺少收款方式'),
    操作类型: action.payment.operation_type,
    备注: input.remark || '',
  };
};

const getReceivableAmount = (actionKey, input, items) => {
  if (actionKey === 'normal_sale') return requireValue(input.sale_amount, '普通销售缺少销售金额');
  return requireValue(input.receivable_amount, '预售订单缺少应收金额');
};

const buildSalesOrderDraft = ({ action: actionKey, input = {}, items = [], now = new Date() }) => {
  const action = getSalesAction(actionKey);
  if (!Array.isArray(items) || items.length === 0) throw new Error('销售订单至少需要一条子单');

  const allocation = allocateDiscount(items, Number(getReceivableAmount(action.key, input, items)));
  const masterFields = buildMasterFields({ action, input, allocation, now });
  const itemFields = allocation.items.map((item) => buildItemFields({ item, masterFields }));
  const paymentFields = buildPaymentFields({ action, input, masterFields });

  return {
    action: action.key,
    master: masterFields,
    items: itemFields,
    payments: paymentFields ? [paymentFields] : [],
    allocation,
  };
};

module.exports = {
  buildSalesOrderDraft,
  toDateTimestamp,
};
