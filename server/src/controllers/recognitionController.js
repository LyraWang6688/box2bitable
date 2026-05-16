const doubaoService = require('../services/doubaoService');
const { normalizeSize, validateSize, generateSkuCode } = require('../utils/formatter');
const fs = require('fs');
const { normalizeModule } = require('../config/modules');

/**
 * Recognition Controller
 * Handles incoming image uploads and calls the AI service.
 */
const uploadAndRecognize = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '未接收到图片文件' });
    }

    const module = normalizeModule(req.body?.module);
    const filePath = req.file.path;
    const fileName = req.file.filename;
    console.log('开始识别文件:', filePath);

    // 1. 提前上传图片到飞书并获取 token，后续同步直接写入多维表格附件字段。
    const feishuService = require('../services/feishuService');
    let feishuFileToken = null;
    try {
      console.log('正在提前上传图片到飞书...');
      feishuFileToken = await feishuService.uploadAttachment(fileName, module);
      if (feishuFileToken) {
        console.log('飞书图片 Token 已获取:', feishuFileToken);
      }
    } catch (uploadError) {
      console.error('提前上传飞书失败 (不影响识别):', uploadError.message);
    }

    // 2. 调用豆包 AI 服务
    let results = await doubaoService.recognizeLabels(filePath, module);

    // 3. 格式化识别结果，交给前端复核。
    const formattedResults = results.map(item => {
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
        supplier: item.supplier || '',
        sku_code: skuCode,
        is_anomaly: validation.isAnomaly,
        validation_message: validation.message || null
      };
    });

    console.log('识别成功:', formattedResults);
    
    res.json({
      success: true,
      task_id: fileName, // 保持与前端逻辑一致，使用文件名作为 task_id 标识物理文件
      feishu_file_token: feishuFileToken,
      module,
      results: formattedResults
    });

  } catch (error) {
    console.error('识别控制器错误:', error);

    // 清理临时文件
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
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
