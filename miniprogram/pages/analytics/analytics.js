const { getAuthHeader } = require('../../utils/api');

const formatMoney = (value) => {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num.toFixed(2) : '0.00';
};

const buildSummaryCards = (summary) => [
  {
    key: 'amount',
    label: '今日销售额',
    value: `¥${formatMoney(summary.total_amount)}`,
    tone: 'blue',
  },
  {
    key: 'quantity',
    label: '今日销售数量',
    value: String(summary.total_quantity || 0),
    tone: 'green',
  },
  {
    key: 'orders',
    label: '今日销售笔数',
    value: String(summary.order_count || 0),
    tone: 'orange',
  },
];

Page({
  data: {
    loading: false,
    hasLoaded: false,
    date: '',
    summary: {
      total_amount: 0,
      total_quantity: 0,
      order_count: 0,
    },
    summaryCards: buildSummaryCards({}),
    payMethods: [],
    records: [],
  },

  onLoad() {
    this.fetchTodaySales();
  },

  onPullDownRefresh() {
    this.fetchTodaySales(() => wx.stopPullDownRefresh());
  },

  refresh() {
    this.fetchTodaySales();
  },

  fetchTodaySales(done) {
    if (this.data.loading) {
      if (done) done();
      return;
    }

    const app = getApp();
    this.setData({ loading: true });

    wx.request({
      url: `${app.globalData.baseUrl}/api/analytics/sales/today`,
      method: 'GET',
      header: getAuthHeader(),
      success: (res) => {
        const data = res.data || {};
        if (data.success) {
          const summary = data.summary || {};
          this.setData({
            hasLoaded: true,
            date: data.date || '',
            summary,
            summaryCards: buildSummaryCards(summary),
            payMethods: (data.pay_methods || []).map((item) => Object.assign({}, item, {
              amountText: formatMoney(item.amount),
            })),
            records: (data.records || []).map((item) => Object.assign({}, item, {
              amountText: formatMoney(item.amount),
            })),
          });
        } else {
          wx.showToast({ title: data.error || '数据分析加载失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.showToast({ title: '网络请求失败', icon: 'none' });
      },
      complete: () => {
        this.setData({ loading: false });
        if (typeof done === 'function') done();
      },
    });
  },
});
