"use strict";

const fs = require("fs");
const path = require("path");
const net = require("net");
const http = require("http");

const SHARED_PUBLIC_PORT = 33333;
const MIN_PORT = 33334;
const MAX_PORT = 39999;
const TOKEN_LENGTH = 8;
const SHARED_HOST_HEALTH_PATH = "/__shared_host/health";

function assertSafeUserName(userName) {
  if (!userName || !/^[A-Za-z0-9_-]+$/.test(userName)) {
    throw new Error("userName must match /^[A-Za-z0-9_-]+$/");
  }
}

function assertSafeToken(token) {
  if (!token || !/^[A-Z0-9]{8}$/.test(token)) {
    throw new Error("token must match /^[A-Z0-9]{8}$/");
  }
}

function generateToken() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let token = "";
  for (let i = 0; i < TOKEN_LENGTH; i += 1) {
    token += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return token;
}

function repoRoot() {
  return path.resolve(__dirname, "..");
}

function envPath(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dataRoot() {
  const platformDataRoot = envPath("PLATFORM_DATA_ROOT");
  if (platformDataRoot) {
    return path.join(path.resolve(platformDataRoot), ".lite-apps");
  }

  const homeDir = envPath("HOME") || envPath("USERPROFILE");
  if (!homeDir) {
    throw new Error("Cannot resolve home directory. Set PLATFORM_DATA_ROOT, HOME, or USERPROFILE.");
  }
  return path.join(path.resolve(homeDir), ".lite-apps");
}

function appsRoot() {
  return path.join(dataRoot(), "apps");
}

function appRoot(userName, token) {
  assertSafeUserName(userName);
  assertSafeToken(token);
  return path.join(appsRoot(), token);
}

function registryPath() {
  return path.join(dataRoot(), "app-registry.json");
}

function sharedHostRuntimeDir() {
  return path.join(dataRoot(), ".shared-runtime");
}

function sharedHostPidFilePath() {
  return path.join(sharedHostRuntimeDir(), "shared-host.pid");
}

function sharedHostLogFilePath() {
  return path.join(sharedHostRuntimeDir(), "shared-host.log");
}

function appMetaPath(userName, token) {
  return path.join(appRoot(userName, token), "APP-META.json");
}

function appNotesPath(userName, token) {
  return path.join(appRoot(userName, token), "APP-NOTES.md");
}

function runtimeDir(userName, token) {
  return path.join(appRoot(userName, token), ".runtime");
}

function pidFilePath(userName, token) {
  return path.join(runtimeDir(userName, token), "server.pid");
}

function logFilePath(userName, token) {
  return path.join(runtimeDir(userName, token), "server.log");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function readSharedHostPidRecord() {
  const pidFile = sharedHostPidFilePath();
  if (!fs.existsSync(pidFile)) {
    return null;
  }
  const raw = fs.readFileSync(pidFile, "utf8").trim();
  if (!raw) {
    return null;
  }
  const parsed = raw.startsWith("{") ? JSON.parse(raw) : { pid: Number(raw) };
  return parsed && Number.isInteger(parsed.pid) ? parsed : null;
}

function writeSharedHostPidRecord(record) {
  ensureDir(sharedHostRuntimeDir());
  fs.writeFileSync(
    sharedHostPidFilePath(),
    `${JSON.stringify(record, null, 2)}\n`,
    "utf8"
  );
}

function removeSharedHostPidRecord() {
  fs.rmSync(sharedHostPidFilePath(), { force: true });
}

function toPascalCase(value) {
  const parts = String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "";
  }

  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

function deriveAppDescriptors(meta = {}) {
  const explicitKind = toPascalCase(meta.appKind);
  const explicitLabel = toPascalCase(meta.appLabel);
  const inferredKind =
    toPascalCase(meta.title) ||
    toPascalCase(meta.goal) ||
    "WebApp";

  return {
    appKind: explicitKind || inferredKind,
    appLabel: explicitLabel || "WebApp",
  };
}

function listAppMetaRecords() {
  if (!fs.existsSync(appsRoot())) {
    return [];
  }

  const entries = fs.readdirSync(appsRoot(), { withFileTypes: true });
  const metas = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const meta = readJsonIfExists(path.join(appsRoot(), entry.name, "APP-META.json"), null);
    if (!meta || !meta.token || !meta.userName) {
      continue;
    }
    metas.push(meta);
  }

  metas.sort((a, b) => String(a.token).localeCompare(String(b.token)));
  return metas;
}

function resolveInternalPort(meta, pidRecord = null) {
  const pidInternalPort =
    pidRecord && Number.isInteger(pidRecord.internalPort)
      ? pidRecord.internalPort
      : pidRecord &&
          Number.isInteger(pidRecord.port) &&
          pidRecord.port !== SHARED_PUBLIC_PORT
        ? pidRecord.port
        : null;

  const metaInternalPort =
    meta && Number.isInteger(meta.internalPort)
      ? meta.internalPort
      : meta &&
          Number.isInteger(meta.port) &&
          meta.port !== SHARED_PUBLIC_PORT
        ? meta.port
        : null;

  return pidInternalPort || metaInternalPort || null;
}

function normalizeRegistryEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const name = entry.name || entry.title || null;
  const localPath = entry.local_path || entry.path || entry.file_path || null;
  const description = entry.description || entry.goal || null;
  const createdBy = entry.created_by || entry.userName || entry.user_name || null;
  const lastModifiedBy = entry.last_modified_by || createdBy || null;
  const createdAt = entry.created_at || entry.createdAt || null;
  const lastModifiedAt = entry.last_modified_at || entry.updatedAt || entry.modified_at || null;

  return {
    name,
    token: entry.token || name,
    local_path: localPath,
    port: entry.port,
    internal_port: entry.internal_port ?? entry.internalPort ?? null,
    description,
    created_by: createdBy,
    last_modified_by: lastModifiedBy,
    created_at: createdAt,
    last_modified_at: lastModifiedAt,
    is_disabled: entry.is_disabled === true,
  };
}

function normalizeRegistry(registry) {
  const source = registry && typeof registry === "object" ? registry : {};
  const apps = Array.isArray(source.apps) ? source.apps : [];
  return {
    apps: apps
      .map((entry) => normalizeRegistryEntry(entry))
      .filter(Boolean),
  };
}

function readAppRegistry() {
  return normalizeRegistry(readJsonIfExists(registryPath(), { apps: [] }));
}

function writeAppRegistry(registry) {
  writeJson(registryPath(), normalizeRegistry(registry));
}

function readUserIndex(userName) {
  assertSafeUserName(userName);
  const apps = listAppMetaRecords();
  return {
    userName,
    apps: apps.filter((app) => app.userName === userName),
  };
}

function appRegistryRecord(meta) {
  return {
    name: meta.token,
    token: meta.token,
    local_path: meta.path,
    port: meta.port,
    internal_port: meta.internalPort ?? null,
    description: meta.goal,
    created_by: meta.createdBy || meta.userName,
    last_modified_by: meta.lastModifiedBy || meta.userName,
    created_at: meta.createdAt,
    last_modified_at: meta.updatedAt,
    is_disabled: meta.isDisabled === true,
  };
}

function syncAppRegistryEntry(meta) {
  const registry = readAppRegistry();
  const apps = Array.isArray(registry.apps) ? [...registry.apps] : [];
  const record = appRegistryRecord(meta);
  const index = apps.findIndex((item) => item && item.local_path === meta.path);

  if (index === -1) {
    apps.push(record);
  } else {
    apps[index] = record;
  }

  apps.sort((a, b) => {
    return String(a.local_path).localeCompare(String(b.local_path));
  });

  writeAppRegistry({ apps });
  return record;
}

function removeAppRegistryEntry(userName, token) {
  const meta = readJsonIfExists(appMetaPath(userName, token), null);
  const registry = readAppRegistry();
  const apps = Array.isArray(registry.apps) ? registry.apps : [];
  const nextApps = meta
    ? apps.filter((item) => !(item && item.local_path === meta.path))
    : apps.filter((item) => !(item && item.local_path === path.join("apps", token).replaceAll("\\", "/")));
  writeAppRegistry({ apps: nextApps });
  return nextApps.length !== apps.length;
}

function findAppByToken(token) {
  assertSafeToken(token);
  return listAppMetaRecords().find((app) => app && app.token === token) || null;
}

function parseBooleanFlag(value, fallback = false) {
  if (value === true || value === "true") {
    return true;
  }
  if (value === false || value === "false") {
    return false;
  }
  return fallback;
}

function platformRegistryPath() {
  return path.join(dataRoot(), "app-registry.json");
}

function platformRegistryRecord(meta) {
  return appRegistryRecord(meta);
}

function syncPlatformRegistryEntry(meta) {
  const record = platformRegistryRecord(meta);
  syncAppRegistryEntry(record);
  return record;
}

function removePlatformRegistryEntry(userName, token) {
  const removed = removeAppRegistryEntry(userName, token);
  const current = readJsonIfExists(platformRegistryPath(), { apps: [] });
  const apps = Array.isArray(current.apps) ? current.apps : [];
  return {
    removed,
    count: apps.length,
  };
}

function readPidRecord(userName, token) {
  const pidFile = pidFilePath(userName, token);
  if (!fs.existsSync(pidFile)) {
    return null;
  }
  const raw = fs.readFileSync(pidFile, "utf8").trim();
  if (!raw) {
    return null;
  }
  const parsed = raw.startsWith("{") ? JSON.parse(raw) : { pid: Number(raw) };
  const parsedUserName = parsed && parsed.userName;
  if (
    parsed &&
    parsedUserName &&
    parsedUserName !== userName
  ) {
    return null;
  }
  if (
    parsed &&
    parsed.token &&
    parsed.token !== token
  ) {
    return null;
  }
  return {
    ...parsed,
    userName: parsedUserName || null,
  };
}

function writePidRecord(userName, token, record) {
  ensureDir(runtimeDir(userName, token));
  fs.writeFileSync(
    pidFilePath(userName, token),
    `${JSON.stringify(
      {
        ...record,
        userName,
        token,
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

function removePidRecord(userName, token) {
  fs.rmSync(pidFilePath(userName, token), { force: true });
}

function processAlive(pid) {
  if (!Number.isInteger(pid)) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return false;
  }
}

function canListen(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => resolve(false));
    server.listen({ port, host, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function isPortFree(port) {
  const loopbackFree = await canListen(port, "127.0.0.1");
  if (!loopbackFree) {
    return false;
  }
  return canListen(port, "0.0.0.0");
}

async function findFreePort(start = MIN_PORT, end = MAX_PORT) {
  for (let port = start; port <= end; port += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortFree(port)) {
      return port;
    }
  }
  throw new Error(`No free port found in range ${start}-${end}`);
}

function isoNow() {
  return new Date().toISOString();
}

function hostUrl(_port, token) {
  return `http://you-host-name:${SHARED_PUBLIC_PORT}/${token}/`;
}

function localUrl(port, token) {
  return `http://127.0.0.1:${port}/${token}/`;
}

function sharedHostHealthUrl() {
  return `http://127.0.0.1:${SHARED_PUBLIC_PORT}${SHARED_HOST_HEALTH_PATH}`;
}

function request(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          ok: true,
          statusCode: res.statusCode || 0,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    req.on("error", () => resolve({ ok: false, statusCode: 0, body: "" }));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve({ ok: false, statusCode: 0, body: "" });
    });
  });
}

async function appReachable(port, userName, token) {
  if (!Number.isInteger(port)) {
    return { ok: false, statusCode: 0, body: "", matched: false };
  }
  const response = await request(`${localUrl(port, token)}api/health`);
  if (!response.ok || response.statusCode !== 200) {
    return { ...response, matched: false };
  }
  try {
    const data = JSON.parse(response.body || "{}");
    const expectedBasePath = `/${token}`;
    const matched =
      data &&
      data.ok === true &&
      data.token === token &&
      (
        data.basePath === undefined ||
        data.basePath === expectedBasePath
      );
    return { ...response, matched };
  } catch (error) {
    return { ...response, matched: false };
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith("--")) {
      continue;
    }
    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function findRegisteredApp(userName, token) {
  assertSafeUserName(userName);
  assertSafeToken(token);
  const app = listAppMetaRecords().find((item) => item && item.userName === userName && item.token === token);
  return app || null;
}

function assertRegisteredOwnership(userName, token) {
  const app = findRegisteredApp(userName, token);
  if (!app) {
    throw new Error(`App ${token} is not registered under user ${userName}`);
  }
  return app;
}

function extractLastJsonObject(text) {
  const source = String(text || "").trimEnd();
  if (!source) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaping = false;
  let end = -1;

  for (let i = source.length - 1; i >= 0; i -= 1) {
    const char = source[i];

    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      escaping = false;
      continue;
    }

    if (char === "}") {
      if (end === -1) {
        end = i;
      }
      depth += 1;
      continue;
    }

    if (char === "{") {
      depth -= 1;
      if (depth === 0 && end !== -1) {
        return JSON.parse(source.slice(i, end + 1));
      }
    }
  }

  return null;
}

module.exports = {
  SHARED_PUBLIC_PORT,
  SHARED_HOST_HEALTH_PATH,
  MIN_PORT,
  MAX_PORT,
  appMetaPath,
  appNotesPath,
  appRoot,
  appsRoot,
  assertSafeUserName,
  assertRegisteredOwnership,
  assertSafeToken,
  dataRoot,
  deriveAppDescriptors,
  ensureDir,
  extractLastJsonObject,
  findRegisteredApp,
  findAppByToken,
  findFreePort,
  generateToken,
  hostUrl,
  isoNow,
  isPortFree,
  localUrl,
  logFilePath,
  parseArgs,
  parseBooleanFlag,
  platformRegistryPath,
  processAlive,
  pidFilePath,
  listAppMetaRecords,
  readPidRecord,
  readSharedHostPidRecord,
  readUserIndex,
  readJsonIfExists,
  readAppRegistry,
  removeAppRegistryEntry,
  removePlatformRegistryEntry,
  removePidRecord,
  removeSharedHostPidRecord,
  resolveInternalPort,
  request,
  registryPath,
  repoRoot,
  runtimeDir,
  sharedHostHealthUrl,
  sharedHostLogFilePath,
  sharedHostPidFilePath,
  sharedHostRuntimeDir,
  syncAppRegistryEntry,
  syncPlatformRegistryEntry,
  appReachable,
  writeAppRegistry,
  writeSharedHostPidRecord,
  writePidRecord,
  writeJson,
};
