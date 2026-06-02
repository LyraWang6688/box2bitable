const SALES_TABLE_FIELDS = {
  master: {
    tableName: '销售总单表',
    writableFields: {
      businessType: '业务类型',
      orderStatus: '订单状态',
      paymentStatus: '支付状态',
      deliveryStatus: '交付状态',
      listAmount: '售价合计',
      discountAmount: '优惠金额',
      receivableAmount: '应收金额',
      paidAmount: '已收金额',
      customerName: '客户姓名',
      customerPhone: '客户电话',
      expectedDeliveryDate: '预计交付日期',
      completedDate: '完成日期',
      remark: '备注',
    },
    readonlyFields: ['总单ID', '待收金额', '销售日期', '更新时间', '销售子单表', '资金流水表'],
  },
  item: {
    tableName: '销售子单表',
    writableFields: {
      masterLink: '销售总单表',
      businessType: '业务类型',
      orderStatus: '订单状态',
      paymentStatus: '支付状态',
      deliveryStatus: '交付状态',
      itemNo: '货号',
      color: '颜色',
      size: '尺码',
      quantity: '数量',
      receivableAmount: '应收金额',
      paidAmount: '已收金额',
      remark: '备注',
    },
    readonlyFields: ['订单ID', '待收金额', '销售日期', '更新时间', '资金流水表'],
  },
  payment: {
    tableName: '资金流水表',
    writableFields: {
      masterLink: '销售总单表',
      flowType: '流水类型',
      direction: '收支方向',
      amount: '金额',
      payMethod: '支付方式',
      operationType: '操作类型',
      remark: '备注',
    },
    readonlyFields: ['流水ID', '发生时间'],
  },
};

const getSalesTableFields = (tableKey) => {
  const config = SALES_TABLE_FIELDS[tableKey];
  if (!config) {
    const supported = Object.keys(SALES_TABLE_FIELDS).join(', ');
    throw new Error(`Unsupported sales table key: ${tableKey}. Supported: ${supported}`);
  }
  return config;
};

module.exports = {
  SALES_TABLE_FIELDS,
  getSalesTableFields,
};
