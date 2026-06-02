const fs = require('fs');
const path = require('path');

const defaultTaskDir = path.join(__dirname, '../../data/sales_tasks');

const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
};

const sanitizeTaskId = (taskId) => {
  const id = String(taskId || '').trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`Invalid task_id: ${taskId}`);
  return id;
};

class SalesTaskStore {
  constructor(options = {}) {
    this.dir = options.dir || defaultTaskDir;
    ensureDir(this.dir);
  }

  _filePath(taskId) {
    return path.join(this.dir, `${sanitizeTaskId(taskId)}.json`);
  }

  async create(task) {
    const now = new Date().toISOString();
    const record = {
      ...task,
      created_at: task.created_at || now,
      updated_at: task.updated_at || now,
    };
    await fs.promises.writeFile(this._filePath(record.task_id), JSON.stringify(record, null, 2), 'utf8');
    return record;
  }

  async get(taskId) {
    try {
      const raw = await fs.promises.readFile(this._filePath(taskId), 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }

  async update(taskId, patch) {
    const current = await this.get(taskId);
    if (!current) throw new Error(`任务不存在: ${taskId}`);
    const next = {
      ...current,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    await fs.promises.writeFile(this._filePath(taskId), JSON.stringify(next, null, 2), 'utf8');
    return next;
  }

  async list(filter = {}) {
    const files = await fs.promises.readdir(this.dir);
    const tasks = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const raw = await fs.promises.readFile(path.join(this.dir, file), 'utf8');
      tasks.push(JSON.parse(raw));
    }

    const status = filter.status ? String(filter.status) : '';
    return tasks
      .filter((task) => !status || task.status === status)
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }
}

module.exports = {
  SalesTaskStore,
  defaultTaskDir,
};
