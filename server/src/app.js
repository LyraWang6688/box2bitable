const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const { logError, logInfo } = require('./utils/logger');
const { uploadDir } = require('./utils/upload');
const { startUploadCleanup } = require('./utils/uploadCleanup');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const app = express();
const port = process.env.PORT || 3000;

// Middleware
if (process.env.ENABLE_CORS === 'true') {
  app.use(cors());
}
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api', require('./middleware/auth'));
app.use('/api/recognition', require('./routes/recognition'));
app.use('/api/sync', require('./routes/sync'));
app.use('/api/query', require('./routes/query'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/sales/tasks', require('./routes/salesTasks'));

// Error handling middleware
app.use((err, req, res, next) => {
  logError('http.unhandled_error', {
    method: req.method,
    path: req.path,
    error: err.message,
    stack: err.stack,
  });
  const isUploadError = err && (err.name === 'MulterError' || /仅支持上传|Unexpected field/i.test(String(err.message || '')));
  if (isUploadError) {
    return res.status(400).json({ success: false, error: err.message || '上传参数错误' });
  }
  return res.status(500).json({ success: false, error: 'Internal Server Error' });
});

if (require.main === module) {
  const ttlMs = Number(process.env.UPLOAD_TTL_MS || 24 * 60 * 60 * 1000);
  const intervalMs = Number(process.env.UPLOAD_CLEAN_INTERVAL_MS || 60 * 60 * 1000);
  if (Number.isFinite(ttlMs) && ttlMs > 0 && Number.isFinite(intervalMs) && intervalMs > 0) {
    startUploadCleanup({ dir: uploadDir, ttlMs, intervalMs });
  }
  app.listen(port, () => {
    logInfo('server.started', { port });
  });
}

module.exports = app;
