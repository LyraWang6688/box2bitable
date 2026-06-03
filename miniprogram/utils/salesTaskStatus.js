const TASK_STATUS_META = {
  pending_recognition: {
    label: '待识别',
    description: '任务已创建，等待后台开始识别',
    tone: 'blue',
    canReview: false,
  },
  recognizing: {
    label: '识别中',
    description: '豆包正在识别图片，请稍后查看',
    tone: 'blue',
    canReview: false,
  },
  recognition_done: {
    label: '待复核',
    description: '识别完成，可以复核并写入飞书',
    tone: 'green',
    canReview: true,
  },
  recognition_failed: {
    label: '识别失败',
    description: '识别未完成，请稍后重新提交',
    tone: 'red',
    canReview: false,
  },
  synced: {
    label: '已写入',
    description: '销售数据已写入飞书',
    tone: 'green',
    canReview: false,
  },
  sync_failed: {
    label: '写入失败',
    description: '复核后写入飞书失败，请排查后重试',
    tone: 'red',
    canReview: true,
  },
  unknown: {
    label: '未知状态',
    description: '任务状态暂未识别',
    tone: 'gray',
    canReview: false,
  },
};

const getTaskStatusMeta = (status) => TASK_STATUS_META[status] || TASK_STATUS_META.unknown;

module.exports = {
  TASK_STATUS_META,
  getTaskStatusMeta,
};
