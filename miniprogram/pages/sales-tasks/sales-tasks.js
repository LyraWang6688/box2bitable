const { getAuthHeader } = require('../../utils/api');

const STATUS_LABELS = {
  pending_recognition: '待识别',
  recognizing: '识别中',
  recognition_done: '待复核',
  recognition_failed: '识别失败',
  synced: '已同步',
  sync_failed: '同步失败',
};

Page({
  data: {
    loading: false,
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
    this.setData({ loading: true });
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
        const tasks = (data.tasks || []).map((task) => Object.assign({}, task, {
          statusLabel: STATUS_LABELS[task.status] || task.status,
          itemCount: (task.recognition_results || []).length,
        }));
        this.setData({ tasks });
      },
      fail: () => wx.showToast({ title: '网络请求失败', icon: 'none' }),
      complete: () => {
        this.setData({ loading: false });
        if (typeof done === 'function') done();
      },
    });
  },

  openTask(e) {
    const taskId = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/sales-review/sales-review?task_id=${encodeURIComponent(taskId)}` });
  },
});
