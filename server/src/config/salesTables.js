const getOptionalEnv = (key, fallback = '') => process.env[key] || fallback;

const getSalesTablesConfig = () => ({
  appToken: getOptionalEnv('FEISHU_BITABLE_APP_TOKEN'),
  tables: {
    master: {
      tableName: '销售总单表',
      tableId: getOptionalEnv('FEISHU_BITABLE_SALES_MASTER_TABLE_ID'),
      tableIdEnv: 'FEISHU_BITABLE_SALES_MASTER_TABLE_ID',
    },
    item: {
      tableName: '销售子单表',
      tableId: getOptionalEnv('FEISHU_BITABLE_SALES_ITEM_TABLE_ID', getOptionalEnv('FEISHU_BITABLE_SALES_TABLE_ID')),
      tableIdEnv: 'FEISHU_BITABLE_SALES_ITEM_TABLE_ID',
      masterLinkField: '销售总单表',
    },
    payment: {
      tableName: '资金流水表',
      tableId: getOptionalEnv('FEISHU_BITABLE_PAYMENT_TABLE_ID'),
      tableIdEnv: 'FEISHU_BITABLE_PAYMENT_TABLE_ID',
      masterLinkField: '销售总单表',
    },
  },
});

const validateSalesTablesConfig = (config) => {
  const missing = [];
  if (!config?.appToken) missing.push('FEISHU_BITABLE_APP_TOKEN');
  if (!config?.tables?.master?.tableId) missing.push('FEISHU_BITABLE_SALES_MASTER_TABLE_ID');
  if (!config?.tables?.item?.tableId) missing.push('FEISHU_BITABLE_SALES_ITEM_TABLE_ID');
  if (!config?.tables?.payment?.tableId) missing.push('FEISHU_BITABLE_PAYMENT_TABLE_ID');
  if (missing.length > 0) throw new Error(`Missing sales table config: ${missing.join(', ')}`);
};

module.exports = {
  getSalesTablesConfig,
  validateSalesTablesConfig,
};
