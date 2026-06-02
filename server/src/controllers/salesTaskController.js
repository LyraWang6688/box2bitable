const { SalesTaskService } = require('../services/salesTaskService');
const { logError, logWarn } = require('../utils/logger');

const salesTaskService = new SalesTaskService();

const createTask = async (req, res) => {
  try {
    if (!req.file) {
      logWarn('sales_task.create.rejected', { reason: 'missing_file' });
      return res.status(400).json({ success: false, error: '未接收到图片文件' });
    }
    const task = await salesTaskService.createTask({
      action: req.body.action,
      input: req.body,
      file: req.file,
    });
    return res.status(202).json({
      success: true,
      task_id: task.task_id,
      status: task.status,
    });
  } catch (e) {
    logError('sales_task.create.failed', { error: e.message });
    return res.status(400).json({ success: false, error: e.message });
  }
};

const listTasks = async (req, res) => {
  try {
    const tasks = await salesTaskService.listTasks({ status: req.query.status });
    return res.json({ success: true, tasks });
  } catch (e) {
    logError('sales_task.list.failed', { error: e.message });
    return res.status(500).json({ success: false, error: e.message });
  }
};

const getTask = async (req, res) => {
  try {
    const task = await salesTaskService.getTask(req.params.task_id);
    if (!task) return res.status(404).json({ success: false, error: '任务不存在' });
    return res.json({ success: true, task });
  } catch (e) {
    logError('sales_task.get.failed', { task_id: req.params.task_id, error: e.message });
    return res.status(500).json({ success: false, error: e.message });
  }
};

const reviewTask = async (req, res) => {
  try {
    const task = await salesTaskService.reviewTask(req.params.task_id, req.body || {});
    return res.json({ success: true, task });
  } catch (e) {
    logError('sales_task.review.failed', { task_id: req.params.task_id, error: e.message });
    return res.status(500).json({ success: false, error: e.message });
  }
};

module.exports = {
  createTask,
  listTasks,
  getTask,
  reviewTask,
};
