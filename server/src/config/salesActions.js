const SALES_ACTIONS = {
  normal_sale: {
    key: 'normal_sale',
    label: '普通销售',
    defaultMasterFields: {
      business_type: '普通销售',
      order_status: '已完成',
      payment_status: '已收清',
      delivery_status: '已交付',
    },
    payment: {
      mode: 'required',
      flow_type: '全款收款',
      direction: '收入',
      operation_type: '创建订单',
    },
  },
  presale_order: {
    key: 'presale_order',
    label: '预售订单',
    defaultMasterFields: {
      business_type: '预售订单',
      order_status: '进行中',
      delivery_status: '未交付',
    },
    allowedPaymentStatuses: ['未收款', '部分收款'],
    payment: {
      mode: 'optional_when_partial_paid',
      flow_type: '定金',
      direction: '收入',
      operation_type: '创建订单',
    },
  },
};

const getSalesAction = (actionKey) => {
  const key = String(actionKey || '').trim();
  const action = SALES_ACTIONS[key];
  if (!action) {
    const supported = Object.keys(SALES_ACTIONS).join(', ');
    throw new Error(`Unsupported sales action: ${key}. Supported: ${supported}`);
  }
  return action;
};

module.exports = {
  SALES_ACTIONS,
  getSalesAction,
};
