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
    taskId: '',
    loading: false,
    syncing: false,
    task: null,
    items: [],
    statusLabel: '',
    canReview: false,
  },

  onLoad(options) {
    this.setData({ taskId: options.task_id || '' });
    this.fetchTask();
  },

  fetchTask() {
    if (!this.data.taskId) return;
    const app = getApp();
    this.setData({ loading: true });
    wx.request({
      url: `${app.globalData.baseUrl}/api/sales/tasks/${encodeURIComponent(this.data.taskId)}`,
      method: 'GET',
      header: getAuthHeader(),
      success: (res) => {
        const data = res.data || {};
        if (!data.success) {
          wx.showToast({ title: data.error || '加载失败', icon: 'none' });
          return;
        }
        const task = data.task || {};
        this.setData({
          task,
          statusLabel: STATUS_LABELS[task.status] || task.status,
          canReview: task.status === 'recognition_done',
          items: (task.recognition_results || []).map((item) => Object.assign({ default_price: '' }, item)),
        });
      },
      fail: () => wx.showToast({ title: '网络请求失败', icon: 'none' }),
      complete: () => this.setData({ loading: false }),
    });
  },

  onInput(e) {
    const index = e.currentTarget.dataset.index;
    const field = e.currentTarget.dataset.field;
    const items = this.data.items;
    items[index][field] = e.detail.value;
    this.setData({ items });
  },

  removeItem(e) {
    const index = e.currentTarget.dataset.index;
    const items = this.data.items;
    items.splice(index, 1);
    this.setData({ items });
  },

  validate() {
    if (!this.data.task || this.data.task.status !== 'recognition_done') return '当前任务还不能复核';
    if (this.data.items.length === 0) return '没有可复核的子单';
    for (let i = 0; i < this.data.items.length; i += 1) {
      const item = this.data.items[i];
      if (!item.item_no) return `第 ${i + 1} 条缺少货号`;
      if (!item.size) return `第 ${i + 1} 条缺少尺码`;
      if (!item.default_price) return `第 ${i + 1} 条缺少默认售价`;
    }
    return '';
  },

  submitReview() {
    const error = this.validate();
    if (error) {
      wx.showToast({ title: error, icon: 'none' });
      return;
    }

    const app = getApp();
    this.setData({ syncing: true });
    wx.request({
      url: `${app.globalData.baseUrl}/api/sales/tasks/${encodeURIComponent(this.data.taskId)}/review`,
      method: 'POST',
      header: Object.assign({ 'content-type': 'application/json' }, getAuthHeader()),
      data: {
        items: this.data.items.map((item) => ({
          item_no: item.item_no,
          color: item.color,
          size: item.size,
          quantity: item.quantity || 1,
          default_price: item.default_price,
        })),
      },
      success: (res) => {
        const data = res.data || {};
        if (!data.success) {
          wx.showToast({ title: data.error || '同步失败', icon: 'none' });
          return;
        }
        wx.showModal({
          title: '同步成功',
          content: '销售总单、子单和资金流水已写入飞书。',
          showCancel: false,
          success: () => wx.navigateBack(),
        });
      },
      fail: () => wx.showToast({ title: '网络请求失败', icon: 'none' }),
      complete: () => this.setData({ syncing: false }),
    });
  },
});
