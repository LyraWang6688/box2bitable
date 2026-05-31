const fs = require('fs');
const path = require('path');
const { logError, logInfo, logWarn } = require('./logger');

const isAllowedUploadName = (name) => /^image-\d+-\d+\.(jpg|jpeg|png|webp)$/i.test(String(name || ''));

const safeResolveInDir = (dir, name) => {
  const base = path.basename(String(name || ''));
  if (!base || base !== name) return null;
  const root = path.resolve(dir);
  const resolved = path.resolve(dir, base);
  if (!resolved.startsWith(root + path.sep)) return null;
  return resolved;
};

const cleanupOnce = async ({ dir, ttlMs, maxDeletesPerRun = 200 }) => {
  const startedAt = Date.now();
  const now = Date.now();
  let deleted = 0;
  let scanned = 0;

  let entries = [];
  try {
    entries = await fs.promises.readdir(dir);
  } catch (e) {
    if (e && e.code === 'ENOENT') return { deleted: 0, scanned: 0, durationMs: Date.now() - startedAt };
    throw e;
  }

  for (const name of entries) {
    scanned += 1;
    if (deleted >= maxDeletesPerRun) break;
    if (!isAllowedUploadName(name)) continue;

    const resolved = safeResolveInDir(dir, name);
    if (!resolved) continue;

    let stat = null;
    try {
      stat = await fs.promises.stat(resolved);
    } catch (e) {
      continue;
    }
    if (!stat.isFile()) continue;
    const ageMs = now - stat.mtimeMs;
    if (!(ageMs > ttlMs)) continue;

    try {
      await fs.promises.unlink(resolved);
      deleted += 1;
    } catch (e) {
      logWarn('cleanup.unlink_failed', { file_name: name, error: e.message });
    }
  }

  const durationMs = Date.now() - startedAt;
  if (deleted > 0) {
    logInfo('cleanup.ttl.completed', { dir, ttl_ms: ttlMs, scanned, deleted, duration_ms: durationMs });
  }
  return { deleted, scanned, durationMs };
};

const startUploadCleanup = ({ dir, ttlMs, intervalMs }) => {
  const resolvedDir = path.resolve(dir);
  const resolvedTtlMs = Number(ttlMs);
  const resolvedIntervalMs = Number(intervalMs);
  if (!Number.isFinite(resolvedTtlMs) || resolvedTtlMs <= 0) {
    throw new Error('Invalid ttlMs');
  }
  if (!Number.isFinite(resolvedIntervalMs) || resolvedIntervalMs <= 0) {
    throw new Error('Invalid intervalMs');
  }

  logInfo('cleanup.ttl.started', { dir: resolvedDir, ttl_ms: resolvedTtlMs, interval_ms: resolvedIntervalMs });

  const run = async () => {
    try {
      await cleanupOnce({ dir: resolvedDir, ttlMs: resolvedTtlMs });
    } catch (e) {
      logError('cleanup.ttl.failed', { dir: resolvedDir, error: e.message });
    }
  };

  void run();
  const timer = setInterval(run, resolvedIntervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return () => clearInterval(timer);
};

module.exports = {
  startUploadCleanup,
  cleanupOnce,
};

