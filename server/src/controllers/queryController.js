const feishuService = require('../services/feishuService');
const { normalizeModule } = require('../config/modules');
const { logError, logInfo, logWarn } = require('../utils/logger');

const escapeFilterValue = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const queryInventory = async (req, res) => {
  const startedAt = Date.now();
  let itemNo = '';
  try {
    itemNo = String(req.query.item_no || '').trim();
    if (!itemNo) {
      logWarn('query.inventory.rejected', { reason: 'missing_item_no' });
      return res.status(400).json({ success: false, error: '缺少货号 item_no' });
    }

    const module = normalizeModule('inventory');
    const target = feishuService._getBitableTarget(module);
    logInfo('query.inventory.started', { module, item_no: itemNo });

    const filter = `CurrentValue.[货号]="${escapeFilterValue(itemNo)}"`;
    let pageToken = undefined;
    const all = [];

    for (let i = 0; i < 20; i++) {
      const resp = await feishuService.client.bitable.appTableRecord.list({
        path: {
          app_token: target.appToken,
          table_id: target.tableId,
        },
        params: {
          filter,
          page_size: 200,
          page_token: pageToken,
        },
      });

      if (resp.code !== 0) {
        logError('query.inventory.failed', {
          module,
          item_no: itemNo,
          duration_ms: Date.now() - startedAt,
          error: resp.msg,
          code: resp.code,
        });
        return res.status(500).json({ success: false, error: `飞书查询失败: ${resp.msg}` });
      }

      const items = resp.data?.items || [];
      all.push(...items);
      if (!resp.data?.has_more) break;
      pageToken = resp.data?.page_token;
      if (!pageToken) break;
    }

    const qtyBySize = new Map();
    for (const r of all) {
      const fields = r.fields || {};
      const size = fields['尺码'];
      const qty = Number(fields['数量'] || 0);
      const key = String(size);
      qtyBySize.set(key, (qtyBySize.get(key) || 0) + qty);
    }

    const rows = Array.from(qtyBySize.entries())
      .map(([size, quantity]) => ({ size: Number.isFinite(Number(size)) ? Number(size) : size, quantity }))
      .sort((a, b) => {
        const na = Number(a.size);
        const nb = Number(b.size);
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return String(a.size).localeCompare(String(b.size));
      });

    logInfo('query.inventory.completed', {
      module,
      item_no: itemNo,
      duration_ms: Date.now() - startedAt,
      source_record_count: all.length,
      result_count: rows.length,
    });

    res.json({ success: true, item_no: itemNo, rows });
  } catch (e) {
    logError('query.inventory.failed', {
      item_no: itemNo,
      duration_ms: Date.now() - startedAt,
      error: e.message,
    });
    res.status(500).json({ success: false, error: e.message });
  }
};

module.exports = {
  queryInventory,
};
