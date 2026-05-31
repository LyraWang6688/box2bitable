const lark = require('@larksuiteoapi/node-sdk');
const fs = require('fs');
const path = require('path');
const { uploadDir } = require('../utils/upload');
const { generateSkuCode } = require('../utils/formatter');
const { getModuleConfig, normalizeModule } = require('../config/modules');
const { logError, logInfo, logWarn, redactValue } = require('../utils/logger');

const FEISHU_DEBUG = process.env.FEISHU_DEBUG === 'true' || process.env.NODE_ENV !== 'production';
const FEISHU_DEBUG_SHOW_TOKENS = process.env.FEISHU_DEBUG_SHOW_TOKENS === 'true';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getRetryableSignal = (err) => {
  if (!err) return { retryable: false };
  const status = Number(err.status);
  if ([429, 500, 502, 503, 504].includes(status)) return { retryable: true, reason: `http_${status}` };

  const message = String(err.message || '');
  const codeMatch = message.match(/Code:\s*(\d+)/i);
  const embeddedCode = codeMatch ? Number(codeMatch[1]) : null;
  if ([99991400].includes(embeddedCode)) return { retryable: true, reason: `code_${embeddedCode}` };

  if (
    /(timeout|ETIMEDOUT|ECONNRESET|429|Too Many Requests|rate|频率|系统繁忙|服务不可用|502|503|504)/i.test(message)
  ) {
    return { retryable: true, reason: 'message_match' };
  }
  return { retryable: false };
};

const withRetry = async (fn, { maxAttempts, baseDelayMs, maxDelayMs, onRetry }) => {
  const resolvedMaxAttempts = Number(maxAttempts) || 1;
  const resolvedBaseDelayMs = Number(baseDelayMs) || 0;
  const resolvedMaxDelayMs = Number(maxDelayMs) || 0;

  let lastError = null;
  for (let attempt = 1; attempt <= resolvedMaxAttempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (e) {
      lastError = e;
      const { retryable, reason } = getRetryableSignal(e);
      if (!retryable || attempt >= resolvedMaxAttempts) throw e;
      const backoff = resolvedBaseDelayMs * Math.pow(2, attempt - 1);
      const jitter = Math.floor(Math.random() * Math.min(250, resolvedBaseDelayMs || 250));
      const delay = Math.min(resolvedMaxDelayMs || backoff + jitter, backoff + jitter);
      if (typeof onRetry === 'function') onRetry({ attempt, delay_ms: delay, reason, error: e });
      if (delay > 0) await sleep(delay);
    }
  }
  throw lastError;
};

const mapWithConcurrency = async (items, concurrency, worker) => {
  const list = Array.isArray(items) ? items : [];
  const out = new Array(list.length);
  const limit = Math.max(1, Number(concurrency) || 1);
  let cursor = 0;

  const runners = new Array(Math.min(limit, list.length)).fill(0).map(async () => {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= list.length) return;
      out[idx] = await worker(list[idx], idx);
    }
  });

  await Promise.all(runners);
  return out;
};

const stringifyForLog = (value, maxLen = 12000) => {
  try {
    const str = JSON.stringify(value);
    if (!str) return '';
    return str.length > maxLen ? `${str.slice(0, maxLen)}...(truncated)` : str;
  } catch (e) {
    return `"[unserializable:${e.message}]"`;
  }
};

const logFeishu = (prefix, payload) => {
  if (!FEISHU_DEBUG) return;
  console.log(prefix, stringifyForLog(payload));
};

const maskToken = (token) => {
  if (FEISHU_DEBUG_SHOW_TOKENS) return String(token || '');
  return redactValue(token);
};

const extractFeishuCode = (resp) => {
  if (!resp || typeof resp !== 'object') return null;
  if (typeof resp.code === 'number') return resp.code;
  return null;
};

const extractFeishuMsg = (resp) => {
  if (!resp || typeof resp !== 'object') return '';
  if (typeof resp.msg === 'string') return resp.msg;
  if (typeof resp.message === 'string') return resp.message;
  return '';
};

const extractFileToken = (resp) => {
  if (!resp || typeof resp !== 'object') return '';
  return (
    resp.file_token ||
    (resp.data && resp.data.file_token) ||
    (resp.data && resp.data.data && resp.data.data.file_token) ||
    ''
  );
};

const sanitizeFieldsForLog = (fields) => {
  if (!fields || typeof fields !== 'object') return fields;
  const copy = Array.isArray(fields) ? fields.slice() : { ...fields };
  if (!Array.isArray(copy) && Array.isArray(copy['对应图片'])) {
    copy['对应图片'] = copy['对应图片'].map((it) => {
      if (!it || typeof it !== 'object') return it;
      const next = { ...it };
      if (next.file_token) next.file_token = maskToken(next.file_token);
      return next;
    });
  }
  return copy;
};

const normalizeFieldName = (name) => {
  return String(name || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[（(]/g, '(')
    .replace(/[）)]/g, ')');
};

const isEmptyValue = (value) => value == null || value === '' || (Array.isArray(value) && value.length === 0);

const coerceFieldValue = (value, type) => {
  if (type === 'number' && !isEmptyValue(value)) return Number(value);
  return value;
};

const getFieldSourceValue = (definition, item, context) => {
  if (definition.source === 'attachment') return context.attachmentField;
  if (definition.source === 'skuCode') return context.skuCode;
  if (definition.source === 'accumulatedQuantity') return context.accumulatedQuantity;
  const value = item[definition.source];
  return value == null || value === '' ? definition.fallback : value;
};

const buildFieldsFromConfig = (definitions = [], item, context = {}) => {
  const fields = {};
  definitions.forEach((definition) => {
    const rawValue = getFieldSourceValue(definition, item, context);
    if (definition.omitWhenEmpty && isEmptyValue(rawValue)) return;
    if (rawValue === undefined) return;
    fields[definition.field] = coerceFieldValue(rawValue, definition.type);
  });
  return fields;
};

/**
 * Feishu Bitable Service
 * Handles data synchronization with Feishu Bitable (Upsert logic).
 */
class FeishuService {
  constructor() {
    this.client = new lark.Client({
      appId: process.env.FEISHU_APP_ID,
      appSecret: process.env.FEISHU_APP_SECRET,
    });
    this.appToken = process.env.FEISHU_BITABLE_APP_TOKEN;
    this.tableId = process.env.FEISHU_BITABLE_TABLE_ID;
    this._fieldMapCache = new Map();
  }

  _getBitableTarget(moduleKey) {
    const module = normalizeModule(moduleKey);
    const cfg = getModuleConfig(module);
    return {
      module,
      appToken: cfg.bitable.appToken || this.appToken,
      tableId: cfg.bitable.tableId || this.tableId,
      writeMode: cfg.writeMode,
      fields: cfg.fields,
      sync: cfg.sync,
    };
  }

  async _getFieldNameMap(appToken, tableId) {
    const cacheKey = `${appToken}::${tableId}`;
    const cached = this._fieldMapCache.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.value;

    const nameToName = {};
    const normalizedToName = {};
    let pageToken = undefined;

    for (let i = 0; i < 20; i++) {
      const resp = await this.client.bitable.appTableField.list({
        path: {
          app_token: appToken,
          table_id: tableId,
        },
        params: {
          page_size: 200,
          page_token: pageToken,
        },
      });

      if (resp.code !== 0) {
        throw new Error(`获取飞书字段列表失败: ${resp.msg} (Code: ${resp.code})`);
      }

      const items = resp.data?.items || [];
      for (const f of items) {
        const fieldName = f.field_name;
        if (!fieldName) continue;
        nameToName[fieldName] = fieldName;
        normalizedToName[normalizeFieldName(fieldName)] = fieldName;
      }

      if (!resp.data?.has_more) break;
      pageToken = resp.data?.page_token;
      if (!pageToken) break;
    }

    const value = { nameToName, normalizedToName };
    this._fieldMapCache.set(cacheKey, { value, expiresAt: now + 10 * 60 * 1000 });
    return value;
  }

  async _mapFieldsToCanonicalNames(appToken, tableId, fieldsByName) {
    const { nameToName, normalizedToName } = await this._getFieldNameMap(appToken, tableId);
    const out = {};
    const missing = [];
    Object.keys(fieldsByName || {}).forEach((k) => {
      const v = fieldsByName[k];
      const direct = nameToName[k];
      const normalized = normalizedToName[normalizeFieldName(k)];
      const fieldName = direct || normalized;
      if (!fieldName) missing.push(k);
      out[fieldName || k] = v;
    });
    return { fields: out, missing };
  }

  /**
   * Synchronize aggregated SKU data to Bitable.
   * @param {Array} aggregatedData - Array of objects
   * @param {string} taskId - The filename of the original image
   * @param {string} preUploadedToken - (Optional) Pre-uploaded Feishu file token
   * @returns {Promise<Array>} - Sync results
   */
  async syncToBitable(aggregatedData, taskId, preUploadedToken = null, moduleKey = 'purchase') {
    const startedAt = Date.now();
    const target = this._getBitableTarget(moduleKey);
    let fileToken = preUploadedToken;
    logInfo('feishu.sync.started', {
      task_id: taskId,
      module: target.module,
      write_mode: target.writeMode,
      payload_count: Array.isArray(aggregatedData) ? aggregatedData.length : 0,
      has_pre_uploaded_token: Boolean(preUploadedToken),
    });

    // 如果没有提前上传的 token，且有 taskId，则现场上传
    if (!fileToken && taskId) {
      try {
        fileToken = await this.uploadAttachment(taskId, target.module);
      } catch (error) {
        logWarn('feishu.attachment.failed', {
          task_id: taskId,
          module: target.module,
          phase: 'sync_fallback',
          error: error.message,
        });
      }
    }
    logFeishu('[图片同步] syncToBitable 使用的 fileToken:', {
      module: target.module,
      tableId: maskToken(target.tableId),
      fileToken: maskToken(fileToken),
    });

    const concurrency = Math.max(1, Number(process.env.FEISHU_SYNC_CONCURRENCY || 4));
    const maxAttempts = Math.max(1, Number(process.env.FEISHU_RETRY_MAX || 3));
    const baseDelayMs = Math.max(0, Number(process.env.FEISHU_RETRY_BASE_MS || 300));
    const maxDelayMs = Math.max(baseDelayMs, Number(process.env.FEISHU_RETRY_MAX_DELAY_MS || 4000));

    const results = await mapWithConcurrency(aggregatedData, concurrency, async (item) => {
      const itemStartedAt = Date.now();
      try {
        logInfo('feishu.record.started', {
          task_id: taskId,
          module: target.module,
          item_no: item.item_no,
          color: item.color,
          size: item.size,
        });

        const syncResult = await withRetry(
          (attempt) => {
            return this.upsertRecord(item, fileToken, target).catch((e) => {
              e.attempt = attempt;
              throw e;
            });
          },
          {
            maxAttempts,
            baseDelayMs,
            maxDelayMs,
            onRetry: ({ attempt, delay_ms, reason, error }) => {
              logWarn('feishu.record.retrying', {
                task_id: taskId,
                module: target.module,
                item_no: item.item_no,
                color: item.color,
                size: item.size,
                attempt,
                delay_ms,
                reason,
                error: error.message,
              });
            },
          }
        );

        logInfo('feishu.record.completed', {
          task_id: taskId,
          module: target.module,
          duration_ms: Date.now() - itemStartedAt,
          item_no: item.item_no,
          color: item.color,
          size: item.size,
          record_id: syncResult,
        });
        return { item, status: 'success', recordId: syncResult };
      } catch (error) {
        logError('feishu.record.failed', {
          task_id: taskId,
          module: target.module,
          duration_ms: Date.now() - itemStartedAt,
          item_no: item.item_no,
          color: item.color,
          size: item.size,
          error: error.message,
        });
        return { item, status: 'failed', error: error.message };
      }
    });
    const failures = results.filter((item) => item.status === 'failed');
    logInfo(failures.length > 0 ? 'feishu.sync.partial_failed' : 'feishu.sync.completed', {
      task_id: taskId,
      module: target.module,
      duration_ms: Date.now() - startedAt,
      total_count: results.length,
      success_count: results.length - failures.length,
      failed_count: failures.length,
    });
    return results;
  }

  /**
   * Upload local file to Feishu Bitable attachments
   * @param {string} filename 
   */
  async uploadAttachment(filename, moduleKey = 'purchase') {
    const startedAt = Date.now();
    const target = this._getBitableTarget(moduleKey);
    const filePath = path.join(uploadDir, filename);
    logInfo('feishu.attachment.started', { task_id: filename, module: target.module, file_name: filename });
    
    if (!fs.existsSync(filePath)) {
      logWarn('feishu.attachment.file_missing', { task_id: filename, module: target.module, file_name: filename });
      return null;
    }

    const stats = fs.statSync(filePath);
    try {
      logInfo('feishu.attachment.uploading', {
        task_id: filename,
        module: target.module,
        file_name: filename,
        file_size: stats.size,
      });

      logFeishu('[图片同步] uploadAll 入参:', {
        file_name: filename,
        parent_type: 'bitable_image',
        parent_node: maskToken(target.appToken),
        size: stats.size,
      });

      const createResponse = await this.client.drive.media.uploadAll({
        data: {
          file_name: filename,
          parent_type: 'bitable_image',
          parent_node: target.appToken,
          size: stats.size,
          file: fs.createReadStream(filePath),
        },
      });

      logFeishu('[图片同步] uploadAll 原始返回:', createResponse);

      if (!createResponse) {
        logWarn('feishu.attachment.empty_response', {
          task_id: filename,
          module: target.module,
          duration_ms: Date.now() - startedAt,
        });
        return null;
      }

      const respCode = extractFeishuCode(createResponse);
      if (respCode !== null && respCode !== 0) {
        const msg = extractFeishuMsg(createResponse);
        logWarn('feishu.attachment.api_failed', {
          task_id: filename,
          module: target.module,
          duration_ms: Date.now() - startedAt,
          code: respCode,
          error: msg,
        });
        return null;
      }

      const token = extractFileToken(createResponse);
      if (!token) {
        logWarn('feishu.attachment.missing_token', {
          task_id: filename,
          module: target.module,
          duration_ms: Date.now() - startedAt,
        });
        return null;
      }
      logInfo('feishu.attachment.completed', {
        task_id: filename,
        module: target.module,
        duration_ms: Date.now() - startedAt,
        file_size: stats.size,
        file_token: token,
      });
      return token;
    } catch (err) {
      logError('feishu.attachment.failed', {
        task_id: filename,
        module: target.module,
        duration_ms: Date.now() - startedAt,
        error: err.message,
      });
      return null;
    }
  }

  /**
   * Upsert a single record: Search -> Update or Create
   * @param {Object} item - SKU item data
   * @param {string} fileToken - Feishu attachment file token
   */
  async upsertRecord(item, fileToken, target) {
    const resolvedTarget = target || this._getBitableTarget('purchase');
    const strategy = this._getWriteStrategy(resolvedTarget.writeMode);
    return strategy.call(this, item, fileToken, resolvedTarget);
  }

  _getWriteStrategy(writeMode) {
    const strategies = {
      create_detail: this._createDetailRecord,
      upsert_accumulate: this._upsertAccumulateRecord,
    };
    const strategy = strategies[writeMode];
    if (!strategy) throw new Error(`Unsupported write mode: ${writeMode}`);
    return strategy;
  }

  async _createDetailRecord(item, fileToken, resolvedTarget) {
    const attachmentField = fileToken ? [{ file_token: fileToken }] : [];
    const createFields = buildFieldsFromConfig(resolvedTarget.sync?.createFields, item, {
      attachmentField,
    });

    const mapped = await this._mapFieldsToCanonicalNames(resolvedTarget.appToken, resolvedTarget.tableId, createFields);
    if (mapped.missing.length > 0) {
      throw new Error(`飞书字段不存在或字段名不匹配: ${mapped.missing.join(', ')}`);
    }

    logFeishu('[飞书同步] create_detail create 入参:', {
      path: {
        app_token: maskToken(resolvedTarget.appToken),
        table_id: maskToken(resolvedTarget.tableId),
      },
      fields: sanitizeFieldsForLog(createFields),
    });

    const createResponse = await this.client.bitable.appTableRecord.create({
      path: {
        app_token: resolvedTarget.appToken,
        table_id: resolvedTarget.tableId,
      },
      data: {
        fields: mapped.fields,
      },
    });

    logFeishu('[飞书同步] create_detail create 原始返回:', createResponse);
    if (createResponse.code !== 0) {
      throw new Error(`飞书新增失败: ${createResponse.msg} (Code: ${createResponse.code})`);
    }
    return createResponse.data.record.record_id;
  }

  async _upsertAccumulateRecord(item, fileToken, resolvedTarget) {
    const { record_id, item_no, color, size, quantity } = item;

    const skuCode = generateSkuCode(item_no, color, size);

    let records = [];

    // 1. 如果前端传来了明确的 record_id (飞书记录ID)，优先通过 ID 精确检索
    if (record_id) {
      logInfo('feishu.record.lookup_by_record_id.started', { module: resolvedTarget.module, record_id });
      const filter = `CurrentValue.[记录ID]="${record_id}"`;
      
      const searchResponse = await this.client.bitable.appTableRecord.list({
        path: {
          app_token: resolvedTarget.appToken,
          table_id: resolvedTarget.tableId,
        },
        params: {
          filter: filter,
          page_size: 1,
        },
      });

      if (searchResponse.code === 0 && searchResponse.data.items && searchResponse.data.items.length > 0) {
        records = searchResponse.data.items;
        logInfo('feishu.record.lookup_by_record_id.completed', { module: resolvedTarget.module, record_id, found_count: records.length });
      } else {
        logInfo('feishu.record.lookup_by_record_id.missed', { module: resolvedTarget.module, record_id });
      }
    }

    // 2. 如果没有提供 record_id，或者根据 record_id 没找到，则回退使用 SKU_Code 检索
    if (records.length === 0) {
      const filter = `CurrentValue.[SKU_Code]="${skuCode}"`;
      logInfo('feishu.record.lookup_by_sku.started', { module: resolvedTarget.module, sku_code: skuCode });
      
      const searchResponse = await this.client.bitable.appTableRecord.list({
        path: {
          app_token: resolvedTarget.appToken,
          table_id: resolvedTarget.tableId,
        },
        params: {
          filter: filter,
          page_size: 1,
        },
      });

      if (searchResponse.code !== 0) {
        logError('feishu.record.lookup_by_sku.failed', {
          module: resolvedTarget.module,
          sku_code: skuCode,
          code: searchResponse.code,
          error: searchResponse.msg,
        });
        logFeishu('[飞书同步] 检索记录原始返回:', searchResponse);
        throw new Error(`检索飞书记录失败: ${searchResponse.msg}`);
      }

      records = searchResponse.data.items || [];
      logInfo('feishu.record.lookup_by_sku.completed', {
        module: resolvedTarget.module,
        sku_code: skuCode,
        found_count: records.length,
      });
    }

    // Prepare attachment field if fileToken exists
    const attachmentField = fileToken ? [{ file_token: fileToken }] : [];
    logFeishu('[飞书同步] 本次写入使用的 fileToken:', {
      fileToken: maskToken(fileToken),
      attachmentFieldLen: attachmentField.length,
    });

    if (records.length > 0) {
      // 2. Case: Record exists -> Update quantity and image
      const existingRecord = records[0];
      const recordId = existingRecord.record_id;
      const fields = existingRecord.fields || {};
      const oldQuantity = fields['数量'] || 0;
      const newQuantity = Number(oldQuantity) + Number(quantity);

      const updateData = buildFieldsFromConfig(resolvedTarget.sync?.updateFields, item, {
        attachmentField,
        accumulatedQuantity: newQuantity,
      });
      this._applyCarryForwardFields(updateData, item, fields, resolvedTarget);

      logFeishu('[飞书同步] update 入参:', {
        path: {
          app_token: maskToken(resolvedTarget.appToken),
          table_id: maskToken(resolvedTarget.tableId),
          record_id: recordId,
        },
        fields: sanitizeFieldsForLog(updateData),
      });

      const mappedUpdate = await this._mapFieldsToCanonicalNames(resolvedTarget.appToken, resolvedTarget.tableId, updateData);
      if (mappedUpdate.missing.length > 0) {
        throw new Error(`飞书字段不存在或字段名不匹配: ${mappedUpdate.missing.join(', ')}`);
      }

      const updateResponse = await this.client.bitable.appTableRecord.update({
        path: {
          app_token: resolvedTarget.appToken,
          table_id: resolvedTarget.tableId,
          record_id: recordId,
        },
        data: {
          fields: mappedUpdate.fields,
        },
      });

      logFeishu('[飞书同步] update 原始返回:', updateResponse);

      if (updateResponse.code !== 0) {
        throw new Error(`飞书更新失败: ${updateResponse.msg} (Code: ${updateResponse.code})`);
      }

      logInfo('feishu.record.updated', { module: resolvedTarget.module, record_id: recordId, sku_code: skuCode });
      return recordId;
    } else {
      // 3. Case: Record doesn't exist -> Create new
      const createFields = {
        ...buildFieldsFromConfig(resolvedTarget.sync?.createFields, item, {
          attachmentField,
          skuCode,
        }),
      };

      const mappedCreate = await this._mapFieldsToCanonicalNames(resolvedTarget.appToken, resolvedTarget.tableId, createFields);
      if (mappedCreate.missing.length > 0) {
        throw new Error(`飞书字段不存在或字段名不匹配: ${mappedCreate.missing.join(', ')}`);
      }

      logFeishu('[飞书同步] create 入参:', {
        path: {
          app_token: maskToken(resolvedTarget.appToken),
          table_id: maskToken(resolvedTarget.tableId),
        },
        fields: sanitizeFieldsForLog(createFields),
      });

      const createResponse = await this.client.bitable.appTableRecord.create({
        path: {
          app_token: resolvedTarget.appToken,
          table_id: resolvedTarget.tableId,
        },
        data: {
          fields: {
            ...mappedCreate.fields,
          },
        },
      });

      logFeishu('[飞书同步] create 原始返回:', createResponse);

      if (createResponse.code !== 0) {
        throw new Error(`飞书新增失败: ${createResponse.msg} (Code: ${createResponse.code})`);
      }

      return createResponse.data.record.record_id;
    }
  }

  _applyCarryForwardFields(updateData, item, existingFields, resolvedTarget) {
    (resolvedTarget.sync?.carryForwardFields || []).forEach((definition) => {
      const existingValue = existingFields[definition.field];
      const incomingValue = item[definition.source];
      if (!existingValue && incomingValue) {
        updateData[definition.field] = incomingValue;
        return;
      }
      if (existingValue && incomingValue && String(existingValue) !== String(incomingValue)) {
        const message = definition.conflictMessage || `${definition.field}与已存在记录不一致`;
        throw new Error(`${message}: 当前=${incomingValue}, 已存在=${existingValue}`);
      }
    });
  }
}

module.exports = new FeishuService();
