const { getModuleList } = require('../../config/modules');

Page({
  data: {
    modules: getModuleList()
  },

  chooseModule(e) {
    const moduleKey = e.currentTarget.dataset.module;
    const url = `/pages/index/index?module=${encodeURIComponent(moduleKey)}`;
    wx.navigateTo({ url });
  }
});
