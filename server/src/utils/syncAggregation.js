const { generateSkuCode } = require('./formatter');
const { getModuleDefinition } = require('../config/modules');

const buildSyncPayload = (reviewedData, moduleKey = 'purchase') => {
  const moduleConfig = getModuleDefinition(moduleKey);
  const payloadBuilders = {
    detail_rows: buildDetailRows,
    aggregate_by_sku: buildAggregatedSkuRows,
  };
  const builder = payloadBuilders[moduleConfig.sync.payloadMode];
  if (!builder) throw new Error(`Unsupported sync payload mode: ${moduleConfig.sync.payloadMode}`);
  return builder(reviewedData);
};

const buildDetailRows = (reviewedData) => {
  return (reviewedData || []).map((item) => ({
    ...item,
    quantity: item.quantity != null && item.quantity !== '' ? Number(item.quantity) : 1,
    amount: item.amount != null && item.amount !== '' ? Number(item.amount) : undefined,
  }));
};

const buildAggregatedSkuRows = (reviewedData) => {
  const aggregationMap = {};
  (reviewedData || []).forEach((item) => {
    const key = generateSkuCode(item.item_no, item.color, item.size);
    const qty = item.quantity != null && item.quantity !== '' ? Number(item.quantity) : 1;
    const safeQty = Number.isFinite(qty) && qty > 0 ? qty : 1;
    if (aggregationMap[key]) {
      aggregationMap[key].quantity += safeQty;
    } else {
      aggregationMap[key] = {
        ...item,
        quantity: safeQty,
      };
    }
  });

  return Object.values(aggregationMap);
};

module.exports = {
  buildSyncPayload,
};
