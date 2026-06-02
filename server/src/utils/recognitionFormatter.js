const { normalizeSize, validateSize, generateSkuCode } = require('./formatter');

const formatRecognitionResults = (results) => {
  return (results || []).map((item) => {
    const normalizedSize = normalizeSize(item.size);
    const validation = validateSize(normalizedSize);
    const skuCode = generateSkuCode(item.item_no, item.color, normalizedSize);

    if (!item.item_no || !normalizedSize) {
      validation.isAnomaly = true;
      validation.message = '货号或尺码缺失，无法生成有效 SKU';
    }

    return {
      item_no: item.item_no || '',
      color: item.color || '',
      size: normalizedSize,
      quantity: item.quantity || 1,
      supplier: item.supplier || '',
      sku_code: skuCode,
      is_anomaly: validation.isAnomaly,
      validation_message: validation.message || null,
    };
  });
};

module.exports = {
  formatRecognitionResults,
};
