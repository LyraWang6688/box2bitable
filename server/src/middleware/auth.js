const { logWarn } = require('../utils/logger');

const timingSafeEqual = (a, b) => {
  const sa = String(a || '');
  const sb = String(b || '');
  if (sa.length !== sb.length) return false;
  let out = 0;
  for (let i = 0; i < sa.length; i++) out |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
  return out === 0;
};

const requireApiKey = (req, res, next) => {
  const expected = process.env.API_KEY;
  const provided = req.headers['x-api-key'];

  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      logWarn('auth.misconfigured', { reason: 'missing_api_key_env' });
      return res.status(500).json({ success: false, error: '服务端鉴权未配置' });
    }
    return next();
  }

  if (!provided || !timingSafeEqual(provided, expected)) {
    logWarn('auth.rejected', { path: req.path, reason: provided ? 'invalid_key' : 'missing_key' });
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  return next();
};

module.exports = requireApiKey;

