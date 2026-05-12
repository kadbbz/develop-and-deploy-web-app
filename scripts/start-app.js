"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const {
  appReachable,
  appMetaPath,
  appRoot,
  assertSafeSessionId,
  assertSafeToken,
  ensureDir,
  findFreePort,
  hostUrl,
  isPortFree,
  localUrl,
  logFilePath,
  parseArgs,
  processAlive,
  readPidRecord,
  readJsonIfExists,
  removePidRecord,
  runtimeDir,
  syncPlatformRegistryEntry,
  writePidRecord,
  writeJson,
} = require("./common");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tokenizeCommand(command) {
  const tokens = [];
  const source = String(command || "").trim();
  let current = "";
  let quote = null;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (current) {
    tokens.push(current);
  }
  return tokens;
}

function resolveStartCommand(serverDir, packageJsonPath) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const startScript =
    packageJson &&
    packageJson.scripts &&
    typeof packageJson.scripts.start === "string"
      ? packageJson.scripts.start.trim()
      : "";

  const tokens = tokenizeCommand(startScript);
  if (tokens[0] === "node" && tokens.length >= 2) {
    return {
      file: process.execPath,
      args: tokens.slice(1),
      cwd: serverDir,
      direct: true,
    };
  }

  if (process.platform === "win32") {
    return {
      file: "cmd.exe",
      args: ["/d", "/s", "/c", "npm run start"],
      cwd: serverDir,
      direct: false,
    };
  }

  return {
    file: "npm",
    args: ["run", "start"],
    cwd: serverDir,
    direct: false,
  };
}

async function waitForReady(port, sessionId, token, attempts = 20) {
  for (let i = 0; i < attempts; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const response = await appReachable(port, sessionId, token);
    if (response.ok && response.matched) {
      return true;
    }
    // eslint-disable-next-line no-await-in-loop
    await wait(500);
  }
  return false;
}

async function main() {
  const args = parseArgs(process.argv);
  const sessionId = args.sessionId;
  const token = args.token;

  assertSafeSessionId(sessionId);
  assertSafeToken(token);

  const metaFile = appMetaPath(sessionId, token);
  const meta = readJsonIfExists(metaFile, null);
  if (!meta) {
    throw new Error(`Missing APP-META.json: ${metaFile}`);
  }

  const appDir = appRoot(sessionId, token);
  const serverDir = path.join(appDir, "server");
  const packageJson = path.join(serverDir, "package.json");
  if (!fs.existsSync(packageJson)) {
    throw new Error(`Expected server package.json at ${packageJson}`);
  }

  ensureDir(runtimeDir(sessionId, token));
  const pidRecord = readPidRecord(sessionId, token);
  const knownPid = pidRecord && Number.isInteger(pidRecord.pid) ? pidRecord.pid : null;
  const knownPortFromPid = pidRecord && Number.isInteger(pidRecord.port) ? pidRecord.port : null;
  const knownPortFromMeta = meta && Number.isInteger(meta.port) ? meta.port : null;
  const preferredPort = knownPortFromPid || knownPortFromMeta || null;

  if (knownPid && processAlive(knownPid) && preferredPort) {
    const health = await appReachable(preferredPort, sessionId, token);
    if (health.ok && health.matched) {
      const next = {
        ...meta,
        port: preferredPort,
        url: hostUrl(preferredPort, token),
        status: "running",
        updatedAt: new Date().toISOString(),
      };
      writeJson(metaFile, next);
      process.stdout.write(
        `${JSON.stringify(
          {
            pid: knownPid,
            port: preferredPort,
            url: next.url,
            readinessUrl: localUrl(preferredPort, token),
            ready: true,
            reused: true,
            logPath: logFilePath(sessionId, token),
          },
          null,
          2
        )}\n`
      );
      return;
    }
    throw new Error(
        `Refusing to start a second instance: tracked pid ${knownPid} is still alive but app health is not clean on port ${preferredPort}`
    );
  }

  if (knownPid && !processAlive(knownPid)) {
    removePidRecord(sessionId, token);
  }

  let port = preferredPort;
  if (port) {
    const reachable = await appReachable(port, sessionId, token);
    if (reachable.ok && reachable.matched) {
      throw new Error(
        `Refusing to start a second instance: app is already reachable on port ${port} but no live tracked pid can be safely reused`
      );
    }
    const portFree = await isPortFree(port);
    if (!portFree) {
      throw new Error(`Expected to reuse port ${port}, but it is occupied`);
    }
  } else {
    port = await findFreePort();
  }
  const basePath = `/${token}`;
  const url = hostUrl(port, token);
  const readinessUrl = localUrl(port, token);

  const logPath = logFilePath(sessionId, token);
  const logFd = fs.openSync(logPath, "a");
  const command = resolveStartCommand(serverDir, packageJson);
  const child = spawn(
    command.file,
    command.args,
    {
      cwd: command.cwd,
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: {
        ...process.env,
        PORT: String(port),
        SESSION_ID: sessionId,
        APP_TOKEN: token,
        BASE_PATH: basePath,
      },
    }
  );

  child.unref();
  fs.closeSync(logFd);
  writePidRecord(sessionId, token, {
    pid: child.pid,
    port,
    startedAt: new Date().toISOString(),
  });

  const ready = await waitForReady(port, sessionId, token);
  const next = {
    ...meta,
    port,
    url,
    status: ready ? "running" : "starting",
    updatedAt: new Date().toISOString(),
  };
  writeJson(metaFile, next);
  syncPlatformRegistryEntry(next);

  process.stdout.write(
    `${JSON.stringify({ pid: child.pid, port, url, readinessUrl, ready, reused: false, logPath }, null, 2)}\n`
  );
}

main();
