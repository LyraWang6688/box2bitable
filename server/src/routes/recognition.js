const express = require('express');
const router = express.Router();

const recognitionController = require('../controllers/recognitionController');
const { upload, isSafeUploadName } = require('../utils/upload');

// 上传图片并识别
router.post(
  '/upload',
  (req, res, next) => {
    const ct = String(req.headers['content-type'] || '');
    if (ct.startsWith('multipart/form-data')) {
      return upload.single('image')(req, res, next);
    }
    next();
  },
  recognitionController.uploadAndRecognize
);

// 获取识别结果
router.get('/results/:task_id', (req, res) => {
  const taskId = String(req.params.task_id || '').trim();
  if (!isSafeUploadName(taskId)) {
    return res.status(400).json({ success: false, error: 'Invalid task_id' });
  }

  const task = recognitionController.getTask(taskId);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }

  res.json({
    success: true,
    task_id: taskId,
    status: task.status || 'processing',
    module: task.module || '',
    file_token: task.file_token || '',
    results: task.status === 'done' ? (task.results || []) : [],
    error: task.status === 'failed' ? (task.error || '识别失败') : '',
  });
});

module.exports = router;
