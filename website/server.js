const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const CONFIG_DIR = path.join(ROOT_DIR, 'config');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const RUNTIME_FILE = path.join(DATA_DIR, 'runtime.json');
const HISTORY_FILES = {
  weeks: path.join(DATA_DIR, 'history_weeks.json'),
  months: path.join(DATA_DIR, 'history_months.json'),
  quarters: path.join(DATA_DIR, 'history_quarters.json'),
  years: path.join(DATA_DIR, 'history_years.json')
};
const CONFIG_EXAMPLE_FILE = path.join(CONFIG_DIR, 'project-config.example.json');
const CONFIG_LOCAL_FILE = path.join(CONFIG_DIR, 'project-config.local.json');
const SESSION_COOKIE_NAME = 'board_session';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 12;
const DEFAULT_PORT = Number(process.env.PORT || 3100);
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8'
};
const PROTECTED_PAGES = new Set(['/board.html', '/retrospect.html', '/sprint.html']);
const ADMIN_PAGES = new Set(['/retrospect.html']);

ensureRuntimeFiles();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${DEFAULT_PORT}`}`);
    const pathname = url.pathname === '/' ? '/' : decodeURIComponent(url.pathname);

    if (pathname.startsWith('/api/')) {
      await handleApiRequest(req, res, url);
      return;
    }

    await handleStaticRequest(req, res, pathname);
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : '服务器异常'
    });
  }
});

server.listen(DEFAULT_PORT, () => {
  console.log(`红圈项目看板系统已启动：http://127.0.0.1:${DEFAULT_PORT}`);
});

function ensureRuntimeFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(CONFIG_DIR, { recursive: true });

  if (!fs.existsSync(SESSIONS_FILE)) {
    writeJson(SESSIONS_FILE, { sessions: {} });
  }

  if (!fs.existsSync(RUNTIME_FILE)) {
    writeJson(RUNTIME_FILE, {
      lastRefreshAt: null,
      apiVerification: null
    });
  }
}

async function handleApiRequest(req, res, url) {
  const pathname = url.pathname;

  if (req.method === 'POST' && pathname === '/api/login') {
    const body = await parseRequestBody(req);
    const username = String(body.username || '').trim();
    const password = String(body.password || '');

    if (!username || !password) {
      sendJson(res, 400, { error: '请输入用户名和密码。' });
      return;
    }

    const config = loadConfig();
    const matchedUser = buildUsers(config).find(
      (user) => user.username === username && user.password === password
    );

    if (!matchedUser) {
      sendJson(res, 401, { error: '用户名或密码错误。' });
      return;
    }

    const sessions = loadJson(SESSIONS_FILE, { sessions: {} });
    cleanupExpiredSessions(sessions);

    const sessionId = crypto.randomUUID();
    sessions.sessions[sessionId] = {
      username: matchedUser.username,
      displayName: matchedUser.displayName || matchedUser.username,
      role: matchedUser.role || 'readonly',
      expiresAt: Date.now() + SESSION_DURATION_MS
    };
    writeJson(SESSIONS_FILE, sessions);

    setCookie(res, `${SESSION_COOKIE_NAME}=${sessionId}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_DURATION_MS / 1000}`);
    sendJson(res, 200, {
      user: sanitizeUser(sessions.sessions[sessionId]),
      project: { name: config.project?.name || '红圈项目看板系统' }
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/logout') {
    const cookieSessionId = parseCookies(req)[SESSION_COOKIE_NAME];
    const sessions = loadJson(SESSIONS_FILE, { sessions: {} });

    if (cookieSessionId && sessions.sessions[cookieSessionId]) {
      delete sessions.sessions[cookieSessionId];
      writeJson(SESSIONS_FILE, sessions);
    }

    setCookie(res, `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
    sendJson(res, 200, { success: true });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/session') {
    const session = requireSession(req, res);
    if (!session) {
      return;
    }

    const config = loadConfig();
    const runtime = loadJson(RUNTIME_FILE, { lastRefreshAt: null, apiVerification: null });
    sendJson(res, 200, {
      user: sanitizeUser(session),
      project: {
        name: config.project?.name || '红圈项目看板系统',
        id: config.project?.id || ''
      },
      runtime
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/reports') {
    const session = requireSession(req, res);
    if (!session) {
      return;
    }

    const config = loadConfig();
    const runtime = loadJson(RUNTIME_FILE, { lastRefreshAt: null, apiVerification: null });
    sendJson(res, 200, {
      report: getLatestReport(),
      runtime,
      user: sanitizeUser(session),
      project: {
        name: config.project?.name || '红圈项目看板系统',
        id: config.project?.id || '',
        region: config.project?.region || ''
      }
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/reports/daily') {
    const session = requireSession(req, res);
    if (!session) {
      return;
    }

    const date = url.searchParams.get('date');
    const report = findReportByDate(date);

    if (!report) {
      sendJson(res, 404, { error: '未找到对应日期的日报数据。' });
      return;
    }

    sendJson(res, 200, { report });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/history') {
    const session = requireSession(req, res);
    if (!session) {
      return;
    }

    const period = url.searchParams.get('period') || 'weeks';
    const historyFile = HISTORY_FILES[period];

    if (!historyFile) {
      sendJson(res, 400, { error: '不支持的历史周期。' });
      return;
    }

    const history = loadJson(historyFile, { period, items: [] });
    sendJson(res, 200, { history });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/refresh') {
    const session = requireSession(req, res);
    if (!session) {
      return;
    }

    const config = loadConfig();
    const runtime = await refreshBoardData(config);
    sendJson(res, 200, {
      success: true,
      runtime
    });
    return;
  }

  sendJson(res, 404, { error: '接口不存在。' });
}

async function handleStaticRequest(req, res, pathname) {
  const session = getSession(req);

  if (pathname === '/') {
    redirect(res, session ? '/board.html' : '/login.html');
    return;
  }

  if (pathname === '/login.html' && session) {
    redirect(res, '/board.html');
    return;
  }

  if (PROTECTED_PAGES.has(pathname) && !session) {
    redirect(res, '/login.html');
    return;
  }

  if (ADMIN_PAGES.has(pathname) && session?.role !== 'admin') {
    redirect(res, '/board.html');
    return;
  }

  const safeRelativePath = pathname === '/' ? 'login.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(PUBLIC_DIR, safeRelativePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, '禁止访问');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendText(res, 404, '页面不存在');
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extension] || 'application/octet-stream';
  const fileContent = fs.readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(fileContent);
}

async function refreshBoardData(config) {
  const currentRuntime = loadJson(RUNTIME_FILE, {
    lastRefreshAt: null,
    apiVerification: null
  });
  const refreshedAt = new Date().toISOString();

  try {
    const verification = await verifyHuaweiCredentials(config);
    const nextRuntime = {
      ...currentRuntime,
      lastRefreshAt: refreshedAt,
      apiVerification: {
        checkedAt: refreshedAt,
        ok: true,
        endpoint: config.api?.iamEndpoint || '',
        username: verification.username,
        tokenReceived: verification.tokenReceived,
        projectId: config.project?.id || ''
      }
    };
    writeJson(RUNTIME_FILE, nextRuntime);
    return nextRuntime;
  } catch (error) {
    const nextRuntime = {
      ...currentRuntime,
      lastRefreshAt: refreshedAt,
      apiVerification: {
        checkedAt: refreshedAt,
        ok: false,
        endpoint: config.api?.iamEndpoint || '',
        error: error instanceof Error ? error.message : '认证失败'
      }
    };
    writeJson(RUNTIME_FILE, nextRuntime);
    throw error;
  }
}

async function verifyHuaweiCredentials(config) {
  const username = process.env.HUAWEI_CLOUD_USERNAME || config.credentials?.username || '';
  const password = process.env.HUAWEI_CLOUD_PASSWORD || config.credentials?.password || '';
  const domainName = config.project?.account || '';
  const projectScope = config.project?.region || '';
  const endpoint = String(config.api?.iamEndpoint || '').replace(/\/$/, '');

  if (!username || !password) {
    throw new Error('未找到华为云账号密码，请在 website/config/project-config.local.json 或环境变量中提供。');
  }

  if (!domainName || !projectScope || !endpoint) {
    throw new Error('华为云项目配置不完整，无法进行 IAM 校验。');
  }

  const response = await fetch(`${endpoint}/v3/auth/tokens`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      auth: {
        identity: {
          methods: ['password'],
          password: {
            user: {
              name: username,
              password,
              domain: {
                name: domainName
              }
            }
          }
        },
        scope: {
          project: {
            name: projectScope
          }
        }
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    const detail = text.replace(/\s+/g, ' ').slice(0, 200);
    throw new Error(`IAM 认证失败（${response.status}）：${detail}`);
  }

  const subjectToken = response.headers.get('x-subject-token');
  if (!subjectToken) {
    throw new Error('IAM 认证成功，但返回中缺少 x-subject-token。');
  }

  return {
    username,
    tokenReceived: true
  };
}

function loadConfig() {
  const exampleConfig = loadJson(CONFIG_EXAMPLE_FILE, {});
  const localConfig = loadJson(CONFIG_LOCAL_FILE, {});
  const mergedConfig = deepMerge(exampleConfig, localConfig);

  mergedConfig.project = mergedConfig.project || {};
  mergedConfig.project.name = process.env.BOARD_PROJECT_NAME || mergedConfig.project.name || '红圈项目看板系统';

  mergedConfig.credentials = {
    username: process.env.HUAWEI_CLOUD_USERNAME || mergedConfig.credentials?.username || '',
    password: process.env.HUAWEI_CLOUD_PASSWORD || mergedConfig.credentials?.password || ''
  };

  return mergedConfig;
}

function buildUsers(config) {
  const configuredUsers = Array.isArray(config.boardUsers)
    ? config.boardUsers
        .filter((user) => user && user.username && user.password)
        .map((user) => ({
          username: String(user.username),
          password: String(user.password),
          role: String(user.role || 'readonly'),
          displayName: String(user.displayName || user.username)
        }))
    : [];
  const derivedUsers = config.credentials?.username && config.credentials?.password
    ? [
        {
          username: config.credentials.username,
          password: config.credentials.password,
          role: 'admin',
          displayName: config.credentials.username
        }
      ]
    : [];
  const mergedUsers = [...derivedUsers, ...configuredUsers].filter(
    (user, index, list) => list.findIndex((item) => item.username === user.username) === index
  );

  if (mergedUsers.length > 0) {
    return mergedUsers;
  }

  return [
    {
      username: 'admin',
      password: 'change-me',
      role: 'admin',
      displayName: '管理员'
    }
  ];
}

function requireSession(req, res) {
  const session = getSession(req);

  if (!session) {
    sendJson(res, 401, { error: '登录状态已失效，请重新登录。' });
    return null;
  }

  return session;
}

function getSession(req) {
  const cookies = parseCookies(req);
  const sessionId = cookies[SESSION_COOKIE_NAME];

  if (!sessionId) {
    return null;
  }

  const sessions = loadJson(SESSIONS_FILE, { sessions: {} });
  cleanupExpiredSessions(sessions);

  if (!sessions.sessions[sessionId]) {
    return null;
  }

  return sessions.sessions[sessionId];
}

function cleanupExpiredSessions(sessionStore) {
  const now = Date.now();
  let changed = false;

  Object.entries(sessionStore.sessions || {}).forEach(([key, value]) => {
    if (!value || typeof value.expiresAt !== 'number' || value.expiresAt <= now) {
      delete sessionStore.sessions[key];
      changed = true;
    }
  });

  if (changed) {
    writeJson(SESSIONS_FILE, sessionStore);
  }
}

function getLatestReport() {
  const reportStore = loadJson(REPORTS_FILE, { reports: [] });
  const reports = Array.isArray(reportStore.reports) ? reportStore.reports : [];

  if (reports.length === 0) {
    throw new Error('reports.json 中暂无日报数据。');
  }

  return [...reports].sort((left, right) => right.date.localeCompare(left.date))[0];
}

function findReportByDate(date) {
  const reportStore = loadJson(REPORTS_FILE, { reports: [] });
  const reports = Array.isArray(reportStore.reports) ? reportStore.reports : [];
  return reports.find((item) => item.date === date) || null;
}

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || '';
  return cookieHeader.split(';').reduce((accumulator, item) => {
    const [rawKey, ...rawValue] = item.trim().split('=');
    if (!rawKey) {
      return accumulator;
    }
    accumulator[rawKey] = decodeURIComponent(rawValue.join('='));
    return accumulator;
  }, {});
}

function sanitizeUser(user) {
  return {
    username: user.username,
    displayName: user.displayName || user.username,
    role: user.role || 'readonly'
  };
}

function setCookie(res, value) {
  res.setHeader('Set-Cookie', value);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.end(body);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8'
  });
  res.end(text);
}

function loadJson(filePath, fallbackValue) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallbackValue;
    }

    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallbackValue;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function parseRequestBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(rawBody);
}

function deepMerge(base, patch) {
  if (Array.isArray(base) || Array.isArray(patch)) {
    return patch !== undefined ? patch : base;
  }

  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return patch !== undefined ? patch : base;
  }

  const result = { ...base };
  Object.keys(patch).forEach((key) => {
    result[key] = deepMerge(base[key], patch[key]);
  });
  return result;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
