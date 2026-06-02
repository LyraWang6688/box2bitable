Page({
  goNormalSale() {
    wx.navigateTo({ url: '/pages/sales-form/sales-form?action=normal_sale' });
  },

  goPresaleOrder() {
    wx.navigateTo({ url: '/pages/sales-form/sales-form?action=presale_order' });
  },

  goTasks() {
    wx.navigateTo({ url: '/pages/sales-tasks/sales-tasks' });
  },
});
