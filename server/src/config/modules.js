const getRequiredEnv = (key) => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env: ${key}`);
  return v;
};

const getOptionalEnv = (key, fallback = '') => process.env[key] || fallback;

const { MODULES: SHARED_MODULES } = require('./modules.shared');

const MODULES = {
  purchase: {
    ...SHARED_MODULES.purchase,
    bitable: {
      appToken: getOptionalEnv('FEISHU_BITABLE_APP_TOKEN'),
      tableId: getOptionalEnv('FEISHU_BITABLE_PURCHASE_TABLE_ID', getOptionalEnv('FEISHU_BITABLE_TABLE_ID')),
      tableIdEnv: 'FEISHU_BITABLE_PURCHASE_TABLE_ID',
    },
    sync: {
      ...SHARED_MODULES.purchase.sync,
      createFields: [
        { field: 'SKU_Code', source: 'skuCode' },
        { field: '货号', source: 'item_no' },
        { field: '颜色', source: 'color' },
        { field: '尺码', source: 'size', type: 'number' },
        { field: '供应商', source: 'supplier', fallback: '' },
        { field: '品类', source: 'category', fallback: '' },
        { field: '数量', source: 'quantity', type: 'number' },
        { field: '对应图片', source: 'attachment' },
      ],
      updateFields: [
        { field: '数量', source: 'accumulatedQuantity' },
        { field: '对应图片', source: 'attachment', omitWhenEmpty: true },
      ],
      carryForwardFields: [
        { field: '品类', source: 'category', conflictMessage: '品类与已存在记录不一致' },
      ],
    },
  },
  inventory: {
    ...SHARED_MODULES.inventory,
    bitable: {
      appToken: getOptionalEnv('FEISHU_BITABLE_APP_TOKEN'),
      tableId: getOptionalEnv('FEISHU_BITABLE_INVENTORY_TABLE_ID', getOptionalEnv('FEISHU_BITABLE_TABLE_ID')),
      tableIdEnv: 'FEISHU_BITABLE_INVENTORY_TABLE_ID',
    },
    sync: {
      ...SHARED_MODULES.inventory.sync,
      createFields: [
        { field: 'SKU_Code', source: 'skuCode' },
        { field: '货号', source: 'item_no' },
        { field: '颜色', source: 'color' },
        { field: '尺码', source: 'size', type: 'number' },
        { field: '数量', source: 'quantity', type: 'number' },
        { field: '对应图片', source: 'attachment' },
      ],
      updateFields: [
        { field: '数量', source: 'accumulatedQuantity' },
        { field: '对应图片', source: 'attachment', omitWhenEmpty: true },
      ],
      carryForwardFields: [],
    },
  },
  sales: {
    ...SHARED_MODULES.sales,
    bitable: {
      appToken: getOptionalEnv('FEISHU_BITABLE_APP_TOKEN'),
      tableId: getOptionalEnv('FEISHU_BITABLE_SALES_TABLE_ID'),
      tableIdEnv: 'FEISHU_BITABLE_SALES_TABLE_ID',
    },
    sync: {
      ...SHARED_MODULES.sales.sync,
      createFields: [
        { field: '货号', source: 'item_no' },
        { field: '颜色', source: 'color' },
        { field: '尺码', source: 'size', type: 'number' },
        { field: '数量', source: 'quantity', type: 'number' },
        { field: '金额（元）', source: 'amount', type: 'number', omitWhenEmpty: true },
        { field: '支付方式', source: 'pay_method', omitWhenEmpty: true },
        { field: '备注', source: 'remark', fallback: '' },
        { field: '对应图片', source: 'attachment' },
      ],
      updateFields: [],
      carryForwardFields: [],
    },
  },
};

const normalizeModule = (moduleKey) => {
  const key = String(moduleKey || '').trim().toLowerCase();
  if (!key) return 'purchase';
  if (!MODULES[key]) {
    const supported = Object.keys(MODULES).join(', ');
    throw new Error(`Invalid module: ${key}. Supported: ${supported}`);
  }
  return key;
};

const getModuleConfig = (moduleKey) => {
  const key = normalizeModule(moduleKey);
  const cfg = MODULES[key];
  const appToken = cfg.bitable.appToken;
  const tableId = cfg.bitable.tableId;
  if (!appToken) getRequiredEnv('FEISHU_BITABLE_APP_TOKEN');
  if (!tableId) getRequiredEnv(cfg.bitable.tableIdEnv);
  return cfg;
};

const getModuleDefinition = (moduleKey) => MODULES[normalizeModule(moduleKey)];

module.exports = {
  MODULES,
  normalizeModule,
  getModuleDefinition,
  getModuleConfig,
};
