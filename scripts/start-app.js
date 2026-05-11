"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const {
  appMetaPath,
  appRoot,
  assertSafeSessionId,
  assertSafeToken,
  ensureDir,
  findFreePort,
  hostUrl,
  localUrl,
  logFilePath,
  parseArgs,
  pidFilePath,
  readJsonIfExists,
  runtimeDir,
  writeJson,
} = require("./common");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function request(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    req.on("error", reject);
  });
}

async function waitForReady(url, attempts = 20) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await request(url);
      if (response.statusCode && response.statusCode < 500) {
        return true;
      }
    } catch (error) {
      // ignore until timeout
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
  const port = await findFreePort();
  const basePath = `/${sessionId}/${token}`;
  const url = hostUrl(port, sessionId, token);
  const readinessUrl = localUrl(port, sessionId, token);

  const logPath = logFilePath(sessionId, token);
  const logFd = fs.openSync(logPath, "a");
  const command =
    process.platform === "win32"
      ? {
          file: "cmd.exe",
          args: ["/d", "/s", "/c", "npm run start"],
        }
      : {
          file: "npm",
          args: ["run", "start"],
        };
  const child = spawn(
    command.file,
    command.args,
    {
      cwd: serverDir,
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
  fs.writeFileSync(
    pidFilePath(sessionId, token),
    `${JSON.stringify(
      {
        pid: child.pid,
        port,
        sessionId,
        token,
        startedAt: new Date().toISOString(),
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const ready = await waitForReady(readinessUrl);
  const next = {
    ...meta,
    port,
    url,
    status: ready ? "running" : "starting",
    updatedAt: new Date().toISOString(),
  };
  writeJson(metaFile, next);

  process.stdout.write(
    `${JSON.stringify({ pid: child.pid, port, url, readinessUrl, ready, logPath }, null, 2)}\n`
  );
}

main();
