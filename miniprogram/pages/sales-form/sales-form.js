const { getAuthHeader } = require('../../utils/api');

const PAY_OPTIONS = ['支付宝', '微信', '现金', '工商银行'];
const PAYMENT_STATUS_OPTIONS = ['未收款', '部分收款'];

const createDefaultForm = () => ({
  sale_amount: '',
  receivable_amount: '',
  payment_status: '未收款',
  paid_amount: '',
  pay_method: '',
  customer_name: '',
  customer_phone: '',
  expected_delivery_date: '',
  remark: '',
});

Page({
  data: {
    action: 'normal_sale',
    title: '普通销售',
    tempImagePath: '',
    loading: false,
    loadingText: '',
    successMessage: '',
    payOptions: PAY_OPTIONS,
    paymentStatusOptions: PAYMENT_STATUS_OPTIONS,
    form: createDefaultForm(),
  },

  onLoad(options) {
    const action = options && options.action === 'presale_order' ? 'presale_order' : 'normal_sale';
    this.setData({
      action,
      title: action === 'presale_order' ? '预售订单' : '普通销售',
    });
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onPayMethodChange(e) {
    this.setData({ 'form.pay_method': PAY_OPTIONS[e.detail.value] });
  },

  onPaymentStatusChange(e) {
    const value = PAYMENT_STATUS_OPTIONS[e.detail.value];
    const patch = { 'form.payment_status': value };
    if (value === '未收款') {
      patch['form.paid_amount'] = '';
      patch['form.pay_method'] = '';
    }
    this.setData(patch);
  },

  onDateChange(e) {
    this.setData({ 'form.expected_delivery_date': e.detail.value });
  },

  chooseImage() {
    if (this.data.loading) return;
    const applyPath = (filePath) => {
      if (filePath) this.setData({ tempImagePath: filePath, successMessage: '' });
    };

    const fallbackChooseImage = () => {
      wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => applyPath(res.tempFilePaths && res.tempFilePaths[0]),
        fail: () => wx.showToast({ title: '选择图片失败', icon: 'none' }),
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
        const file = res.tempFiles && res.tempFiles[0];
        applyPath(file && file.tempFilePath);
      },
      fail: fallbackChooseImage,
    });
  },

  validate() {
    const form = this.data.form;
    if (!this.data.tempImagePath) return '请先选择图片';
    if (this.data.action === 'normal_sale') {
      if (!form.sale_amount) return '请输入销售金额';
      if (!form.pay_method) return '请选择收款方式';
      return '';
    }
    if (!form.receivable_amount) return '请输入应收金额';
    if (!form.payment_status) return '请选择支付状态';
    if (form.payment_status === '部分收款') {
      if (!form.paid_amount) return '请输入已收金额';
      if (!form.pay_method) return '请选择收款方式';
    }
    return '';
  },

  submit() {
    if (this.data.loading) return;
    const error = this.validate();
    if (error) {
      wx.showToast({ title: error, icon: 'none' });
      return;
    }

    const app = getApp();
    const formData = Object.assign({}, this.data.form, { action: this.data.action });
    this.setData({
      loading: true,
      loadingText: '正在上传图片并创建识别任务...',
      successMessage: '',
    });

    wx.uploadFile({
      url: `${app.globalData.baseUrl}/api/sales/tasks`,
      filePath: this.data.tempImagePath,
      name: 'image',
      header: getAuthHeader(),
      formData,
      success: (res) => {
        let data = {};
        try {
          data = JSON.parse(res.data);
        } catch (e) {
          wx.showToast({ title: '响应格式错误', icon: 'none' });
          return;
        }
        if (!data.success) {
          wx.showToast({ title: data.error || '提交失败', icon: 'none' });
          return;
        }
        this.setData({
          tempImagePath: '',
          form: createDefaultForm(),
          successMessage: '已提交后台识别，可继续录入下一单',
        });
        wx.showToast({ title: '已提交后台识别', icon: 'success' });
      },
      fail: () => wx.showToast({ title: '网络请求失败', icon: 'none' }),
      complete: () => this.setData({ loading: false, loadingText: '' }),
    });
  },

  goToTasks() {
    wx.navigateTo({ url: '/pages/sales-tasks/sales-tasks' });
  },
});
