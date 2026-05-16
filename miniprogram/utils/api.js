const loadConfig = () => {
  try {
    return require('../config.local');
  } catch (e) {
    return { apiKeyByEnv: {} };
  }
};

const getEnvVersion = () => {
  try {
    const accountInfo = wx.getAccountInfoSync();
    return accountInfo && accountInfo.miniProgram && accountInfo.miniProgram.envVersion
      ? accountInfo.miniProgram.envVersion
      : 'develop';
  } catch (e) {
    return 'develop';
  }
};

const getApiKey = () => {
  const env = getEnvVersion();
  const config = loadConfig();
  const apiKeyByEnv = (config && config.apiKeyByEnv) || {};
  return apiKeyByEnv[env] || apiKeyByEnv.develop || '';
};

const getAuthHeader = () => {
  const apiKey = getApiKey();
  return apiKey ? { 'x-api-key': apiKey } : {};
};

module.exports = {
  getAuthHeader
};
