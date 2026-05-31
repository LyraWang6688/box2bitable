const safeGetAuthHeader = () => {
  try {
    const { getAuthHeader } = require('../../utils/api');
    return typeof getAuthHeader === 'function' ? getAuthHeader() : {};
  } catch (e) {
    console.warn('load api auth header failed:', e);
    return {};
  }
};
const { getModuleConfig } = require('../../config/modules');

Page({
  data: {
    tempImagePath: '',
    loading: false,
    module: 'purchase',
    moduleLabel: '采购'
  },

  onLoad(options) {
    const moduleKey = options && options.module ? String(options.module) : 'purchase';
    const moduleConfig = getModuleConfig(moduleKey);
    this.setData({
      module: moduleConfig.key,
      moduleLabel: moduleConfig.label
    });
  },

  chooseImage() {
    const applyPath = (filePath) => {
      if (!filePath) return;
      this.setData({ tempImagePath: filePath });
    };

    const fallbackChooseImage = () => {
      wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const paths = res && res.tempFilePaths;
          applyPath(paths && paths[0]);
        },
        fail: () => {
          wx.showToast({ title: '选择图片失败', icon: 'none' });
        }
      });
    };

    if (typeof wx.chooseMedia !== 'function') {
      fallbackChooseImage();
      return;
    }

    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res && res.tempFiles && res.tempFiles[0];
        applyPath(file && file.tempFilePath);
      },
      fail: () => {
        fallbackChooseImage();
      }
    });
  },

  uploadAndRecognize() {
    if (!this.data.tempImagePath) return;

    this.setData({ loading: true });
    const app = getApp();

    wx.uploadFile({
      url: `${app.globalData.baseUrl}/api/recognition/upload`,
      filePath: this.data.tempImagePath,
      name: 'image',
      header: safeGetAuthHeader(),
      formData: {
        module: this.data.module
      },
      success: (res) => {
        let data = {};
        try {
          data = JSON.parse(res.data);
        } catch (e) {
          wx.showToast({
            title: '识别响应格式错误',
            icon: 'none'
          });
          this.setData({ loading: false });
          return;
        }

        if (data.success && data.async && data.task_id) {
          this.pollRecognitionResult(data.task_id, 0);
          return;
        }

        if (data.success) {
          this.goReview(data);
        } else {
          wx.showToast({
            title: data.error || '识别失败',
            icon: 'none'
          });
          this.setData({ loading: false });
        }
      },
      fail: (err) => {
        wx.showToast({
          title: '网络请求失败',
          icon: 'none'
        });
        this.setData({ loading: false });
      },
      complete: () => {
        // 异步识别需要保持 loading，等待轮询完成后再关闭。
      }
    });
  },

  pollRecognitionResult(taskId, retryCount) {
    const app = getApp();
    const maxRetry = 40;

    wx.request({
      url: `${app.globalData.baseUrl}/api/recognition/results/${encodeURIComponent(taskId)}`,
      method: 'GET',
      header: safeGetAuthHeader(),
      success: (res) => {
        const data = res.data || {};
        if (data.success && (data.status === 'done' || Array.isArray(data.results))) {
          this.goReview(data);
          return;
        }

        if (data.status === 'failed' || data.error) {
          wx.showToast({
            title: data.error || '识别失败',
            icon: 'none'
          });
          this.setData({ loading: false });
          return;
        }

        if (retryCount >= maxRetry) {
          wx.showToast({
            title: '识别超时，请稍后重试',
            icon: 'none'
          });
          this.setData({ loading: false });
          return;
        }

        setTimeout(() => {
          this.pollRecognitionResult(taskId, retryCount + 1);
        }, 1500);
      },
      fail: () => {
        wx.showToast({
          title: '查询识别结果失败',
          icon: 'none'
        });
        this.setData({ loading: false });
      }
    });
  },

  goReview(data) {
    const app = getApp();
    app.globalData.lastResults = data.results || [];
    app.globalData.lastTaskId = data.task_id;
    app.globalData.lastFeishuFileToken = data.feishu_file_token || data.file_token;
    app.globalData.lastModule = data.module || this.data.module;
    this.setData({ loading: false });

    wx.navigateTo({
      url: `/pages/review/review?module=${encodeURIComponent(data.module || this.data.module)}`
    });
  }
});
