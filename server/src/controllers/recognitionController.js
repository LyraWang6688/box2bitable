const doubaoService = require('../services/doubaoService');
const fs = require('fs');
const { normalizeModule } = require('../config/modules');
const { logError, logInfo, logWarn } = require('../utils/logger');
const { formatRecognitionResults } = require('../utils/recognitionFormatter');

/**
 * Recognition Controller
 * Handles incoming image uploads and calls the AI service.
 */
const uploadAndRecognize = async (req, res) => {
  const startedAt = Date.now();
  let taskId = null;
  let module = 'purchase';
  try {
    if (!req.file) {
      logWarn('recognition.upload.rejected', { reason: 'missing_file' });
      return res.status(400).json({ success: false, error: '未接收到图片文件' });
    }

    try {
      module = normalizeModule(req.body?.module);
    } catch (e) {
      logWarn('recognition.upload.rejected', { reason: 'invalid_module', error: e.message });
      return res.status(400).json({ success: false, error: '无效的 module 参数' });
    }
    const filePath = req.file.path;
    const fileName = req.file.filename;
    taskId = fileName;
    logInfo('recognition.upload.received', {
      task_id: taskId,
      module,
      file_name: fileName,
      file_size: req.file.size,
      mime_type: req.file.mimetype,
    });

    // 1. 提前上传图片到飞书并获取 token，后续同步直接写入多维表格附件字段。
    const feishuService = require('../services/feishuService');
    let feishuFileToken = null;
    const attachmentStartedAt = Date.now();
    try {
      logInfo('recognition.attachment.started', { task_id: taskId, module });
      feishuFileToken = await feishuService.uploadAttachment(fileName, module);
      if (feishuFileToken) {
        logInfo('recognition.attachment.completed', {
          task_id: taskId,
          module,
          duration_ms: Date.now() - attachmentStartedAt,
          feishu_file_token: feishuFileToken,
        });
      } else {
        logWarn('recognition.attachment.missing_token', {
          task_id: taskId,
          module,
          duration_ms: Date.now() - attachmentStartedAt,
        });
      }
    } catch (uploadError) {
      logWarn('recognition.attachment.failed', {
        task_id: taskId,
        module,
        duration_ms: Date.now() - attachmentStartedAt,
        error: uploadError.message,
      });
    }

    // 2. 调用豆包 AI 服务
    const doubaoStartedAt = Date.now();
    logInfo('recognition.doubao.started', { task_id: taskId, module });
    let results = await doubaoService.recognizeLabels(filePath, module);
    logInfo('recognition.doubao.completed', {
      task_id: taskId,
      module,
      duration_ms: Date.now() - doubaoStartedAt,
      result_count: Array.isArray(results) ? results.length : 0,
    });

    // 3. 格式化识别结果，交给前端复核。
    const formattedResults = formatRecognitionResults(results);

    const anomalyCount = formattedResults.filter((item) => item.is_anomaly).length;
    logInfo('recognition.completed', {
      task_id: taskId,
      module,
      duration_ms: Date.now() - startedAt,
      result_count: formattedResults.length,
      anomaly_count: anomalyCount,
      has_feishu_file_token: Boolean(feishuFileToken),
    });
    
    res.json({
      success: true,
      task_id: fileName, // 保持与前端逻辑一致，使用文件名作为 task_id 标识物理文件
      feishu_file_token: feishuFileToken,
      module,
      results: formattedResults
    });

  } catch (error) {
    logError('recognition.failed', {
      task_id: taskId,
      module,
      duration_ms: Date.now() - startedAt,
      error: error.message,
    });

    // 清理临时文件
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
      logInfo('cleanup.completed', {
        task_id: taskId || req.file.filename,
        module,
        file_name: req.file.filename,
        reason: 'recognition_failed',
      });
    }

    res.status(500).json({
      success: false,
      error: 'AI识别或数据保存失败: ' + error.message
    });
  }
};

module.exports = {
  uploadAndRecognize
};
