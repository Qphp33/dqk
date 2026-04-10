const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

// 异步互斥锁，防止多线程/异步竞争导致数据库锁死 (ErrnoError 33)
class Mutex {
  constructor() {
    this.queue = [];
    this.locked = false;
  }
  async lock() {
    return new Promise(resolve => {
      if (this.locked) {
        this.queue.push(resolve);
      } else {
        this.locked = true;
        resolve();
      }
    });
  }
  unlock() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
    } else {
      this.locked = false;
    }
  }
}
const dbMutex = new Mutex();

const resourceRoot = app.isPackaged ? process.resourcesPath : __dirname;
const runtimeRoot = __dirname;
const appIconPath = path.join(resourceRoot, 'build', 'icon.png');
let mainWindow = null;

const dbDir = app.isPackaged ? path.join(resourceRoot, 'database') : path.join(runtimeRoot, 'database');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'tasks.sqlite');
const configDir = app.isPackaged ? path.join(resourceRoot, 'config') : path.join(runtimeRoot, 'config');
const configPath = path.join(configDir, 'config.json');
const DEFAULT_BACKEND_BASE_URL = 'http://192.168.0.61:8088';

function ensureSeedFile(targetPath, bundledRelativePath) {
  try {
    if (fs.existsSync(targetPath)) return;
    const bundledPath = path.join(resourceRoot, bundledRelativePath);
    if (fs.existsSync(bundledPath)) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(bundledPath, targetPath);
    }
  } catch (e) {
    console.error('Ensure seed file failed:', bundledRelativePath, e);
  }
}

function ensureConfigDir() {
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
}

function ensureRuntimeSeeds() {
  ensureSeedFile(dbPath, path.join('database', 'tasks.sqlite'));
  ensureSeedFile(configPath, path.join('config', 'config.json'));
}

function readConfig() {
  try {
    ensureConfigDir();
    ensureRuntimeSeeds();
    if (!fs.existsSync(configPath)) {
      const def = { amapKey: '', apiBaseUrl: DEFAULT_BACKEND_BASE_URL, aiNodeUrl: '', scanNodeConfig: '' };
      fs.writeFileSync(configPath, JSON.stringify(def, null, 2), 'utf-8');
      return def;
    }
    const txt = fs.readFileSync(configPath, 'utf-8');
    return { amapKey: '', apiBaseUrl: DEFAULT_BACKEND_BASE_URL, aiNodeUrl: '', scanNodeConfig: '', ...(JSON.parse(txt || '{}') || {}) };
  } catch {
    return { amapKey: '', apiBaseUrl: DEFAULT_BACKEND_BASE_URL, aiNodeUrl: '', scanNodeConfig: '' };
  }
}

function writeConfig(partial) {
  try {
    ensureConfigDir();
    const current = readConfig();
    const next = { ...current, ...(partial || {}) };
    fs.writeFileSync(configPath, JSON.stringify(next, null, 2), 'utf-8');
    return { success: true, config: next };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function getBackendBaseUrl() {
  const cfg = readConfig();
  return String(cfg.apiBaseUrl || DEFAULT_BACKEND_BASE_URL).replace(/\/+$/, '');
}

function buildBackendUrl(pathname) {
  const path = String(pathname || '').startsWith('/') ? pathname : `/${pathname || ''}`;
  return `${getBackendBaseUrl()}${path}`;
}

async function requestViaRenderer({ url, method = 'GET', headers = {}, body = null, timeoutMs = 15000 }) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error('主窗口未就绪，无法通过页面发起请求');
  }

  const requestPayload = {
    url,
    method,
    headers,
    body,
    timeoutMs
  };

  const result = await mainWindow.webContents.executeJavaScript(`
    (async () => {
      const req = ${JSON.stringify(requestPayload)};
      const controller = new AbortController();
      const timer = req.timeoutMs ? setTimeout(() => controller.abort(), req.timeoutMs) : null;
      try {
        const response = await window.fetch(req.url, {
          method: req.method,
          headers: req.headers || {},
          body: req.body,
          signal: controller.signal
        });
        const bodyText = await response.text();
        let data = null;
        try {
          data = bodyText ? JSON.parse(bodyText) : null;
        } catch {
          data = null;
        }
        return {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText || '',
          bodyText,
          data
        };
      } catch (error) {
        return {
          error: {
            name: error?.name || 'Error',
            message: error?.message || String(error)
          }
        };
      } finally {
        if (timer) clearTimeout(timer);
      }
    })()
  `, true);

  if (result?.error) {
    const error = new Error(result.error.message || '请求失败');
    error.name = result.error.name || 'Error';
    throw error;
  }

  return result;
}

async function backendRequest(pathname, options = {}) {
  return await requestViaRenderer({
    url: buildBackendUrl(pathname),
    ...options
  });
}

async function checkNodeOnline(nodeUrl) {
  console.log('[main:check-node-online] input url =', nodeUrl);
  if (!nodeUrl || !String(nodeUrl).trim()) {
    return { success: true, online: false, message: '未配置 AI 节点地址' };
  }

  const normalizedUrl = String(nodeUrl).trim();

  try {
    const response = await requestViaRenderer({
      url: normalizedUrl,
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*'
      },
      timeoutMs: 5000
    });

    return {
      success: true,
      online: true,
      statusCode: response.status,
      statusText: response.statusText || 'OK',
      checkedUrl: normalizedUrl
    };
  } catch (error) {
    console.error('[main:check-node-online] request failed =', error);
    return {
      success: true,
      online: false,
      checkedUrl: normalizedUrl,
      message: error?.name === 'AbortError' ? '连接超时' : (error?.message || '连接失败')
    };
  }
}

async function checkBackendOnline() {
  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await requestViaRenderer({
        url: getBackendBaseUrl(),
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/plain, */*'
        },
        timeoutMs: 5000
      });

      return {
        success: true,
        online: true,
        statusCode: response.status,
        statusText: response.statusText || 'OK',
        url: getBackendBaseUrl(),
        attempts: attempt
      };
    } catch (error) {
      lastError = error;
      console.error(`[main:check-backend-online] attempt ${attempt} failed =`, error);
    }
  }

  return {
    success: true,
    online: false,
    url: getBackendBaseUrl(),
    attempts: maxAttempts,
    message: lastError?.name === 'AbortError' ? '连接超时' : (lastError?.message || '连接失败')
  };
}

const PROJECT_TASK_NOW = 'project_task_now';
const PROJECT_TASK_PAST = 'project_task_past';
const PROJECT_TASK_FUTURE = 'project_task_future';

const FOFA_PROJECT_NOW = 'fofa_project_now';
const FOFA_PROJECT_PAST = 'fofa_project_past';
const FOFA_PROJECT_FUTURE = 'fofa_project_future';

// 通用数据库加载函数
async function getDb() {
  ensureRuntimeSeeds();
  const SQL = await initSqlJs();
  const db = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();

  const tableExists = (name) => db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`).length > 0;
  let changed = false;
  const taskTables = [PROJECT_TASK_NOW, PROJECT_TASK_PAST, PROJECT_TASK_FUTURE];

  const legacyPairs = [
    { legacy: 'projects_overview_now', current: PROJECT_TASK_NOW },
    { legacy: 'projects_overview_past', current: PROJECT_TASK_PAST },
    { legacy: 'projects_overview_future', current: PROJECT_TASK_FUTURE },
    { legacy: 'projects_overview', current: PROJECT_TASK_NOW },
    { legacy: 'projects_overview_bak', current: PROJECT_TASK_PAST }
  ];

  for (const { legacy, current } of legacyPairs) {
    if (!tableExists(current) && tableExists(legacy)) {
      db.run(`CREATE TABLE "${current}" AS SELECT * FROM "${legacy}"`);
      changed = true;
    }
  }

  for (const table of taskTables) {
    if (!tableExists(table)) {
      db.run(`CREATE TABLE "${table}" (
        id INTEGER PRIMARY KEY,
        projectName TEXT,
        remark TEXT,
        url TEXT,
        subNum TEXT,
        step TEXT,
        taskPriority TEXT,
        days INTEGER DEFAULT 0,
        createTime TEXT,
        updateTime TEXT
      )`);
      changed = true;
    } else {
      const pragma = db.exec(`PRAGMA table_info("${table}")`);
      const cols = pragma.length > 0 ? pragma[0].values.map(v => v[1]) : [];
      if (!cols.includes('taskPriority')) {
        db.run(`ALTER TABLE "${table}" ADD COLUMN taskPriority TEXT`);
        changed = true;
      }
      if (!cols.includes('days')) {
        db.run(`ALTER TABLE "${table}" ADD COLUMN days INTEGER DEFAULT 0`);
        changed = true;
      }
      if (!cols.includes('remark')) {
        db.run(`ALTER TABLE "${table}" ADD COLUMN remark TEXT`);
        changed = true;
      }
      if (!cols.includes('url')) {
        db.run(`ALTER TABLE "${table}" ADD COLUMN url TEXT`);
        changed = true;
      }
      if (!cols.includes('subNum')) {
        db.run(`ALTER TABLE "${table}" ADD COLUMN subNum TEXT`);
        changed = true;
      }
      if (!cols.includes('step')) {
        db.run(`ALTER TABLE "${table}" ADD COLUMN step TEXT`);
        changed = true;
      }
      if (!cols.includes('createTime')) {
        db.run(`ALTER TABLE "${table}" ADD COLUMN createTime TEXT`);
        changed = true;
      }
      if (!cols.includes('updateTime')) {
        db.run(`ALTER TABLE "${table}" ADD COLUMN updateTime TEXT`);
        changed = true;
      }
    }
  }

  // 初始化 FOFA 概览表（如果不存在）
  const fofaTables = [FOFA_PROJECT_NOW, FOFA_PROJECT_PAST, FOFA_PROJECT_FUTURE];
  for (const table of fofaTables) {
    if (!tableExists(table)) {
      // 这里的结构参考 project_task_now，但我们主要存储指纹库的元数据
      db.run(`CREATE TABLE "${table}" (
        id INTEGER PRIMARY KEY,
        projectName TEXT,
        remark TEXT,
        url TEXT,
        subNum TEXT,
        step TEXT,
        category TEXT,
        isPinned INTEGER DEFAULT 0,
        colorTag TEXT,
        createTime TEXT,
        updateTime TEXT
      )`);
      changed = true;
    } else {
      // 检查并补全缺失的列 (category, isPinned, colorTag)
      const cols = db.exec(`PRAGMA table_info("${table}")`)[0].values.map(v => v[1]);
      if (!cols.includes('category')) {
        db.run(`ALTER TABLE "${table}" ADD COLUMN category TEXT`);
        changed = true;
      }
      if (!cols.includes('isPinned')) {
        db.run(`ALTER TABLE "${table}" ADD COLUMN isPinned INTEGER DEFAULT 0`);
        changed = true;
      }
      if (!cols.includes('colorTag')) {
        db.run(`ALTER TABLE "${table}" ADD COLUMN colorTag TEXT`);
        changed = true;
      }
    }
  }

  if (changed) saveDb(db);
  return db;
}

// 辅助函数：保存数据库到磁盘
function saveDb(db) {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, buffer);
}

// 辅助函数：动态创建表并插入数据
function upsertTable(db, tableName, rows) {
  if (!rows || rows.length === 0) return;

  const firstRow = rows[0];
  const keys = Object.keys(firstRow);
  const columns = keys.map(key => {
    const value = firstRow[key];
    let type = 'TEXT';
    if (typeof value === 'number') type = 'INTEGER';
    return `"${key}" ${type}`;
  }).join(', ');

  db.run(`DROP TABLE IF EXISTS "${tableName}"`);
  db.run(`CREATE TABLE "${tableName}" (${columns})`);

  const placeholders = keys.map(() => '?').join(', ');
  const insertStmt = db.prepare(`INSERT INTO "${tableName}" (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${placeholders})`);

  for (const row of rows) {
    const values = keys.map(key => row[key]);
    insertStmt.run(values);
  }
  insertStmt.free();
}

// 1. 获取并保存“未来表”
async function fetchToFuture(token) {
  try {
    const response = await backendRequest('/module/project/list?pageNum=1&pageSize=100&projectName=', {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });
    const data = response.data || {};
    
    if (data.code === 200 && data.rows) {
      const db = await getDb();
      upsertTable(db, PROJECT_TASK_FUTURE, data.rows);
      saveDb(db);
      return { success: true, count: data.rows.length };
    }
    throw new Error(data.msg || '获取项目列表失败');
  } catch (error) {
    console.error('Fetch to future error:', error);
    return { success: false, error: error.message };
  }
}

// 2. 确认应用“未来表”到“现在表”，并将“现在表”备份到“过去表”
async function applyFutureToNow() {
  try {
    const db = await getDb();
    
    // 检查现在表是否存在，如果存在则备份到过去表
    const existsNow = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${PROJECT_TASK_NOW}'`);
    if (existsNow.length > 0) {
      db.run(`DROP TABLE IF EXISTS "${PROJECT_TASK_PAST}"`);
      db.run(`CREATE TABLE "${PROJECT_TASK_PAST}" AS SELECT * FROM "${PROJECT_TASK_NOW}"`);
    }

    // 检查未来表是否存在，如果存在则覆盖到现在表
    const existsFuture = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${PROJECT_TASK_FUTURE}'`);
    if (existsFuture.length > 0) {
      db.run(`DROP TABLE IF EXISTS "${PROJECT_TASK_NOW}"`);
      db.run(`CREATE TABLE "${PROJECT_TASK_NOW}" AS SELECT * FROM "${PROJECT_TASK_FUTURE}"`);
    }
    
    saveDb(db);
    return { success: true };
  } catch (error) {
    console.error('Apply future to now error:', error);
    return { success: false, error: error.message };
  }
}

// 3. 备份“现在表”到“过去表”
async function backupNowToPast() {
  try {
    const db = await getDb();
    const existsNow = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${PROJECT_TASK_NOW}'`);
    if (existsNow.length > 0) {
      db.run(`DROP TABLE IF EXISTS "${PROJECT_TASK_PAST}"`);
      db.run(`CREATE TABLE "${PROJECT_TASK_PAST}" AS SELECT * FROM "${PROJECT_TASK_NOW}"`);
      saveDb(db);
      return { success: true };
    }
    return { success: false, error: '当前没有数据可备份' };
  } catch (error) {
    console.error('Backup now to past error:', error);
    return { success: false, error: error.message };
  }
}

// 3.1 备份 FOFA “现在表”到“过去表”
async function backupFofaNowToPast() {
  try {
    const db = await getDb();
    const existsNow = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${FOFA_PROJECT_NOW}'`);
    if (existsNow.length > 0) {
      db.run(`DROP TABLE IF EXISTS "${FOFA_PROJECT_PAST}"`);
      db.run(`CREATE TABLE "${FOFA_PROJECT_PAST}" AS SELECT * FROM "${FOFA_PROJECT_NOW}"`);
      saveDb(db);
      return { success: true };
    }
    return { success: false, error: '当前没有 FOFA 数据可备份' };
  } catch (error) {
    console.error('Backup FOFA now to past error:', error);
    return { success: false, error: error.message };
  }
}

// 4. 同步单个任务的详细数据 (带分页处理)
async function syncTaskDetailData(projectId, token, force = false) {
  const db = await getDb();
  const tableName = `${projectId}`;
  let allRows = [];
  let pageNum = 1;
  const pageSize = 100;
  let total = 0;

  try {
    if (!force) {
      const exists = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`);
      if (exists.length > 0) {
        const countRes = db.exec(`SELECT COUNT(*) AS count FROM "${tableName}"`);
        const count = countRes?.[0]?.values?.[0]?.[0] || 0;
        if (count > 0) return { success: true, skipped: true, count, projectId };
      }
    }
    do {
      const response = await backendRequest(`/module/projectData/list?pageNum=${pageNum}&pageSize=${pageSize}&projectId=${projectId}&ip=&target=`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      const data = response.data || {};
      
      if (data.code === 200 || data.rows) {
        allRows = allRows.concat(data.rows);
        total = data.total || 0;
        pageNum++;
      } else {
        throw new Error(data.msg || `获取任务 ${projectId} 详情失败`);
      }
    } while (allRows.length < total && total > 0);

    if (allRows.length > 0) {
      upsertTable(db, tableName, allRows); // 表名直接用 ID
      saveDb(db);
    }

    return { success: true, count: allRows.length, projectId };
  } catch (error) {
    console.error(`Sync task ${projectId} error:`, error);
    return { success: false, error: error.message };
  }
}

// 4.1 同步单个 FOFA 任务的详细数据 (带分页处理，表名以 fofa_ 开头)
async function syncAllTaskCloudData(token) {
  const db = await getDb();
  const tasksRes = db.exec(`SELECT id, subNum FROM "${PROJECT_TASK_NOW}" ORDER BY createTime DESC, id DESC`);
  if (tasksRes.length === 0) {
    return { success: true, taskCount: 0, totalRows: 0, results: [] };
  }

  const columns = tasksRes[0].columns;
  const taskRows = tasksRes[0].values.map(val => {
    const row = {};
    columns.forEach((col, i) => {
      row[col] = val[i];
    });
    return row;
  });

  const pageSize = 10000;
  const results = [];
  let totalRows = 0;

  try {
    for (const task of taskRows) {
      const projectId = parseInt(task.id, 10);
      if (!Number.isFinite(projectId)) {
        results.push({ success: false, projectId: task.id, count: 0, error: '无效的任务 ID' });
        continue;
      }

      const expectedTotal = Math.max(parseInt(task.subNum, 10) || 0, 0);
      let pageNum = 1;
      let totalPages = expectedTotal > 0 ? Math.ceil(expectedTotal / pageSize) : 1;
      let remoteTotal = expectedTotal;
      let allRows = [];

      while (pageNum <= totalPages) {
        const response = await backendRequest(`/module/projectData/list?pageNum=${pageNum}&pageSize=${pageSize}&projectId=${projectId}&ip=&target=`, {
          headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
        });
        const data = response.data || {};

        if (!(data.code === 200 || Array.isArray(data.rows))) {
          throw new Error(data.msg || `获取任务 ${projectId} 详情失败`);
        }

        const pageRows = Array.isArray(data.rows) ? data.rows : [];
        allRows = allRows.concat(pageRows);

        const serverTotal = Math.max(parseInt(data.total, 10) || 0, 0);
        if (serverTotal > 0) {
          remoteTotal = serverTotal;
          totalPages = Math.max(totalPages, Math.ceil(serverTotal / pageSize));
        }

        if (pageRows.length === 0) break;
        pageNum += 1;
      }

      const tableName = `${projectId}`;
      if (allRows.length > 0) {
        upsertTable(db, tableName, allRows);
      } else {
        db.run(`DROP TABLE IF EXISTS "${tableName}"`);
      }

      totalRows += allRows.length;
      results.push({
        success: true,
        projectId,
        count: allRows.length,
        expectedTotal,
        remoteTotal
      });
    }

    saveDb(db);
    return { success: true, taskCount: taskRows.length, totalRows, results };
  } catch (error) {
    console.error('Sync all task cloud data error:', error);
    return { success: false, error: error.message, taskCount: taskRows.length, totalRows, results };
  }
}

async function syncFofaTaskData(projectId, token, force = false) {
  const db = await getDb();
  const tableName = `fofa_${projectId}`;
  let allRows = [];
  let pageNum = 1;
  const pageSize = 100;
  let total = 0;

  try {
    if (!force) {
      const exists = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`);
      if (exists.length > 0) {
        const countRes = db.exec(`SELECT COUNT(*) AS count FROM "${tableName}"`);
        const count = countRes?.[0]?.values?.[0]?.[0] || 0;
        if (count > 0) return { success: true, skipped: true, count, projectId };
      }
    }
    do {
      const response = await backendRequest(`/module/projectData/listByFofa?pageNum=${pageNum}&pageSize=${pageSize}&projectId=${projectId}&host=&country=`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      const data = response.data || {};
      
      if (data.code === 200 || data.rows) {
        allRows = allRows.concat(data.rows);
        total = data.total || 0;
        pageNum++;
      } else {
        throw new Error(data.msg || `获取 FOFA 任务 ${projectId} 详情失败`);
      }
    } while (allRows.length < total && total > 0);

    if (allRows.length > 0) {
      upsertTable(db, tableName, allRows); 
      saveDb(db);
    }

    return { success: true, count: allRows.length, projectId };
  } catch (error) {
    console.error(`Sync FOFA task ${projectId} error:`, error);
    return { success: false, error: error.message };
  }
}

// 4.2 同步 FOFA 指纹库列表 (三表逻辑：先拉取到未来表)
async function syncFofaProjectList(token) {
  try {
    const response = await backendRequest('/module/project/list?pageNum=1&pageSize=1000&projectName=&type=fofa', {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });
    const data = response.data || {};
    
    if (data.code === 200 || data.rows) {
      const db = await getDb();
      // 写入未来表
      db.run(`DELETE FROM "${FOFA_PROJECT_FUTURE}"`);
      upsertTable(db, FOFA_PROJECT_FUTURE, data.rows.map(r => ({
        id: r.id,
        projectName: r.projectName,
        remark: r.remark,
        url: r.url,
        subNum: r.subNum,
        step: r.step,
        createTime: r.createTime,
        updateTime: r.updateTime
      })));
      saveDb(db);
      return { success: true, count: data.rows.length };
    }
    return { success: false, error: data.msg || '同步失败' };
  } catch (error) {
    console.error('Sync FOFA project list error:', error);
    return { success: false, error: error.message };
  }
}

// 4.3 应用 FOFA 未来表到现在表，并备份到现在表
async function applyFofaFutureToNow() {
  try {
    const db = await getDb();
    // 备份：现在 -> 过去
    db.run(`DROP TABLE IF EXISTS "${FOFA_PROJECT_PAST}"`);
    db.run(`CREATE TABLE "${FOFA_PROJECT_PAST}" AS SELECT * FROM "${FOFA_PROJECT_NOW}"`);
    // 应用：未来 -> 现在
    db.run(`DROP TABLE IF EXISTS "${FOFA_PROJECT_NOW}"`);
    db.run(`CREATE TABLE "${FOFA_PROJECT_NOW}" AS SELECT * FROM "${FOFA_PROJECT_FUTURE}"`);
    saveDb(db);
    return { success: true };
  } catch (error) {
    console.error('Apply FOFA future to now error:', error);
    return { success: false, error: error.message };
  }
}

// 4.4 获取本地 FOFA 项目列表 (从 FOFA_PROJECT_NOW)
async function getFofaProjects() {
  try {
    const db = await getDb();
    const res = db.exec(`SELECT * FROM "${FOFA_PROJECT_NOW}" ORDER BY isPinned DESC, createTime DESC`);
    if (res.length === 0) return { success: true, rows: [] };
    const columns = res[0].columns;
    return { 
      success: true, 
      rows: res[0].values.map(val => {
        let obj = {};
        columns.forEach((col, i) => obj[col] = val[i]);
        return obj;
      }) 
    };
  } catch (error) {
    console.error('Get FOFA projects error:', error);
    return { success: false, error: error.message };
  }
}

// 5. 从本地数据库读取“现在表”项目列表
async function getLocalProjects() {
  try {
    const db = await getDb();
    const res = db.exec(`SELECT * FROM "${PROJECT_TASK_NOW}"`);
    if (res.length > 0) {
      const columns = res[0].columns;
      const values = res[0].values;
      const rows = values.map(val => {
        let obj = {};
        columns.forEach((col, i) => obj[col] = val[i]);
        return obj;
      });
      return { success: true, rows };
    }
    return { success: true, rows: [] };
  } catch (error) {
    console.error('Get local projects error:', error);
    return { success: false, error: error.message };
  }
}

async function getHomeDashboardSummary() {
  try {
    const db = await getDb();

    const taskExists = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${PROJECT_TASK_NOW}'`);
    const fofaExists = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${FOFA_PROJECT_NOW}'`);

    const taskRows = [];
    if (taskExists.length > 0) {
      const res = db.exec(`SELECT * FROM "${PROJECT_TASK_NOW}"`);
      if (res.length > 0) {
        const columns = res[0].columns;
        for (const values of res[0].values) {
          const row = {};
          columns.forEach((col, idx) => {
            row[col] = values[idx];
          });
          taskRows.push(row);
        }
      }
    }

    const fofaRows = [];
    if (fofaExists.length > 0) {
      const res = db.exec(`SELECT * FROM "${FOFA_PROJECT_NOW}"`);
      if (res.length > 0) {
        const columns = res[0].columns;
        for (const values of res[0].values) {
          const row = {};
          columns.forEach((col, idx) => {
            row[col] = values[idx];
          });
          fofaRows.push(row);
        }
      }
    }

    const taskCount = taskRows.length;
    const taskDataTotal = taskRows.reduce((sum, row) => sum + (parseInt(row.subNum, 10) || 0), 0);
    const fingerprintRuleTotal = fofaRows.length;
    const fofaFingerprintDataTotal = fofaRows.reduce((sum, row) => sum + (parseInt(row.subNum, 10) || 0), 0);

    const uniqueIpSet = new Set();
    const regionMap = new Map();

    for (const task of taskRows) {
      const projectId = parseInt(task.id, 10);
      if (!Number.isFinite(projectId)) continue;
      const tableName = await resolveTaskSourceTableName(db, projectId);
      if (!tableName) continue;

      const exists = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${String(tableName).replace(/'/g, "''")}' LIMIT 1`);
      if (exists.length === 0) continue;

      const dataRes = db.exec(`SELECT * FROM "${tableName}"`);
      if (dataRes.length === 0) continue;

      const columns = dataRes[0].columns;
      const ipIndex = columns.indexOf('ip');
      const countryIndex = columns.indexOf('countryName');
      const regionIndex = columns.indexOf('regionName');

      for (const values of dataRes[0].values) {
        const ip = ipIndex >= 0 ? String(values[ipIndex] || '').trim() : '';
        const countryName = countryIndex >= 0 ? String(values[countryIndex] || '').trim() : '';
        const regionName = regionIndex >= 0 ? String(values[regionIndex] || '').trim() : '';

        if (ip) uniqueIpSet.add(ip);

        const areaName = countryName || regionName || '未知地区';
        regionMap.set(areaName, (regionMap.get(areaName) || 0) + 1);
      }
    }

    const categoryMap = new Map();
    for (const row of fofaRows) {
      const category = String(row.category || '未分类').trim() || '未分类';
      const dataCount = parseInt(row.subNum, 10) || 0;
      const prev = categoryMap.get(category) || { name: category, ruleCount: 0, dataCount: 0 };
      prev.ruleCount += 1;
      prev.dataCount += dataCount;
      categoryMap.set(category, prev);
    }

    const regionStats = Array.from(regionMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({ name, value }));

    const fingerprintCategoryStats = Array.from(categoryMap.values())
      .sort((a, b) => {
        if (b.dataCount !== a.dataCount) return b.dataCount - a.dataCount;
        return b.ruleCount - a.ruleCount;
      });

    return {
      success: true,
      taskCount,
      taskDataTotal,
      fingerprintRuleTotal,
      fofaFingerprintDataTotal,
      uniqueIpTotal: uniqueIpSet.size,
      regionStats,
      fingerprintCategoryStats
    };
  } catch (error) {
    console.error('Get home dashboard summary error:', error);
    return { success: false, error: error.message };
  }
}

function normalizeHostField(value) {
  let raw = String(value || '').trim();
  if (!raw) return '';

  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
      return new URL(raw).host || '';
    }
  } catch {}

  raw = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  raw = raw.replace(/^[^@]+@/, '');
  raw = raw.split(/[/?#]/)[0];
  return raw.trim().replace(/\.$/, '');
}

function getHostNamePart(value) {
  const normalized = normalizeHostField(value);
  if (!normalized) return '';
  if (normalized.startsWith('[')) {
    const end = normalized.indexOf(']');
    return end > 0 ? normalized.slice(1, end) : normalized;
  }
  return normalized.replace(/:\d+$/, '');
}

function isPureIpv4Host(value) {
  const host = getHostNamePart(value);
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  return parts.every(part => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

function isPureDomainHost(value) {
  const host = getHostNamePart(value).toLowerCase();
  if (!host || isPureIpv4Host(host)) return false;
  return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host) && /[a-z]/.test(host);
}

function getHostAssetType(value) {
  if (isPureIpv4Host(value)) return 'ip';
  if (isPureDomainHost(value)) return 'domain';
  return 'other';
}

// 常见的顶级域名，用于排除和辅助判断根域名
const EXCLUDED_TLDS = new Set([
  'com', 'org', 'net', 'cn', 'io', 'co', 'gov', 'edu', 'mil', 'int', 'arpa', 'biz', 'info', 'name', 'pro', 'aero', 'coop', 'museum', 'travel', 'mobi', 'cat', 'asia', 'tel', 'jobs', 'post', 'xxx', 'xyz', 'top', 'site', 'online', 'tech', 'store', 'shop', 'blog', 'app', 'dev', 'cloud', 'ai', 'data', 'me', 'tv', 'cc', 'ws', 'fm', 'vc', 'sh', 'la', 'in', 'jp', 'uk', 'us', 'fr', 'de', 'ru', 'br', 'au', 'ca', 'it', 'es', 'nl', 'se', 'no', 'dk', 'fi', 'ch', 'at', 'be', 'pl', 'cz', 'hu', 'gr', 'pt', 'ie', 'nz', 'sg', 'my', 'ph', 'th', 'id', 'vn', 'kr', 'hk', 'tw', 'mo', 'pk', 'sa', 'ae', 'qa', 'kw', 'bh', 'om', 'ir', 'il', 'tr', 'eg', 'za', 'ng', 'ke', 'gh', 'ug', 'tz', 'zm', 'zw', 'ao', 'dz', 'ma', 'tn', 'sn', 'ci', 'cm', 'ga', 'cd', 'et', 'sd', 'mg', 'mz', 'mw', 'rw', 'bi', 'bj', 'bf', 'cv', 'td', 'km', 'cg', 'dj', 'gq', 'gw', 'ls', 'lr', 'ly', 'ml', 'mr', 'mu', 'ne', 'sl', 'so', 'tg', 'eh', 'er', 'sz', 'st', 'sc', 'cf', 'ao', 'bf', 'bi', 'bj', 'bw', 'cd', 'cf', 'cg', 'ci', 'cm', 'cv', 'dj', 'dz', 'eg', 'eh', 'er', 'et', 'ga', 'gh', 'gm', 'gn', 'gq', 'gw', 'ke', 'km', 'lr', 'ls', 'ly', 'ma', 'mg', 'ml', 'mr', 'mu', 'mw', 'mz', 'na', 'ne', 'ng', 'rw', 'sc', 'sd', 'sl', 'sn', 'so', 'st', 'sz', 'td', 'tg', 'tn', 'tz', 'ug', 'za', 'zm', 'zw'
]);

// 辅助函数：从完整域名中提取根域名
// 尝试处理常见的两段或三段后缀，不依赖公共后缀列表
function getRootDomain(domain) {
  if (!domain || typeof domain !== 'string') return '';
  const parts = domain.split('.');
  const len = parts.length;

  if (len <= 1) return domain; // e.g., "localhost" or "example"

  const tld = parts[len - 1];
  const secondLevel = parts[len - 2];

  // Check for common two-part TLDs like co.uk, com.cn, org.cn, etc.
  // This is a simplified list and might need expansion for full accuracy.
  const twoPartTlds = new Set(['com.cn', 'org.cn', 'net.cn', 'gov.cn', 'edu.cn', 'co.uk', 'org.uk', 'me.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.jp', 'or.jp', 'ne.jp', 'go.jp', 'ac.jp']);

  if (len >= 3 && twoPartTlds.has(`${secondLevel}.${tld}`)) {
    return parts.slice(len - 3).join('.'); // e.g., example.co.uk
  } else if (len >= 2) {
    return parts.slice(len - 2).join('.'); // e.g., example.com
  }
  return domain;
}

function normalizeRelatedAssetCandidates(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];

  return raw
    .split(/[\n\r,;|]+/)
    .map(item => String(item || '').trim())
    .map(item => item.replace(/^CN\s*=\s*/i, '').replace(/^\*\./, ''))
    .map(item => getHostNamePart(item).toLowerCase().replace(/^\*\./, '').replace(/\.$/, ''))
    .filter(Boolean)
    .filter(item => !isPureIpv4Host(item))
    .filter(item => /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(item)) // Ensure it's a valid domain format
    .map(item => getRootDomain(item)) // Extract root domain
    .filter(item => !EXCLUDED_TLDS.has(item)) // Exclude if it's just a TLD (e.g., "com", "cn")
    .filter(item => item.includes('.')); // Ensure it still looks like a domain (e.g., not just "example")
}

async function getTaskRelatedAssets(projectId) {
  try {
    const id = parseInt(projectId, 10);
    if (!Number.isFinite(id)) return { success: false, error: '参数错误' };

    const db = await getDb();
    const sourceTableName = await resolveTaskSourceTableName(db, id);
    if (!sourceTableName) return { success: true, rows: [] };

    // 动态检查列名，避免 "no such column" 错误
    const pragmaRes = db.exec(`PRAGMA table_info("${sourceTableName}")`);
    const availableColumns = (pragmaRes?.[0]?.values || []).map(v => v[1]);
    
    // 我们需要的核心列
    const neededColumns = ['target', 'domain', 'cert_subject_cn', 'host'];
    const queryColumns = neededColumns.filter(col => availableColumns.includes(col));
    
    // 如果没有 target 列但有 host 列，尝试用 host 替代 target，或者直接查全部
    const res = db.exec(`SELECT ${queryColumns.map(c => `"${c}"`).join(', ')} FROM "${sourceTableName}"`);
    if (res.length === 0) return { success: true, rows: [] };

    const columns = res[0].columns;
    const records = res[0].values.map(values => {
      const row = {};
      columns.forEach((col, index) => {
        row[col] = values[index];
      });
      return row;
    });

    const results = [];
    const uniqueAssetsMap = new Map(); // Key: `${target}|${domainLower}`, Value: { target, relatedDomain, sourceFieldName, sourceRawValue, sourceFullRecord }

    for (const row of records) {
      const targetVal = row.target || row.host || '-';
      const target = normalizeHostField(targetVal) || String(targetVal).trim();
      const targetHostPart = getHostNamePart(target).toLowerCase();

      const processField = (fieldName, rawValue) => {
        if (!rawValue) return;
        const candidates = normalizeRelatedAssetCandidates(rawValue);
        for (const domain of candidates) {
          const domainLower = domain.toLowerCase();
          
          // 关联域名不能和目标主域名相同
          if (domainLower === targetHostPart || domainLower === target.toLowerCase()) continue;
          
          const mapKey = `${target}|${domainLower}`;
          if (!uniqueAssetsMap.has(mapKey)) {
            uniqueAssetsMap.set(mapKey, {
              target: target,
              relatedDomain: domain,
              sourceFieldName: fieldName,
              sourceRawValue: rawValue,
              sourceFullRecord: row // 保存当前整行记录
            });
          }
        }
      };

      if (availableColumns.includes('domain')) processField('domain', row.domain);
      if (availableColumns.includes('cert_subject_cn')) processField('cert_subject_cn', row.cert_subject_cn);
      if (availableColumns.includes('host')) processField('host', row.host);
    }

    const finalResults = Array.from(uniqueAssetsMap.values()).map((item, index) => ({
      id: index + 1,
      target: item.target,
      relatedDomain: item.relatedDomain,
      source: `第一次在总资产中的 [${item.sourceFieldName}] 字段发现: ${item.sourceRawValue}`,
      sourceRawValue: item.sourceRawValue,
      sourceFullRecord: item.sourceFullRecord // 返回完整数据
    }));

    finalResults.sort((a, b) => a.relatedDomain.localeCompare(b.relatedDomain));

    return { 
      success: true, 
      rows: finalResults, 
      total: finalResults.length 
    };
  } catch (error) {
    console.error(`Get task related assets ${projectId} error:`, error);
    return { success: false, error: error.message };
  }
}

async function getTaskIpAggregation(projectId) {
  try {
    const id = parseInt(projectId, 10);
    if (!Number.isFinite(id)) return { success: false, error: '参数错误' };

    const db = await getDb();
    const tableName = await resolveTaskSourceTableName(db, id);
    if (!tableName) return { success: true, rows: [] };

    // 获取数据，包括 ip, port, target
    const pragmaRes = db.exec(`PRAGMA table_info("${tableName}")`);
    const availableColumns = (pragmaRes?.[0]?.values || []).map(v => v[1]);
    
    const neededColumns = ['ip', 'port', 'target'];
    const queryColumns = neededColumns.filter(col => availableColumns.includes(col));
    
    const res = db.exec(`SELECT ${queryColumns.map(c => `"${c}"`).join(', ')} FROM "${tableName}"`);
    if (res.length === 0) return { success: true, rows: [] };

    const columns = res[0].columns;
    const records = res[0].values.map(values => {
      const row = {};
      columns.forEach((col, index) => {
        row[col] = values[index];
      });
      return row;
    });

    // 聚合逻辑
    const ipMap = new Map(); // Key: ip, Value: { ip, ports: Set, targets: Set, count: number }

    for (const row of records) {
      const ip = String(row.ip || '').trim();
      if (!ip) continue;

      const port = String(row.port || '').trim();
      const target = String(row.target || '').trim();

      if (!ipMap.has(ip)) {
        ipMap.set(ip, {
          ip,
          ports: new Set(),
          targets: new Set(),
          count: 0
        });
      }

      const item = ipMap.get(ip);
      if (port) item.ports.add(port);
      if (target) item.targets.add(target);
      item.count += 1;
    }

    const rows = Array.from(ipMap.values()).map((item, index) => ({
      id: index + 1,
      ip: item.ip,
      ports: Array.from(item.ports).sort((a, b) => parseInt(a) - parseInt(b)).join(', '),
      targets: Array.from(item.targets),
      assetCount: item.count
    }));

    // 按资产数量倒序排列
    rows.sort((a, b) => b.assetCount - a.assetCount);

    return { success: true, rows, total: rows.length };
  } catch (error) {
    console.error(`Get task IP aggregation ${projectId} error:`, error);
    return { success: false, error: error.message };
  }
}

async function getTaskCountryStats(projectId) {
  try {
    const id = parseInt(projectId, 10);
    if (!Number.isFinite(id)) return { success: false, error: '参数错误' };

    const db = await getDb();
    const tableName = await resolveTaskSourceTableName(db, id);
    if (!tableName) return { success: true, rows: [] };

    const pragmaRes = db.exec(`PRAGMA table_info("${tableName}")`);
    const availableColumns = (pragmaRes?.[0]?.values || []).map(v => v[1]);
    
    const neededColumns = ['countryName', 'target'];
    const queryColumns = neededColumns.filter(col => availableColumns.includes(col));
    
    const res = db.exec(`SELECT ${queryColumns.map(c => `"${c}"`).join(', ')} FROM "${tableName}"`);
    if (res.length === 0) return { success: true, rows: [] };

    const columns = res[0].columns;
    const records = res[0].values.map(values => {
      const row = {};
      columns.forEach((col, index) => {
        row[col] = values[index];
      });
      return row;
    });

    // 聚合逻辑
    const countryMap = new Map(); // Key: countryName, Value: { country, targets: Set, count: number }

    for (const row of records) {
      let country = String(row.countryName || '').trim();
      if (!country || country === 'null') country = '未知';
      const target = String(row.target || '').trim();

      if (!countryMap.has(country)) {
        countryMap.set(country, {
          country,
          targets: new Set(),
          count: 0
        });
      }

      const item = countryMap.get(country);
      if (target) item.targets.add(target);
      item.count += 1;
    }

    const allRows = Array.from(countryMap.values()).map(item => ({
      country: item.country,
      targets: Array.from(item.targets),
      count: item.count
    }));

    // 按数量倒序排列
    allRows.sort((a, b) => b.count - a.count);

    // 取前十个作为图表数据
    const topRows = allRows.slice(0, 10);

    return { success: true, rows: topRows, allRows, total: allRows.length };
  } catch (error) {
    console.error(`Get task country stats ${projectId} error:`, error);
    return { success: false, error: error.message };
  }
}

async function getTaskFingerprintStats(projectId) {
  try {
    const id = parseInt(projectId, 10);
    if (!Number.isFinite(id)) return { success: false, error: '参数错误' };

    const db = await getDb();
    const tableName = await resolveTaskSourceTableName(db, id);
    if (!tableName) return { success: true, rows: [] };

    const pragmaRes = db.exec(`PRAGMA table_info("${tableName}")`);
    const availableColumns = (pragmaRes?.[0]?.values || []).map(v => v[1]);
    
    const neededColumns = ['fingerprint', 'target'];
    const queryColumns = neededColumns.filter(col => availableColumns.includes(col));
    
    const res = db.exec(`SELECT ${queryColumns.map(c => `"${c}"`).join(', ')} FROM "${tableName}"`);
    if (res.length === 0) return { success: true, rows: [] };

    const columns = res[0].columns;
    const records = res[0].values.map(values => {
      const row = {};
      columns.forEach((col, index) => {
        row[col] = values[index];
      });
      return row;
    });

    // 指纹分类规则 (启发式)
    const FINGERPRINT_CATEGORIES = {
      'Web Server': ['nginx', 'apache', 'iis', 'tengine', 'jetty', 'lighttpd', 'caddy', 'tomcat', 'openresty', 'microsoft-httpapi'],
      'Framework/Library': ['vue', 'react', 'jquery', 'bootstrap', 'spring', 'django', 'flask', 'laravel', 'express', 'asp.net', 'php', 'thinkphp', 'jquery-ui', 'moment.js'],
      'CMS': ['wordpress', 'joomla', 'drupal', 'discuz', 'dedecms', 'z-blog', 'ghost', 'strapi', 'hexo', 'magento', 'shopify', 'ecshop'],
      'Security/WAF': ['cloudflare', 'waf', 'fortinet', 'palo alto', 'f5', 'checkpoint', 'incapsula', 'akamai', 'safeline'],
      'DevOps/Tool': ['jenkins', 'gitlab', 'docker', 'kubernetes', 'grafana', 'prometheus', 'kibana', 'rabbitmq', 'activemq', 'sonarqube'],
      'Database/Cache': ['mysql', 'redis', 'mongodb', 'postgresql', 'elasticsearch', 'memcached', 'oracle', 'sql server']
    };

    const getCategory = (fp) => {
      const lowerFp = fp.toLowerCase();
      for (const [cat, keywords] of Object.entries(FINGERPRINT_CATEGORIES)) {
        if (keywords.some(kw => lowerFp.includes(kw))) return cat;
      }
      return 'Others';
    };

    // 聚合逻辑
    const fpMap = new Map(); // Key: fpName, Value: { name, category, targets: Set, count: number }

    for (const row of records) {
      const rawFp = String(row.fingerprint || '').trim();
      if (!rawFp || rawFp === 'null') continue;

      const target = String(row.target || '').trim();
      // 分号分割并去重
      const fps = Array.from(new Set(rawFp.split(/[;；,，]+/).map(f => f.trim()).filter(Boolean)));

      for (const fp of fps) {
        if (!fpMap.has(fp)) {
          fpMap.set(fp, {
            name: fp,
            category: getCategory(fp),
            targets: new Set(),
            count: 0
          });
        }
        const item = fpMap.get(fp);
        if (target) item.targets.add(target);
        item.count += 1;
      }
    }

    const allRows = Array.from(fpMap.values()).map(item => ({
      name: item.name,
      category: item.category,
      targets: Array.from(item.targets),
      count: item.count
    }));

    // 按数量倒序排列
    allRows.sort((a, b) => b.count - a.count);

    return { success: true, rows: allRows, total: allRows.length };
  } catch (error) {
    console.error(`Get task fingerprint stats ${projectId} error:`, error);
    return { success: false, error: error.message };
  }
}

async function getFofaTaskData(projectId, pageNum = 1, pageSize = 100, searchTerm = '', hostTypes = []) {
  try {
    const db = await getDb();
    const tableName = `fofa_${projectId}`;
    const exists = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`);
    if (exists.length === 0) return { success: true, total: 0, rows: [] };

    const p = Math.max(1, parseInt(pageNum, 10) || 1);
    const s = Math.max(1, Math.min(500, parseInt(pageSize, 10) || 100));
    const offset = (p - 1) * s;

    let whereClause = '';
    const params = [];
    if (searchTerm) {
      // 动态检查列名，避免 "no such column" 错误
      const pragmaRes = db.exec(`PRAGMA table_info("${tableName}")`);
      const availableColumns = (pragmaRes?.[0]?.values || []).map(v => v[1]);

      const searchFields = ['host', 'ip', 'title', 'domain', 'server', 'countryName', 'regionName', 'cityName', 'port', 'protocol', 'fingerprint'];
      const validSearchFields = searchFields.filter(f => availableColumns.includes(f));
      
      if (validSearchFields.length > 0) {
        whereClause = `WHERE (${validSearchFields.map(f => `${f} LIKE ?`).join(' OR ')})`;
        const fuzzy = `%${searchTerm}%`;
        validSearchFields.forEach(() => params.push(fuzzy));
      }
    }

    const res = db.exec(`SELECT * FROM "${tableName}" ${whereClause}`, params);
    if (res.length === 0) return { success: true, total: 0, rows: [] };

    const columns = res[0].columns;
    const values = res[0].values;
    let rows = values.map(val => {
      let obj = {};
      columns.forEach((col, i) => obj[col] = val[i]);
      return obj;
    });

    if (Array.isArray(hostTypes) && hostTypes.length > 0) {
      const selectedTypes = new Set(hostTypes);
      rows = rows.filter(row => selectedTypes.has(getHostAssetType(row.host)));
    }

    const total = rows.length;
    rows = rows.slice(offset, offset + s);

    return { success: true, total, rows };
  } catch (error) {
    console.error(`Get FOFA task data ${projectId} error:`, error);
    return { success: false, error: error.message };
  }
}

async function exportFofaData() {
  try {
    const db = await getDb();
    const res = db.exec(`SELECT * FROM "${FOFA_PROJECT_NOW}"`);
    if (res.length > 0) {
      const columns = res[0].columns;
      const values = res[0].values;
      const rows = values.map(val => {
        let obj = {};
        columns.forEach((col, i) => obj[col] = val[i]);
        return obj;
      });
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        fofa_project: rows
      };
      return { success: true, data: payload, count: rows.length };
    }
    return { success: false, error: '当前没有 FOFA 数据可导出' };
  } catch (error) {
    console.error('Export FOFA data error:', error);
    return { success: false, error: error.message };
  }
}

async function importFofaData(payload) {
  if (!payload || !Array.isArray(payload.fofa_project)) return { success: false, error: '导入数据格式错误' };
  try {
    const db = await getDb();
    const incomingRows = payload.fofa_project;
    if (incomingRows.length === 0) return { success: false, error: '配置文件中没有可导入的数据' };

    // 覆盖导入：直接删除现有表并重建
    upsertTable(db, FOFA_PROJECT_NOW, incomingRows);
    saveDb(db);
    return { success: true, count: incomingRows.length };
  } catch (error) {
    console.error('Import FOFA data error:', error);
    return { success: false, error: error.message };
  }
}

// 6. 导出数据配置（仅导出现在表，用于其他客户端导入）
async function exportData() {
  try {
    const db = await getDb();
    const existsNow = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${PROJECT_TASK_NOW}'`);
    if (existsNow.length === 0) return { success: false, error: '当前没有数据可导出' };

    const tableData = db.exec(`SELECT * FROM "${PROJECT_TASK_NOW}"`);
    const rows = [];
    if (tableData.length > 0) {
      const columns = tableData[0].columns;
      const values = tableData[0].values;
      for (const val of values) {
        let obj = {};
        columns.forEach((col, i) => obj[col] = val[i]);
        rows.push(obj);
      }
    }

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      project_task: rows
    };

    const exportFileName = `project_task_export_${Date.now()}.json`;
    const exportPath = path.join(dbDir, exportFileName);
    fs.writeFileSync(exportPath, JSON.stringify(payload, null, 2));
    return { success: true, path: exportPath, count: rows.length };
  } catch (error) {
    console.error('Export data error:', error);
    return { success: false, error: error.message };
  }
}

// 7. 导入数据配置 (追加并去重写入现在表)
async function importData(importPath) {
  try {
    if (!fs.existsSync(importPath)) return { success: false, error: '文件不存在' };
    const fileContent = fs.readFileSync(importPath, 'utf-8');
    const payload = JSON.parse(fileContent);
    const db = await getDb();

    const incomingRows = Array.isArray(payload?.project_task) ? payload.project_task : [];
    if (incomingRows.length === 0) return { success: false, error: '配置文件中没有可导入的数据' };

    const existsNow = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${PROJECT_TASK_NOW}'`);
    let existingRows = [];
    if (existsNow.length > 0) {
      const existingDataRes = db.exec(`SELECT * FROM "${PROJECT_TASK_NOW}"`);
      if (existingDataRes.length > 0) {
        const columns = existingDataRes[0].columns;
        existingRows = existingDataRes[0].values.map(val => {
          let obj = {};
          columns.forEach((col, i) => obj[col] = val[i]);
          return obj;
        });
      }
    }

    const mergedMap = new Map();
    existingRows.forEach(r => mergedMap.set(r.id, r));
    incomingRows.forEach(r => mergedMap.set(r.id, r));

    const mergedRows = Array.from(mergedMap.values());
    upsertTable(db, PROJECT_TASK_NOW, mergedRows);
    saveDb(db);
    return { success: true, count: incomingRows.length, total: mergedRows.length };
  } catch (error) {
    console.error('Import data error:', error);
    return { success: false, error: error.message };
  }
}

// 8. 删除本地任务
async function deleteLocalTask(projectId) {
  try {
    if (!fs.existsSync(dbPath)) return { success: false, error: '数据库不存在' };
    const db = await getDb();
    
    // 从任务表中删除
    const taskTables = [PROJECT_TASK_NOW, PROJECT_TASK_PAST, PROJECT_TASK_FUTURE];
    for (const t of taskTables) {
      const exists = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${t}'`);
      if (exists.length > 0) db.run(`DELETE FROM "${t}" WHERE id = ?`, [projectId]);
    }

    // 从 FOFA 指纹库表中删除
    const fofaTables = [FOFA_PROJECT_NOW, FOFA_PROJECT_PAST, FOFA_PROJECT_FUTURE];
    for (const t of fofaTables) {
      const exists = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${t}'`);
      if (exists.length > 0) db.run(`DELETE FROM "${t}" WHERE id = ?`, [projectId]);
    }
    
    // 删除对应的详细数据表
    db.run(`DROP TABLE IF EXISTS "${projectId}"`);
    db.run(`DROP TABLE IF EXISTS "fofa_${projectId}"`);
    
    saveDb(db);
    return { success: true };
  } catch (error) {
    console.error(`Delete local task ${projectId} error:`, error);
    return { success: false, error: error.message };
  }
}

async function deleteRemoteTask(projectId, token) {
  try {
    const id = parseInt(projectId, 10);
    if (!Number.isFinite(id)) return { success: false, error: '参数错误' };
    if (!token) return { success: false, error: '缺少登录凭证' };

    const response = await backendRequest(`/module/project/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json, text/plain, */*'
      }
    });

    const data = response.data || {};
    if (!response.ok) {
      return { success: false, error: data?.msg || `HTTP ${response.status}` };
    }
    if (data?.code !== undefined && data.code !== 200) {
      return { success: false, error: data?.msg || '云端删除失败' };
    }
    return { success: true, msg: data?.msg || '云端删除成功' };
  } catch (error) {
    console.error(`Delete remote task ${projectId} error:`, error);
    return { success: false, error: error.message };
  }
}

async function invokeProjectTaskAction(pathname, projectId, token) {
  try {
    const id = parseInt(projectId, 10);
    if (!Number.isFinite(id)) return { success: false, error: '参数错误' };
    if (!token) return { success: false, error: '缺少登录凭证' };

    const response = await backendRequest(pathname, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*'
      },
      body: JSON.stringify({ id })
    });

    const data = response.data || {};
    if (!response.ok) {
      return { success: false, error: data?.msg || `HTTP ${response.status}` };
    }
    if (data?.code !== undefined && data.code !== 200) {
      return { success: false, error: data?.msg || '请求执行失败' };
    }

    return { success: true, msg: data?.msg || 'ok' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function resolveTaskSourceTableName(db, projectId) {
  const id = parseInt(projectId, 10);
  if (!Number.isFinite(id)) return null;

  const escapeSqlString = (value) => String(value || '').replace(/'/g, "''");
  const tableExistsByName = (name) => {
    const safeName = escapeSqlString(name);
    const exists = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${safeName}' LIMIT 1`);
    return exists.length > 0 && (exists?.[0]?.values?.length || 0) > 0;
  };

  const tableChecks = [PROJECT_TASK_NOW, FOFA_PROJECT_NOW];

  for (const tableName of tableChecks) {
    const pragmaRes = db.exec(`PRAGMA table_info("${tableName}")`);
    if (pragmaRes.length === 0) continue;

    const columnNames = (pragmaRes?.[0]?.values || []).map(item => String(item?.[1] || ''));
    const mappingColumn = columnNames.includes('tables') ? 'tables' : (columnNames.includes('table') ? 'table' : '');
    if (!mappingColumn) continue;

    const projectRes = db.exec(`SELECT "${mappingColumn}" FROM "${tableName}" WHERE id = ? LIMIT 1`, [id]);
    const rawTables = projectRes?.[0]?.values?.[0]?.[0];
    if (!rawTables) continue;

    const candidates = String(rawTables)
      .split(';')
      .map(item => String(item || '').trim())
      .filter(Boolean);

    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      const preferred = candidates[i];
      if (preferred && tableExistsByName(preferred)) {
        return preferred;
      }
    }
  }

  const fallbacks = [String(id), `fofa_${id}`];
  for (const fb of fallbacks) {
    if (tableExistsByName(fb)) return fb;
  }

  return null;
}

async function getTaskData(projectId, pageNum = 1, pageSize = 100, searchTerm = '', targetFilter = '') {
  try {
    const id = parseInt(projectId, 10);
    if (!Number.isFinite(id)) return { success: false, error: '参数错误' };

    const db = await getDb();
    const tableName = await resolveTaskSourceTableName(db, id);
    if (!tableName) return { success: true, total: 0, rows: [] };

    const p = Math.max(1, parseInt(pageNum, 10) || 1);
    const s = Math.max(1, Math.min(500, parseInt(pageSize, 10) || 100));
    const offset = (p - 1) * s;

    let whereClause = '';
    const params = [];
    const conditions = [];

    if (searchTerm) {
      // 动态检查列名，避免 "no such column" 错误
      const pragmaRes = db.exec(`PRAGMA table_info("${tableName}")`);
      const availableColumns = (pragmaRes?.[0]?.values || []).map(v => v[1]);
      const searchFields = ['host', 'ip', 'title', 'fingerprint', 'server', 'domain', 'region', 'city', 'port', 'protocol'];
      const validFields = searchFields.filter(f => availableColumns.includes(f));
      
      if (validFields.length > 0) {
        conditions.push(`(${validFields.map(f => `${f} LIKE ?`).join(' OR ')})`);
        const fuzzy = `%${searchTerm}%`;
        validFields.forEach(() => params.push(fuzzy));
      }
    }

    if (targetFilter) {
      conditions.push(`target = ?`);
      params.push(targetFilter);
    }

    if (conditions.length > 0) {
      whereClause = `WHERE ` + conditions.join(' AND ');
    }

    const countRes = db.exec(`SELECT COUNT(1) AS cnt FROM "${tableName}" ${whereClause}`, params);
    const total = countRes?.[0]?.values?.[0]?.[0] ?? 0;

    const res = db.exec(`SELECT * FROM "${tableName}" ${whereClause} LIMIT ${s} OFFSET ${offset}`, params);
    if (res.length === 0) return { success: true, total, rows: [] };

    const columns = res[0].columns;
    const values = res[0].values;
    const rows = values.map(val => {
      let obj = {};
      columns.forEach((col, i) => obj[col] = val[i]);
      return obj;
    });

    return { success: true, total, rows };
  } catch (error) {
    console.error(`Get task data ${projectId} error:`, error);
    return { success: false, error: error.message };
  }
}

async function getTaskStats(projectId) {
  try {
    const id = parseInt(projectId, 10);
    if (!Number.isFinite(id)) return { success: false, error: '参数错误' };

    const db = await getDb();
    const tableName = await resolveTaskSourceTableName(db, id);
    if (!tableName) return { success: true, total: 0, uniqueIp: 0, uniqueHost: 0, countries: [], countriesAll: [], ips: [], nonCdnTop5: [], cdn: { yes: 0, no: 0 }, regions: [] };

    // 全量读取表数据（规模较大时可改为分批迭代）
    const res = db.exec(`SELECT * FROM "${tableName}"`);
    if (res.length === 0) return { success: true, total: 0, uniqueIp: 0, uniqueHost: 0, countries: [], countriesAll: [], ips: [], nonCdnTop5: [], cdn: { yes: 0, no: 0 }, regions: [], targets: [] };

    const columns = res[0].columns;
    const rows = res[0].values.map(val => {
      let obj = {};
      columns.forEach((col, i) => obj[col] = val[i]);
      return obj;
    });

    const targetSet = new Set();
    const countryMap = new Map();
    const ipMap = new Map();
    const ipSet = new Set();
    const hostSet = new Set();
    let cdnYes = 0, cdnNo = 0;
    const nonCdnIpMap = new Map();
    const nonCdnIpHostMap = new Map();

    const cdnVendors = [
      'cloudflare','akamai','cloudfront','fastly','vercel',
      'aliyun','alibaba','tencent','baidu','qiniu','wangsu','360cdn',
      'ksyun','ucloud','jd','bytedance','edgenext','azure cdn','azurefront',
      'google cloud cdn','gcore','cachefly','stackpath','limelight','cloudsigma','cdn'
    ];
    const cdnHostPatterns = [
      /\.cloudfront\.net$/,
      /\.akamaiedge\.net$/,
      /\.akamai(net)?/,
      /\.fastly(net)?/,
      /\.cdn\./,
      /\.cdn\d*\./,
      /\.edgesuite\.net$/,
      /\.llnwd\.net$/,
      /\.azureedge\.net$/,
      /\.gcdn\.co$/
    ];
    const isCDN = (row) => {
      const text = [row.org, row.server, row.asn, row.host, row.domain, row.cdn, row.cdnName, row.cdnVendor].filter(Boolean).join(' ').toLowerCase();
      if (cdnVendors.some(v => text.includes(v))) return true;
      const host = String(row.host || '').toLowerCase();
      return cdnHostPatterns.some(re => re.test(host));
    };

    const regionMap = new Map();
    const toRegion = (cn) => {
      if (!cn) return '其他';
      const s = String(cn);
      if (/(中国|日本|韩国|印度|新加坡|马来|泰国|越南|菲律宾|印尼|巴基斯坦|阿联酋|以色列|土耳其|哈萨克|沙特|伊朗|伊拉克|卡塔尔|科威特|黎巴嫩|约旦)/.test(s)) return '亚洲';
      if (/(美国|加拿大|墨西哥|古巴|巴拿马)/.test(s)) return '北美';
      if (/(巴西|阿根廷|智利|秘鲁|哥伦比亚|厄瓜多尔|乌拉圭)/.test(s)) return '南美';
      if (/(英国|法国|德国|意大利|西班牙|荷兰|瑞士|瑞典|挪威|丹麦|波兰|俄罗斯|乌克兰|捷克|比利时|葡萄牙|奥地利|希腊|芬兰|匈牙利|罗马尼亚)/.test(s)) return '欧洲';
      if (/(澳大利亚|新西兰|斐济)/.test(s)) return '大洋洲';
      if (/(南非|尼日利亚|埃及|肯尼亚|摩洛哥|阿尔及利亚|埃塞俄比亚|加纳)/.test(s)) return '非洲';
      return '其他';
    };

    const normalizeCountryToCN = (raw) => {
      if (!raw) return null;
      const s0 = String(raw).trim();
      const alpha = s0.replace(/[^a-zA-Z]/g, '').toLowerCase();
      if (['hk','hkg','tw','twn','mo','mac','cn','chn'].includes(alpha)) {
        if (alpha === 'cn' || alpha === 'chn') return '中国';
        return '中国';
      }
      let s = s0;
      if (/[\u4e00-\u9fff]/.test(s)) {
        s = s.replace(/^中国/, '')
             .replace(/特别行政区|自治区|省|市|地区/g, '')
             .trim();
        if (/^(香港|澳门|台湾)$/.test(s)) return '中国';
        if (/^(香港|香港特别行政区)/.test(s0)) return '中国';
        if (/^(澳门|澳门特别行政区)/.test(s0)) return '中国';
        if (/^(台湾|台湾省)/.test(s0)) return '中国';
      } else {
        const t = s0.toLowerCase();
        if (/(china).*(hong\s?kong|macao|macau|taiwan)/.test(t)) return '中国';
        if (/(hong\s?kong|macao|macau|taiwan).*(china)/.test(t)) return '中国';
        if (/(hongkong|hong-kong)/.test(t)) return '中国';
        if (/(macau|macao)/.test(t)) return '中国';
        if (/(taiwan)/.test(t)) return '中国';
      }
      return null;
    };

    for (const r of rows) {
      if (r.target) targetSet.add(r.target);
      const rawCountry = r.countryName || '未知';
      const cnAgg = normalizeCountryToCN(rawCountry);
      const country = cnAgg || rawCountry;
      countryMap.set(country, (countryMap.get(country) || 0) + 1);
      const ip = r.ip || '';
      if (ip) {
        ipMap.set(ip, (ipMap.get(ip) || 0) + 1);
        ipSet.add(ip);
      }
      if (r.host) hostSet.add(r.host);
      const cdn = isCDN(r);
      if (cdn) cdnYes++; else cdnNo++;
      if (!cdn && ip) {
        nonCdnIpMap.set(ip, (nonCdnIpMap.get(ip) || 0) + 1);
        const host = String(r.host || '').trim();
        if (host) {
          let hm = nonCdnIpHostMap.get(ip);
          if (!hm) {
            hm = new Map();
            nonCdnIpHostMap.set(ip, hm);
          }
          hm.set(host, (hm.get(host) || 0) + 1);
        }
      }
      const region = toRegion(country);
      regionMap.set(region, (regionMap.get(region) || 0) + 1);
    }

    const mapToSortedArray = (m, topN = 8) => Array.from(m.entries()).sort((a,b)=>b[1]-a[1]).slice(0, topN).map(([name, value]) => ({ name, value }));
    const mapToArrayAll = (m) => Array.from(m.entries()).sort((a,b)=>b[1]-a[1]).map(([name, value]) => ({ name, value }));
    const nonCdnTop5 = Array.from(nonCdnIpMap.entries())
      .sort((a,b)=>b[1]-a[1])
      .slice(0, 5)
      .map(([ipAddr, cnt]) => {
        const hm = nonCdnIpHostMap.get(ipAddr);
        const hosts = hm ? Array.from(hm.entries()).sort((a,b)=>b[1]-a[1]).slice(0, 3).map(([h]) => h) : [];
        return { ip: ipAddr, count: cnt, hosts };
      });

    // 获取所有去重后的非 CDN IP 列表（用于悬浮显示）
    const allNonCdnIps = Array.from(nonCdnIpMap.keys()).sort();

    // 统计指纹 Top 5 (小报展示用)
    const fpMap = new Map();
    rows.forEach(r => {
      if (r.fingerprint) {
        r.fingerprint.split(/[;,]/).forEach(f => {
          const name = f.trim();
          if (name) fpMap.set(name, (fpMap.get(name) || 0) + 1);
        });
      }
    });
    const topFingerprints = Array.from(fpMap.entries()).sort((a,b)=>b[1]-a[1]).slice(0, 5).map(([name, value]) => ({ name, value }));

    return {
      success: true,
      total: rows.length,
      uniqueIp: ipSet.size,
      uniqueHost: hostSet.size,
      countries: mapToSortedArray(countryMap, 8),
      countriesAll: mapToArrayAll(countryMap),
      ips: mapToSortedArray(ipMap, 8),
      nonCdnTop5,
      allNonCdnIps,
      topFingerprints,
      cdn: { yes: cdnYes, no: cdnNo },
      regions: mapToSortedArray(regionMap, 12),
      targets: Array.from(targetSet).sort()
    };
  } catch (error) {
    console.error(`Get task stats ${projectId} error:`, error);
    return { success: false, error: error.message };
  }
}

async function getRelatedDomainList(projectId, token, pageNum = 1, pageSize = 100) {
  try {
    const id = parseInt(projectId, 10);
    if (!Number.isFinite(id)) return { success: false, error: '参数错误' };
    if (!token) return { success: false, error: '缺少登录凭证' };

    const response = await backendRequest(`/module/projectData/selectGroupByCentList?pageNum=${pageNum}&pageSize=${pageSize}&projectId=${id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json, text/plain, */*'
      }
    });

    const data = response.data || {};
    const rows =
      (Array.isArray(data?.rows) && data.rows) ||
      (Array.isArray(data?.data?.rows) && data.data.rows) ||
      (Array.isArray(data?.data?.list) && data.data.list) ||
      (Array.isArray(data?.list) && data.list) ||
      (Array.isArray(data?.data) && data.data) ||
      [];

    const total =
      Number(data?.total) ||
      Number(data?.data?.total) ||
      Number(data?.count) ||
      rows.length;

    if (!response.ok) {
      return { success: false, error: data?.msg || `HTTP ${response.status}` };
    }

    if (data?.code !== undefined && data.code !== 200 && !Array.isArray(rows)) {
      return { success: false, error: data?.msg || '获取关联域名失败' };
    }

    return { success: true, rows, total };
  } catch (error) {
    console.error(`Get related domain list ${projectId} error:`, error);
    return { success: false, error: error.message };
  }
}

function createSplashWindow() {
  const splash = new BrowserWindow({
    width: 720,
    height: 420,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    closable: false,
    fullscreenable: false,
    show: true,
    center: true,
    alwaysOnTop: true,
    backgroundColor: '#0b1320',
    icon: fs.existsSync(appIconPath) ? appIconPath : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const splashHtml = `<!DOCTYPE html>
  <html lang="zh-CN">
    <head>
      <meta charset="UTF-8" />
      <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' data:;" />
      <title>K437 Loading</title>
      <style>
        :root {
          --bg-1: #07111d;
          --bg-2: #0d1b2a;
          --line: rgba(88, 166, 255, 0.22);
          --cyan: #00d1ff;
          --blue: #58a6ff;
          --green: #36d399;
          --text: #e6edf3;
          --muted: #8aa0b8;
        }
        * { box-sizing: border-box; }
        html, body {
          width: 100%;
          height: 100%;
          margin: 0;
          overflow: hidden;
          font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
          background:
            radial-gradient(circle at 20% 20%, rgba(0, 209, 255, 0.14), transparent 28%),
            radial-gradient(circle at 78% 18%, rgba(88, 166, 255, 0.12), transparent 30%),
            linear-gradient(135deg, var(--bg-1), var(--bg-2) 58%, #091521);
          color: var(--text);
        }
        body::before,
        body::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        body::before {
          background-image:
            linear-gradient(rgba(88, 166, 255, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(88, 166, 255, 0.05) 1px, transparent 1px);
          background-size: 36px 36px;
          mask-image: linear-gradient(to bottom, rgba(0,0,0,0.85), transparent);
        }
        body::after {
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent);
          transform: translateX(-100%);
          animation: sweep 2.4s linear infinite;
        }
        .shell {
          position: relative;
          width: 100%;
          height: 100%;
          padding: 34px 38px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .mark {
          width: 52px;
          height: 52px;
          border-radius: 16px;
          border: 1px solid rgba(88, 166, 255, 0.35);
          background:
            linear-gradient(145deg, rgba(88, 166, 255, 0.18), rgba(0, 209, 255, 0.08)),
            rgba(4, 14, 24, 0.7);
          box-shadow: 0 0 30px rgba(0, 209, 255, 0.16), inset 0 0 18px rgba(88, 166, 255, 0.12);
          display: grid;
          place-items: center;
          font-size: 22px;
          font-weight: 700;
          letter-spacing: 1px;
        }
        .title {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .title h1 {
          margin: 0;
          font-size: 26px;
          letter-spacing: 1px;
          font-weight: 700;
        }
        .title p {
          margin: 0;
          color: var(--muted);
          font-size: 13px;
          letter-spacing: 1.4px;
          text-transform: uppercase;
        }
        .panel {
          position: relative;
          padding: 22px 24px;
          border-radius: 20px;
          background: rgba(8, 18, 30, 0.7);
          border: 1px solid var(--line);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.03), 0 22px 60px rgba(0,0,0,0.28);
          overflow: hidden;
        }
        .panel::before {
          content: "";
          position: absolute;
          inset: -1px;
          border-radius: 20px;
          padding: 1px;
          background: linear-gradient(120deg, rgba(88,166,255,0.35), rgba(0,209,255,0.12), rgba(54,211,153,0.28));
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
                  mask-composite: exclude;
          pointer-events: none;
        }
        .status {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 18px;
        }
        .status strong {
          font-size: 21px;
          font-weight: 700;
        }
        .status span {
          color: var(--muted);
          font-size: 14px;
        }
        .loader {
          position: relative;
          height: 8px;
          border-radius: 999px;
          overflow: hidden;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(88, 166, 255, 0.15);
        }
        .loader::before {
          content: "";
          position: absolute;
          inset: 0;
          width: 38%;
          border-radius: inherit;
          background: linear-gradient(90deg, var(--cyan), var(--blue), var(--green));
          box-shadow: 0 0 24px rgba(0, 209, 255, 0.35);
          animation: load 1.3s ease-in-out infinite;
        }
        .meta {
          margin-top: 18px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          color: var(--muted);
          font-size: 13px;
        }
        .dots {
          display: inline-flex;
          gap: 6px;
          align-items: center;
        }
        .dots i {
          width: 7px;
          height: 7px;
          display: block;
          border-radius: 50%;
          background: rgba(88, 166, 255, 0.25);
          animation: pulse 1.2s infinite ease-in-out;
        }
        .dots i:nth-child(2) { animation-delay: 0.16s; }
        .dots i:nth-child(3) { animation-delay: 0.32s; }
        .hint {
          font-size: 12px;
          color: rgba(138, 160, 184, 0.88);
          letter-spacing: 0.3px;
        }
        @keyframes load {
          0% { transform: translateX(-120%); }
          55% { transform: translateX(160%); }
          100% { transform: translateX(160%); }
        }
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.9); }
          40% { opacity: 1; transform: scale(1.1); }
        }
        @keyframes sweep {
          to { transform: translateX(100%); }
        }
      </style>
    </head>
    <body>
      <div class="shell">
        <div class="brand">
          <div class="mark">K</div>
          <div class="title">
            <h1>K437</h1>
            <p>系统启动引导</p>
          </div>
        </div>
        <div class="panel">
          <div class="status">
            <strong>系统启动中</strong>
            <span>正在加载本地数据与工作台</span>
          </div>
          <div class="loader"></div>
          <div class="meta">
            <div class="dots"><i></i><i></i><i></i></div>
            <div class="hint">请稍候，正在建立运行环境...</div>
          </div>
        </div>
      </div>
    </body>
  </html>`;

  splash.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(splashHtml)}`);
  return splash;
}

function createWindow() {
  const splash = createSplashWindow();
  const splashShownAt = Date.now();
  const minSplashDuration = 1200;
  const win = new BrowserWindow({
    width: 1280,
    height: 1000,
    minWidth: 1100,
    minHeight: 900,
    show: false,
    backgroundColor: '#0d1117',
    icon: fs.existsSync(appIconPath) ? appIconPath : undefined,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    frame: false,
    titleBarStyle: 'hidden',
  });
  mainWindow = win;

  // 窗口控制 IPC
  let mainWindowShown = false;
  const revealMainWindow = () => {
    if (mainWindowShown || win.isDestroyed()) return;
    const remaining = Math.max(0, minSplashDuration - (Date.now() - splashShownAt));
    mainWindowShown = true;
    setTimeout(() => {
      if (win.isDestroyed()) return;
      win.show();
      win.focus();
      if (splash && !splash.isDestroyed()) splash.destroy();
    }, remaining);
  };

  win.once('ready-to-show', revealMainWindow);
  win.webContents.once('did-finish-load', revealMainWindow);
  win.webContents.on('did-fail-load', revealMainWindow);
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
    if (splash && !splash.isDestroyed()) splash.destroy();
  });
  setTimeout(revealMainWindow, 4000);

  ipcMain.on('window-min', () => win.minimize());
  ipcMain.on('window-max', () => {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });
  ipcMain.on('window-close', () => win.close());
  ipcMain.on('window-reload', () => win.reload());
  ipcMain.on('window-devtools', () => win.webContents.toggleDevTools());
  ipcMain.on('open-external', (event, url) => shell.openExternal(url));

  // 数据同步 IPC
  ipcMain.handle('sync-project-list', async (event, { token }) => {
    await dbMutex.lock();
    try {
      return await fetchToFuture(token);
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('apply-future-to-now', async () => {
    await dbMutex.lock();
    try {
      return await applyFutureToNow();
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('backup-now-to-past', async () => {
    await dbMutex.lock();
    try {
      return await backupNowToPast();
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('backup-fofa-now-to-past', async () => {
    await dbMutex.lock();
    try {
      return await backupFofaNowToPast();
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('sync-task-detail', async (event, { projectId, token, force = false }) => {
    await dbMutex.lock();
    try {
      return await syncTaskDetailData(projectId, token, force);
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('sync-task-cloud-data', async (event, { token }) => {
    await dbMutex.lock();
    try {
      return await syncAllTaskCloudData(token);
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('sync-fofa-task-detail', async (event, { projectId, token, force = false }) => {
    await dbMutex.lock();
    try {
      return await syncFofaTaskData(projectId, token, force);
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('sync-fofa-project-list', async (event, { token }) => {
    await dbMutex.lock();
    try {
      return await syncFofaProjectList(token);
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('apply-fofa-future-to-now', async () => {
    await dbMutex.lock();
    try {
      return await applyFofaFutureToNow();
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('get-task-related-assets', async (event, { projectId }) => {
    await dbMutex.lock();
    try {
      return await getTaskRelatedAssets(projectId);
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('get-task-ip-aggregation', async (event, { projectId }) => {
    await dbMutex.lock();
    try {
      return await getTaskIpAggregation(projectId);
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('get-task-country-stats', async (event, { projectId }) => {
    await dbMutex.lock();
    try {
      return await getTaskCountryStats(projectId);
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('get-task-fingerprint-stats', async (event, { projectId }) => {
    await dbMutex.lock();
    try {
      return await getTaskFingerprintStats(projectId);
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('get-ip-detail-data', async (event, { projectId, ip }) => {
    await dbMutex.lock();
    try {
      const db = await getDb();
      const tableName = await resolveTaskSourceTableName(db, projectId);
      if (!tableName) return { success: true, rows: [] };

      const res = db.exec(`SELECT * FROM "${tableName}" WHERE ip = ?`, [ip]);
      if (res.length === 0) return { success: true, rows: [] };

      const columns = res[0].columns;
      const rows = res[0].values.map(val => {
        let obj = {};
        columns.forEach((col, i) => obj[col] = val[i]);
        return obj;
      });

      return { success: true, rows, total: rows.length };
    } catch (error) {
      console.error(`Get IP detail data error:`, error);
      return { success: false, error: error.message };
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('get-country-detail-data', async (event, { projectId, country }) => {
    await dbMutex.lock();
    try {
      const db = await getDb();
      const tableName = await resolveTaskSourceTableName(db, projectId);
      if (!tableName) return { success: true, rows: [] };

      // 精确匹配，如果是“未知”，则查询 countryName IS NULL OR countryName = '' OR countryName = 'null'
      let query = `SELECT * FROM "${tableName}" WHERE countryName = ?`;
      let params = [country];
      
      if (country === '未知') {
        query = `SELECT * FROM "${tableName}" WHERE countryName IS NULL OR countryName = '' OR countryName = 'null'`;
        params = [];
      }

      const res = db.exec(query, params);
      if (res.length === 0) return { success: true, rows: [] };

      const columns = res[0].columns;
      const rows = res[0].values.map(val => {
        let obj = {};
        columns.forEach((col, i) => obj[col] = val[i]);
        return obj;
      });

      return { success: true, rows, total: rows.length };
    } catch (error) {
      console.error(`Get country detail data error:`, error);
      return { success: false, error: error.message };
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('get-fingerprint-detail-data', async (event, { projectId, fingerprint }) => {
    await dbMutex.lock();
    try {
      const db = await getDb();
      const tableName = await resolveTaskSourceTableName(db, projectId);
      if (!tableName) return { success: true, rows: [] };

      // 模糊匹配指纹
      const res = db.exec(`SELECT * FROM "${tableName}" WHERE fingerprint LIKE ?`, [`%${fingerprint}%`]);
      if (res.length === 0) return { success: true, rows: [] };

      const columns = res[0].columns;
      const rows = res[0].values.map(val => {
        let obj = {};
        columns.forEach((col, i) => obj[col] = val[i]);
        return obj;
      });

      return { success: true, rows, total: rows.length };
    } catch (error) {
      console.error(`Get fingerprint detail data error:`, error);
      return { success: false, error: error.message };
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('get-domain-detail-data', async (event, { projectId, domain }) => {
    await dbMutex.lock();
    try {
      const db = await getDb();
      const tableName = await resolveTaskSourceTableName(db, projectId);
      if (!tableName) return { success: true, rows: [] };

      // 使用 LIKE 查询，确保 host 或 domain 中包含该域名
      const res = db.exec(`SELECT * FROM "${tableName}" WHERE host LIKE ? OR domain LIKE ?`, [`%${domain}%`, `%${domain}%`]);
      if (res.length === 0) return { success: true, rows: [] };

      const columns = res[0].columns;
      const rows = res[0].values.map(val => {
        let obj = {};
        columns.forEach((col, i) => obj[col] = val[i]);
        return obj;
      });

      return { success: true, rows, total: rows.length };
    } catch (error) {
      console.error(`Get domain detail data error:`, error);
      return { success: false, error: error.message };
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('get-fofa-projects', async () => {
    await dbMutex.lock();
    try {
      return await getFofaProjects();
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('get-home-dashboard-summary', async () => {
    await dbMutex.lock();
    try {
      return await getHomeDashboardSummary();
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('get-local-projects', async () => {
    await dbMutex.lock();
    try {
      return await getLocalProjects();
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('export-data', async () => {
    await dbMutex.lock();
    try {
      return await exportData();
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('import-data', async (event, { importPath }) => {
    await dbMutex.lock();
    try {
      return await importData(importPath);
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('export-fofa-data', async () => {
    await dbMutex.lock();
    try {
      const res = await exportFofaData();
      if (!res.success) return res;
      
      const { filePath } = await dialog.showSaveDialog(win, {
        title: '导出 FOFA 资产数据',
        defaultPath: `fofa_assets_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      });
      
      if (filePath) {
        fs.writeFileSync(filePath, JSON.stringify(res.data, null, 2), 'utf-8');
        return { success: true, path: filePath };
      }
      return { success: false, canceled: true };
    } catch (e) {
      console.error('[main:check-node-online] exception =', e);
      return { success: false, error: e.message };
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('import-fofa-data', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: '导入 FOFA 资产数据',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    
    await dbMutex.lock();
    try {
      const fileContent = fs.readFileSync(result.filePaths[0], 'utf-8');
      const data = JSON.parse(fileContent);
      return await importFofaData(data);
    } catch (e) {
      return { success: false, error: e.message };
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('pick-import-file', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: '导入数据配置文件',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    return { success: true, path: result.filePaths[0] };
  });

  ipcMain.handle('delete-task', async (event, { projectId }) => {
    await dbMutex.lock();
    try {
      return await deleteLocalTask(projectId);
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('delete-task-remote', async (event, { projectId, token }) => {
    return await deleteRemoteTask(projectId, token);
  });

  ipcMain.handle('stop-project-task', async (event, { projectId, token }) => {
    return await invokeProjectTaskAction('/module/project/taskStop', projectId, token);
  });

  ipcMain.handle('rescan-project-task', async (event, { projectId, token }) => {
    return await invokeProjectTaskAction('/module/project/rescan', projectId, token);
  });

  ipcMain.handle('add-fofa-task', async (event, { projectName, remark, url, taskPriority, days, country, token }) => {
    try {
      const response = await backendRequest('/module/project', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          projectName,
          remark,
          url,
          taskPriority: taskPriority || "3",
          days: parseInt(days) || 0,
          type: "fofa",
          country: country || ""
        })
      });
      const data = response.data || {};
      if (data.code === 200) {
        return { success: true, msg: data.msg };
      }
      return { success: false, error: data.msg || '新增任务失败' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('add-project-task', async (event, { projectName, remark, url, token }) => {
    try {
      const requestPayload = {
        projectName,
        remark: remark || '',
        url,
        target: '',
        taskPriority: '3',
        days: 0,
        userUrl: '',
      };
      console.log('[main:add-project-task] input =', { projectName, remark, url, token: token ? '[present]' : '[missing]' });
      console.log('[main:add-project-task] request payload =', requestPayload);
      const response = await backendRequest('/module/project', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestPayload)
      });
      console.log('[main:add-project-task] response status =', response.status, response.statusText);
      const data = response.data || {};
      console.log('[main:add-project-task] response body =', data);
      if (data.code === 200) {
        return { success: true, msg: data.msg };
      }
      const errorMsg = data.msg || '新增任务失败';
      return {
        success: false,
        error: errorMsg === 'assign-node error' ? '节点分配失败，请检查节点服务状态后重试' : errorMsg
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('update-project-remark', async (event, { id, projectName, remark, url, taskPriority, days, token }) => {
    try {
      const requestPayload = {
        id,
        projectName,
        remark: remark || '',
        url,
        target: url,
        taskPriority: taskPriority || '3',
        days: parseInt(days, 10) || 0
      };
      console.log('[main:update-project-remark] input =', {
        id,
        projectName,
        remark,
        url,
        taskPriority,
        days,
        token: token ? '[present]' : '[missing]'
      });
      console.log('[main:update-project-remark] request payload =', requestPayload);
      const response = await backendRequest('/module/project', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestPayload)
      });
      console.log('[main:update-project-remark] response status =', response.status, response.statusText);
      const data = response.data || {};
      console.log('[main:update-project-remark] response body =', data);
      if (data.code === 200) {
        return { success: true, msg: data.msg };
      }
      return { success: false, error: data.msg || '修改失败' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });


  ipcMain.handle('update-fofa-category', async (event, { projectId, category }) => {
    await dbMutex.lock();
    try {
      const db = await getDb();
      db.run(`UPDATE "${FOFA_PROJECT_NOW}" SET category = ? WHERE id = ?`, [category, projectId]);
      saveDb(db);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('toggle-fofa-pin', async (event, { projectId }) => {
    await dbMutex.lock();
    try {
      const db = await getDb();
      const res = db.exec(`SELECT isPinned FROM "${FOFA_PROJECT_NOW}" WHERE id = ?`, [projectId]);
      const current = res[0]?.values[0][0] || 0;
      const next = current === 1 ? 0 : 1;
      db.run(`UPDATE "${FOFA_PROJECT_NOW}" SET isPinned = ? WHERE id = ?`, [next, projectId]);
      saveDb(db);
      return { success: true, isPinned: next };
    } catch (e) {
      return { success: false, error: e.message };
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('set-fofa-color', async (event, { projectId, color }) => {
    await dbMutex.lock();
    try {
      const db = await getDb();
      db.run(`UPDATE "${FOFA_PROJECT_NOW}" SET colorTag = ? WHERE id = ?`, [color, projectId]);
      saveDb(db);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('save-export-file', async (event, { content, defaultPath, filters }) => {
    try {
      const { filePath } = await dialog.showSaveDialog({
        title: '保存导出文件',
        defaultPath: defaultPath,
        filters: filters
      });
      
      if (filePath) {
        fs.writeFileSync(filePath, content, 'utf-8');
        return { success: true, path: filePath };
      }
      return { success: false, canceled: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('get-task-data', async (event, { projectId, pageNum, pageSize, searchTerm = '', targetFilter = '' }) => {
    await dbMutex.lock();
    try {
      return await getTaskData(projectId, pageNum, pageSize, searchTerm, targetFilter);
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('get-fofa-task-data', async (event, { projectId, pageNum, pageSize, searchTerm = '', hostTypes = [] }) => {
    await dbMutex.lock();
    try {
      return await getFofaTaskData(projectId, pageNum, pageSize, searchTerm, hostTypes);
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('get-task-stats', async (event, { projectId }) => {
    await dbMutex.lock();
    try {
      return await getTaskStats(projectId);
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('get-config', async () => {
    try {
      const cfg = readConfig();
      return { success: true, config: cfg };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('save-favicon', async (event, { host, dataUrl }) => {
    // ...
  });

  ipcMain.handle('get-search-history', async (event, { projectId }) => {
    await dbMutex.lock();
    try {
      const db = await getDb();
      const tableName = `search_history_${projectId}`;
      const exists = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`);
      if (exists.length === 0) return { success: true, rows: [] };
      const res = db.exec(`SELECT keyword FROM "${tableName}" ORDER BY id DESC LIMIT 10`);
      if (res.length > 0 && res[0].values.length > 0) {
        return { success: true, rows: res[0].values.map(v => v[0]) };
      }
      return { success: true, rows: [] };
    } catch (e) {
      return { success: false, error: e.message };
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('add-search-history', async (event, { projectId, keyword }) => {
    if (!keyword || !keyword.trim()) return { success: true };
    await dbMutex.lock();
    try {
      const db = await getDb();
      const tableName = `search_history_${projectId}`;
      const exists = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`);
      if (exists.length === 0) {
        db.run(`CREATE TABLE "${tableName}" (id INTEGER PRIMARY KEY AUTOINCREMENT, keyword TEXT UNIQUE)`);
      }
      db.run(`INSERT OR REPLACE INTO "${tableName}" (keyword) VALUES (?)`, [keyword.trim()]);
      saveDb(db);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('delete-search-history', async (event, { projectId, keyword }) => {
    await dbMutex.lock();
    try {
      const db = await getDb();
      const tableName = `search_history_${projectId}`;
      db.run(`DELETE FROM "${tableName}" WHERE keyword = ?`, [keyword]);
      saveDb(db);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('get-favicon', async (event, { host }) => {
    await dbMutex.lock();
    try {
      const db = await getDb();
      const tableName = 'favicons_cache';
      const exists = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`);
      if (exists.length === 0) return { success: true, dataUrl: null };
      const res = db.exec(`SELECT dataUrl FROM ${tableName} WHERE host = ?`, [host]);
      if (res.length > 0 && res[0].values.length > 0) {
        return { success: true, dataUrl: res[0].values[0][0] };
      }
      return { success: true, dataUrl: null };
    } catch (e) {
      return { success: false, error: e.message };
    } finally {
      dbMutex.unlock();
    }
  });

  ipcMain.handle('set-config', async (event, { config }) => {
    const ret = writeConfig(config || {});
    return ret;
  });

  // 获取本机 IP
  ipcMain.handle('check-node-online', async (event, { url }) => {
    try {
      const result = await checkNodeOnline(url);
      console.log('[main:check-node-online] result =', result);
      return result;
    } catch (e) {
      return { success: false, online: false, error: e.message || '节点探测失败' };
    }
  });

  ipcMain.handle('check-backend-online', async () => {
    try {
      const result = await checkBackendOnline();
      console.log('[main:check-backend-online] result =', result);
      return result;
    } catch (e) {
      console.error('[main:check-backend-online] exception =', e);
      return { success: false, online: false, error: e.message || '后端连通性检测失败', url: getBackendBaseUrl() };
    }
  });

  ipcMain.handle('get-ip', () => {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    for (const devName in interfaces) {
      const iface = interfaces[devName];
      for (let i = 0; i < iface.length; i++) {
        const alias = iface[i];
        if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
          return alias.address;
        }
      }
    }
    return '127.0.0.1';
  });

  // 加载由 Webpack 生成的 index.html
  win.loadFile(path.join(__dirname, 'dist/index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
