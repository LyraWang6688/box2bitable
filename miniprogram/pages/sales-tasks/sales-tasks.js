const { getAuthHeader } = require('../../utils/api');
const { getTaskStatusMeta } = require('../../utils/salesTaskStatus');

Page({
  data: {
    loading: false,
    loadingText: '',
    tasks: [],
  },

  onLoad() {
    this.fetchTasks();
  },

  onShow() {
    this.fetchTasks();
  },

  onPullDownRefresh() {
    this.fetchTasks(() => wx.stopPullDownRefresh());
  },

  fetchTasks(done) {
    const app = getApp();
    this.setData({ loading: true, loadingText: '正在获取识别任务...' });
    wx.request({
      url: `${app.globalData.baseUrl}/api/sales/tasks`,
      method: 'GET',
      header: getAuthHeader(),
      success: (res) => {
        const data = res.data || {};
        if (!data.success) {
          wx.showToast({ title: data.error || '加载失败', icon: 'none' });
          return;
        }
        const tasks = (data.tasks || []).map((task) => {
          const statusMeta = getTaskStatusMeta(task.status);
          return Object.assign({}, task, {
            statusLabel: statusMeta.label,
            statusDescription: statusMeta.description,
            statusTone: statusMeta.tone,
            canReview: statusMeta.canReview,
            itemCount: (task.recognition_results || []).length,
          });
        });
        this.setData({ tasks });
      },
      fail: () => wx.showToast({ title: '网络请求失败', icon: 'none' }),
      complete: () => {
        this.setData({ loading: false, loadingText: '' });
        if (typeof done === 'function') done();
      },
    });
  },

  openTask(e) {
    const taskId = e.currentTarget.dataset.id;
    const task = this.data.tasks.find((item) => item.task_id === taskId);
    if (!task || !task.canReview) {
      wx.showToast({ title: '识别完成后再复核', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/sales-review/sales-review?task_id=${encodeURIComponent(taskId)}` });
  },
});
