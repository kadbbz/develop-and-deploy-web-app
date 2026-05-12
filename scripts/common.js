"use strict";

const fs = require("fs");
const path = require("path");
const net = require("net");
const http = require("http");

const MIN_PORT = 33333;
const MAX_PORT = 39999;
const TOKEN_LENGTH = 8;

function assertSafeSessionId(sessionId) {
  if (!sessionId || !/^[A-Za-z0-9_-]+$/.test(sessionId)) {
    throw new Error("sessionId must match /^[A-Za-z0-9_-]+$/");
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

function webAppsRoot() {
  return path.join(repoRoot(), "workspaces", "web-apps");
}

function sessionRoot(sessionId) {
  assertSafeSessionId(sessionId);
  return path.join(webAppsRoot(), sessionId);
}

function appRoot(sessionId, token) {
  assertSafeSessionId(sessionId);
  assertSafeToken(token);
  return path.join(sessionRoot(sessionId), token);
}

function findAppByToken(token) {
  assertSafeToken(token);
  const root = webAppsRoot();
  if (!fs.existsSync(root)) {
    return null;
  }

  const sessions = fs.readdirSync(root, { withFileTypes: true });
  for (const sessionEntry of sessions) {
    if (!sessionEntry.isDirectory() || sessionEntry.name === "sessions") {
      continue;
    }
    const candidate = path.join(root, sessionEntry.name, token);
    if (fs.existsSync(candidate)) {
      return {
        sessionId: sessionEntry.name,
        token,
        appDir: candidate,
      };
    }
  }
  return null;
}

function registryRoot() {
  return path.join(webAppsRoot(), "sessions");
}

function registryPath() {
  return path.join(webAppsRoot(), "registry.json");
}

function platformDataDir() {
  return path.resolve(path.sep, "var", "platform_data");
}

function platformRegistryPath() {
  return path.join(platformDataDir(), "web-app-registry.json");
}

function sessionIndexPath(sessionId) {
  assertSafeSessionId(sessionId);
  return path.join(registryRoot(), `${sessionId}.json`);
}

function appMetaPath(sessionId, token) {
  return path.join(appRoot(sessionId, token), "APP-META.json");
}

function appNotesPath(sessionId, token) {
  return path.join(appRoot(sessionId, token), "APP-NOTES.md");
}

function runtimeDir(sessionId, token) {
  return path.join(appRoot(sessionId, token), ".runtime");
}

function pidFilePath(sessionId, token) {
  return path.join(runtimeDir(sessionId, token), "server.pid");
}

function logFilePath(sessionId, token) {
  return path.join(runtimeDir(sessionId, token), "server.log");
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

function platformRegistryRecord(meta) {
  return {
    name: meta.title,
    token: meta.token,
    file_path: meta.path,
    port: meta.port,
    created_at: meta.createdAt,
    modified_at: meta.updatedAt,
    session: meta.sessionId,
  };
}

function syncPlatformRegistryEntry(meta) {
  const current = readJsonIfExists(platformRegistryPath(), { apps: [] });
  const apps = Array.isArray(current.apps) ? [...current.apps] : [];
  const record = platformRegistryRecord(meta);
  const index = apps.findIndex((item) => item && item.token === meta.token);

  if (index === -1) {
    apps.push(record);
  } else {
    apps[index] = record;
  }

  apps.sort((a, b) => {
    const sessionCompare = String(a.session).localeCompare(String(b.session));
    if (sessionCompare !== 0) {
      return sessionCompare;
    }
    return String(a.file_path).localeCompare(String(b.file_path));
  });

  writeJson(platformRegistryPath(), { apps });
  return record;
}

function removePlatformRegistryEntry(sessionId, token) {
  const current = readJsonIfExists(platformRegistryPath(), { apps: [] });
  const apps = Array.isArray(current.apps) ? current.apps : [];
  const nextApps = apps.filter((item) => !(item && item.token === token));
  writeJson(platformRegistryPath(), { apps: nextApps });
  return {
    removed: nextApps.length !== apps.length,
    count: nextApps.length,
  };
}

function readPidRecord(sessionId, token) {
  const pidFile = pidFilePath(sessionId, token);
  if (!fs.existsSync(pidFile)) {
    return null;
  }
  const raw = fs.readFileSync(pidFile, "utf8").trim();
  if (!raw) {
    return null;
  }
  const parsed = raw.startsWith("{") ? JSON.parse(raw) : { pid: Number(raw) };
  if (
    parsed &&
    parsed.sessionId &&
    parsed.sessionId !== sessionId
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
  return parsed;
}

function writePidRecord(sessionId, token, record) {
  ensureDir(runtimeDir(sessionId, token));
  fs.writeFileSync(
    pidFilePath(sessionId, token),
    `${JSON.stringify(
      {
        ...record,
        sessionId,
        token,
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

function removePidRecord(sessionId, token) {
  fs.rmSync(pidFilePath(sessionId, token), { force: true });
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

function hostUrl(port, token) {
  return `http://host:${port}/${token}/`;
}

function localUrl(port, token) {
  return `http://127.0.0.1:${port}/${token}/`;
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

async function appReachable(port, sessionId, token) {
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
  MIN_PORT,
  MAX_PORT,
  appMetaPath,
  appNotesPath,
  appRoot,
  assertSafeSessionId,
  assertSafeToken,
  ensureDir,
  extractLastJsonObject,
  findAppByToken,
  findFreePort,
  generateToken,
  hostUrl,
  isoNow,
  isPortFree,
  localUrl,
  logFilePath,
  parseArgs,
  platformDataDir,
  platformRegistryPath,
  processAlive,
  pidFilePath,
  readPidRecord,
  readJsonIfExists,
  removePlatformRegistryEntry,
  removePidRecord,
  request,
  registryPath,
  registryRoot,
  repoRoot,
  runtimeDir,
  sessionIndexPath,
  sessionRoot,
  syncPlatformRegistryEntry,
  appReachable,
  webAppsRoot,
  writePidRecord,
  writeJson,
};
