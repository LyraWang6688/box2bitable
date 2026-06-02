const toMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
const toWholeMoney = (value) => Math.round(Number(value) || 0);

const allocateDiscount = (items, totalReceivableAmount) => {
  const rows = (items || []).map((item) => {
    const quantity = Number(item.quantity || 1);
    const defaultPrice = Number(item.default_price ?? item.default_amount ?? item.amount ?? item.price ?? 0);
    const lineOriginalAmount = toMoney(defaultPrice * (Number.isFinite(quantity) && quantity > 0 ? quantity : 1));
    return {
      ...item,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      original_amount: lineOriginalAmount,
    };
  });

  const originalTotal = toWholeMoney(rows.reduce((sum, item) => sum + item.original_amount, 0));
  const receivableTotal = toWholeMoney(totalReceivableAmount == null ? originalTotal : totalReceivableAmount);
  const discountTotal = toWholeMoney(originalTotal - receivableTotal);

  if (rows.length === 0) {
    return {
      original_total: 0,
      receivable_total: receivableTotal,
      discount_total: discountTotal,
      items: [],
    };
  }

  if (originalTotal <= 0 || discountTotal === 0) {
    return {
      original_total: originalTotal,
      receivable_total: receivableTotal,
      discount_total: discountTotal,
      items: rows.map((item) => ({
        ...item,
        discount_amount: 0,
        receivable_amount: toMoney(item.original_amount),
      })),
    };
  }

  let allocatedDiscount = 0;
  const allocated = rows.map((item, index) => {
    const isLast = index === rows.length - 1;
    const discount = isLast
      ? toWholeMoney(discountTotal - allocatedDiscount)
      : toWholeMoney((discountTotal * item.original_amount) / originalTotal);
    allocatedDiscount = toWholeMoney(allocatedDiscount + discount);
    return {
      ...item,
      discount_amount: discount,
      receivable_amount: toWholeMoney(item.original_amount - discount),
    };
  });

  return {
    original_total: originalTotal,
    receivable_total: receivableTotal,
    discount_total: discountTotal,
    items: allocated,
  };
};

module.exports = {
  allocateDiscount,
  toMoney,
};
