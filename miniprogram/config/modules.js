const { MODULES } = require('./modules.shared');

const normalizeModule = (moduleKey) => {
  const key = String(moduleKey || '').trim().toLowerCase();
  return MODULES[key] ? key : 'purchase';
};

const getModuleConfig = (moduleKey) => MODULES[normalizeModule(moduleKey)];

const getModuleList = () => ['purchase', 'sales', 'inventory'].map((key) => MODULES[key]);

module.exports = {
  MODULES,
  normalizeModule,
  getModuleConfig,
  getModuleList,
};
