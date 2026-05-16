const express = require('express');
const router = express.Router();

const recognitionController = require('../controllers/recognitionController');
const { upload } = require('../utils/upload');

// 上传图片并识别
router.post('/upload', upload.single('image'), recognitionController.uploadAndRecognize);

// 当前采用同步识别返回结果；预留查询接口，避免旧前端调用直接 404
router.get('/results/:task_id', (req, res) => {
  res.status(501).json({
    success: false,
    error: '当前部署版本未启用异步任务查询接口，请直接使用 /upload 的同步返回结果',
  });
});

module.exports = router;
