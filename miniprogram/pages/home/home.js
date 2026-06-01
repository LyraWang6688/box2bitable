Page({
  goEntry() {
    wx.navigateTo({ url: '/pages/entry/entry' });
  },

  goQuery() {
    wx.navigateTo({ url: '/pages/query/query' });
  },

  goAnalytics() {
    wx.navigateTo({ url: '/pages/analytics/analytics' });
  }
});
