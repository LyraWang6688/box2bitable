const feishuService = require('../services/feishuService');
const path = require('path');
const fs = require('fs');
const { uploadDir } = require('../utils/upload');
const { normalizeModule } = require('../config/modules');
const { buildSyncPayload } = require('../utils/syncAggregation');
const { logError, logInfo, logWarn } = require('../utils/logger');

const resolveUploadFilePath = (taskId) => {
  const raw = String(taskId || '');
  const base = path.basename(raw);
  if (!base) return null;
  if (base !== raw) return null;
  if (!/^image-\d+-\d+\.(jpg|jpeg|png|webp)$/i.test(base)) return null;

  const uploadRoot = path.resolve(uploadDir);
  const resolved = path.resolve(uploadDir, base);
  if (!resolved.startsWith(uploadRoot + path.sep)) return null;
  return resolved;
};

/**
 * Sync Controller
 * Handles synchronization of reviewed data to Feishu Bitable.
 */
const syncData = async (req, res) => {
  const startedAt = Date.now();
  let taskId = null;
  let module = 'purchase';
  try {
    const { reviewed_data, task_id, feishu_file_token, module: moduleRaw } = req.body;
    taskId = task_id || null;
    try {
      module = normalizeModule(moduleRaw);
    } catch (e) {
      logWarn('sync.rejected', { task_id: taskId, module: moduleRaw, reason: 'invalid_module', error: e.message });
      return res.status(400).json({ success: false, error: '无效的 module 参数' });
    }

    if (!reviewed_data || !Array.isArray(reviewed_data)) {
      logWarn('sync.rejected', { task_id: taskId, module, reason: 'invalid_reviewed_data' });
      return res.status(400).json({ success: false, error: '无效的复核数据' });
    }

    const aggregatedList = buildSyncPayload(reviewed_data, module);
    logInfo('sync.started', {
      task_id: taskId,
      module,
      reviewed_count: reviewed_data.length,
      payload_count: aggregatedList.length,
      has_feishu_file_token: Boolean(feishu_file_token),
    });
    
    const feishuFileToken = feishu_file_token || null;

    // 2. Sync to Feishu (Passing fileToken)
    const syncResults = await feishuService.syncToBitable(aggregatedList, task_id, feishuFileToken, module);

    // 3. Check for failures
    const failures = syncResults.filter(r => r.status === 'failed');
    
    if (failures.length > 0) {
      logWarn('sync.partial_failed', {
        task_id: taskId,
        module,
        duration_ms: Date.now() - startedAt,
        total_count: syncResults.length,
        success_count: syncResults.length - failures.length,
        failed_count: failures.length,
      });
      return res.status(207).json({
        success: false,
        message: `同步完成，但有 ${failures.length} 条数据失败`,
        results: syncResults
      });
    }

    // 4. Cleanup: Delete temporary image file on full success
    if (task_id) {
      const filePath = resolveUploadFilePath(task_id);
      if (!filePath) {
        logWarn('cleanup.skipped', { task_id: taskId, module, reason: 'invalid_task_id' });
      } else if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          logInfo('cleanup.completed', { task_id: taskId, module, file_name: task_id, reason: 'sync_completed' });
        } catch (cleanupError) {
          logWarn('cleanup.failed', {
            task_id: taskId,
            module,
            file_name: task_id,
            reason: 'sync_completed',
            error: cleanupError.message,
          });
        }
      }
    }

    logInfo('sync.completed', {
      task_id: taskId,
      module,
      duration_ms: Date.now() - startedAt,
      total_count: syncResults.length,
      success_count: syncResults.length,
      failed_count: 0,
    });

    res.json({
      success: true,
      message: '数据已成功同步至飞书多维表格',
      results: syncResults
    });

  } catch (error) {
    logError('sync.failed', {
      task_id: taskId,
      module,
      duration_ms: Date.now() - startedAt,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: '同步过程中出现异常: ' + error.message
    });
  }
};

/**
 * Retry Sync Controller
 * Retries failed records for a specific task.
 */
const retrySync = async (req, res) => {
  const startedAt = Date.now();
  let taskId = null;
  let module = 'purchase';
  try {
    const { failed_records, task_id, feishu_file_token, module: moduleRaw } = req.body;
    taskId = task_id || null;
    try {
      module = normalizeModule(moduleRaw);
    } catch (e) {
      logWarn('sync.retry.rejected', { task_id: taskId, module: moduleRaw, reason: 'invalid_module', error: e.message });
      return res.status(400).json({ success: false, error: '无效的 module 参数' });
    }

    if (!failed_records || !Array.isArray(failed_records) || failed_records.length === 0) {
      logWarn('sync.retry.rejected', { task_id: taskId, module, reason: 'missing_failed_records' });
      return res.status(400).json({ success: false, error: '缺少需要重试的失败记录' });
    }

    const feishuFileToken = feishu_file_token || null;
    const aggregatedList = failed_records.map((record) => record.item || record);
    logInfo('sync.retry.started', {
      task_id: taskId,
      module,
      retry_count: aggregatedList.length,
      has_feishu_file_token: Boolean(feishuFileToken),
    });

    const syncResults = await feishuService.syncToBitable(aggregatedList, task_id, feishuFileToken, module);

    const finalFailures = syncResults.filter(r => r.status === 'failed');
    if (finalFailures.length === 0 && task_id) {
      const filePath = resolveUploadFilePath(task_id);
      if (!filePath) {
        logWarn('cleanup.skipped', { task_id: taskId, module, reason: 'invalid_task_id' });
      } else if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          logInfo('cleanup.completed', { task_id: taskId, module, file_name: task_id, reason: 'sync_retry_completed' });
        } catch (e) {
          logWarn('cleanup.failed', {
            task_id: taskId,
            module,
            file_name: task_id,
            reason: 'sync_retry_completed',
            error: e.message,
          });
        }
      }
    }

    logInfo(finalFailures.length === 0 ? 'sync.retry.completed' : 'sync.retry.partial_failed', {
      task_id: taskId,
      module,
      duration_ms: Date.now() - startedAt,
      total_count: syncResults.length,
      success_count: syncResults.length - finalFailures.length,
      failed_count: finalFailures.length,
    });

    res.json({
      success: finalFailures.length === 0,
      message: finalFailures.length === 0 ? '重试同步成功' : `重试完成，但仍有 ${finalFailures.length} 条数据失败`,
      results: syncResults
    });

  } catch (error) {
    logError('sync.retry.failed', {
      task_id: taskId,
      module,
      duration_ms: Date.now() - startedAt,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: '重试同步过程中出现异常: ' + error.message
    });
  }
};

module.exports = {
  syncData,
  retrySync
};
