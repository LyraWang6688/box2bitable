const { getModuleList } = require('../../config/modules');

Page({
  data: {
    modules: getModuleList()
  },

  chooseModule(e) {
    const moduleKey = e.currentTarget.dataset.module;
    if (moduleKey === 'sales') {
      wx.navigateTo({ url: '/pages/sales-entry/sales-entry' });
      return;
    }
    const url = `/pages/index/index?module=${encodeURIComponent(moduleKey)}`;
    wx.navigateTo({ url });
  }
});
