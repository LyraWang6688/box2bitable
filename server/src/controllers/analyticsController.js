const feishuService = require('../services/feishuService');
const { normalizeModule } = require('../config/modules');
const { buildSalesAnalytics, formatDateKey } = require('../utils/salesAnalytics');
const { logError, logInfo } = require('../utils/logger');

const listBitableRecords = async (target, options = {}) => {
  let pageToken = undefined;
  const all = [];
  const maxPages = Math.max(1, Number(options.maxPages || 20));
  const pageSize = Math.min(500, Math.max(1, Number(options.pageSize || 200)));

  for (let i = 0; i < maxPages; i += 1) {
    const resp = await feishuService.client.bitable.appTableRecord.list({
      path: {
        app_token: target.appToken,
        table_id: target.tableId,
      },
      params: {
        page_size: pageSize,
        page_token: pageToken,
      },
    });

    if (resp.code !== 0) {
      const err = new Error(`飞书查询失败: ${resp.msg}`);
      err.code = resp.code;
      throw err;
    }

    all.push(...(resp.data?.items || []));
    if (!resp.data?.has_more) break;
    pageToken = resp.data?.page_token;
    if (!pageToken) break;
  }

  return all;
};

const getTodaySalesAnalytics = async (req, res) => {
  const startedAt = Date.now();
  const module = normalizeModule('sales');
  const timeZone = process.env.BUSINESS_TIME_ZONE || 'Asia/Shanghai';
  const date = formatDateKey(new Date(), timeZone);

  try {
    const target = feishuService._getBitableTarget(module);
    logInfo('analytics.sales.today.started', { module, date, time_zone: timeZone });

    const records = await listBitableRecords(target, {
      maxPages: process.env.ANALYTICS_MAX_PAGES || 20,
      pageSize: process.env.ANALYTICS_PAGE_SIZE || 200,
    });
    const analytics = buildSalesAnalytics(records, { dateKey: date, timeZone });

    logInfo('analytics.sales.today.completed', {
      module,
      date,
      duration_ms: Date.now() - startedAt,
      source_record_count: records.length,
      result_record_count: analytics.records.length,
      total_amount: analytics.summary.total_amount,
    });

    res.json({ success: true, ...analytics });
  } catch (e) {
    logError('analytics.sales.today.failed', {
      module,
      date,
      duration_ms: Date.now() - startedAt,
      error: e.message,
      code: e.code,
    });
    res.status(500).json({ success: false, error: e.message });
  }
};

module.exports = {
  getTodaySalesAnalytics,
  listBitableRecords,
};
