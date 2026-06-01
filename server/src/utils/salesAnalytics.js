const DATE_TIME_FORMATTER_CACHE = new Map();

const getFormatter = (timeZone, options) => {
  const key = `${timeZone}:${JSON.stringify(options)}`;
  if (!DATE_TIME_FORMATTER_CACHE.has(key)) {
    DATE_TIME_FORMATTER_CACHE.set(
      key,
      new Intl.DateTimeFormat('zh-CN', {
        timeZone,
        ...options,
      })
    );
  }
  return DATE_TIME_FORMATTER_CACHE.get(key);
};

const toFiniteNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const parseDateValue = (value) => {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = parseDateValue(item);
      if (parsed) return parsed;
    }
    return null;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const timestamp = value > 1e12 ? value : value > 1e9 ? value * 1000 : value;
    const parsed = new Date(timestamp);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) return parseDateValue(Number(trimmed));
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(/\./g, '-');
    const parsedNormalized = new Date(normalized);
    return Number.isNaN(parsedNormalized.getTime()) ? null : parsedNormalized;
  }

  if (typeof value === 'object') {
    const keys = ['timestamp', 'value', 'text', 'date', 'datetime'];
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const parsed = parseDateValue(value[key]);
        if (parsed) return parsed;
      }
    }
  }

  return null;
};

const formatDateKey = (date = new Date(), timeZone = 'Asia/Shanghai') => {
  const parts = getFormatter(timeZone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
};

const formatDateTime = (date, timeZone = 'Asia/Shanghai') => {
  if (!date) return '';
  const parts = getFormatter(timeZone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}`;
};

const getSaleDate = (fields = {}, record = {}) => {
  return parseDateValue(fields['销售日期'] || fields['录入时间'] || fields['创建时间'] || record.created_time);
};

const normalizeSalesRecord = (record, timeZone = 'Asia/Shanghai') => {
  const fields = record.fields || {};
  const saleDate = getSaleDate(fields, record);
  const quantity = toFiniteNumber(fields['数量'], 0);
  const amount = toFiniteNumber(fields['金额（元）'], 0);
  const payMethod = String(fields['支付方式'] || '未填写').trim() || '未填写';

  return {
    record_id: record.record_id || '',
    item_no: fields['货号'] || '',
    color: fields['颜色'] || '',
    size: fields['尺码'] == null ? '' : fields['尺码'],
    quantity,
    amount,
    pay_method: payMethod,
    sale_date: formatDateTime(saleDate, timeZone),
    sale_date_key: saleDate ? formatDateKey(saleDate, timeZone) : '',
    sale_timestamp: saleDate ? saleDate.getTime() : 0,
  };
};

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const buildSalesAnalytics = (records, options = {}) => {
  const timeZone = options.timeZone || 'Asia/Shanghai';
  const dateKey = options.dateKey || formatDateKey(new Date(), timeZone);

  const normalized = (records || [])
    .map((record) => normalizeSalesRecord(record, timeZone))
    .filter((record) => record.sale_date_key === dateKey);

  const summary = normalized.reduce(
    (acc, record) => {
      acc.total_amount += record.amount;
      acc.total_quantity += record.quantity;
      acc.order_count += 1;
      return acc;
    },
    { total_amount: 0, total_quantity: 0, order_count: 0 }
  );

  const payMethodMap = new Map();
  normalized.forEach((record) => {
    const current =
      payMethodMap.get(record.pay_method) || {
        pay_method: record.pay_method,
        amount: 0,
        quantity: 0,
        count: 0,
      };
    current.amount += record.amount;
    current.quantity += record.quantity;
    current.count += 1;
    payMethodMap.set(record.pay_method, current);
  });

  const payMethods = Array.from(payMethodMap.values())
    .map((item) => ({ ...item, amount: roundMoney(item.amount) }))
    .sort((a, b) => b.amount - a.amount || b.count - a.count || a.pay_method.localeCompare(b.pay_method));

  const detailRecords = normalized
    .map((record) => ({
      record_id: record.record_id,
      item_no: record.item_no,
      color: record.color,
      size: record.size,
      quantity: record.quantity,
      amount: roundMoney(record.amount),
      pay_method: record.pay_method,
      sale_date: record.sale_date,
      sale_timestamp: record.sale_timestamp,
    }))
    .sort((a, b) => b.sale_timestamp - a.sale_timestamp)
    .map(({ sale_timestamp, ...record }) => record);

  return {
    date: dateKey,
    summary: {
      total_amount: roundMoney(summary.total_amount),
      total_quantity: summary.total_quantity,
      order_count: summary.order_count,
    },
    pay_methods: payMethods,
    records: detailRecords,
  };
};

module.exports = {
  buildSalesAnalytics,
  formatDateKey,
  formatDateTime,
  parseDateValue,
};
