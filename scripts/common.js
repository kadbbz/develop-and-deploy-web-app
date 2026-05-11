"use strict";

const fs = require("fs");
const path = require("path");
const net = require("net");

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

function registryRoot() {
  return path.join(webAppsRoot(), "sessions");
}

function registryPath() {
  return path.join(webAppsRoot(), "registry.json");
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

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => resolve(false));
    server.listen({ port, host: "0.0.0.0" }, () => {
      server.close(() => resolve(true));
    });
  });
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

function hostUrl(port, sessionId, token) {
  return `http://host:${port}/${sessionId}/${token}/`;
}

function localUrl(port, sessionId, token) {
  return `http://127.0.0.1:${port}/${sessionId}/${token}/`;
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
  findFreePort,
  generateToken,
  hostUrl,
  isoNow,
  localUrl,
  logFilePath,
  parseArgs,
  pidFilePath,
  readJsonIfExists,
  registryPath,
  registryRoot,
  repoRoot,
  runtimeDir,
  sessionIndexPath,
  sessionRoot,
  webAppsRoot,
  writeJson,
};
