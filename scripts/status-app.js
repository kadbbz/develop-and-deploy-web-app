"use strict";

const fs = require("fs");
const http = require("http");
const {
  appMetaPath,
  assertSafeSessionId,
  assertSafeToken,
  localUrl,
  parseArgs,
  pidFilePath,
  readJsonIfExists,
} = require("./common");

function readPidRecord(pidFile) {
  if (!fs.existsSync(pidFile)) {
    return null;
  }
  const raw = fs.readFileSync(pidFile, "utf8").trim();
  if (!raw) {
    return null;
  }
  return raw.startsWith("{") ? JSON.parse(raw) : { pid: Number(raw) };
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

function request(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve({ ok: true, statusCode: res.statusCode || 0 });
    });
    req.on("error", () => resolve({ ok: false, statusCode: 0 }));
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const sessionId = args.sessionId;
  const token = args.token;

  assertSafeSessionId(sessionId);
  assertSafeToken(token);

  const meta = readJsonIfExists(appMetaPath(sessionId, token), null);
  const pidRecord = readPidRecord(pidFilePath(sessionId, token));
  const pid = pidRecord && Number.isInteger(pidRecord.pid) ? pidRecord.pid : null;
  const alive = processAlive(pid);
  const port = meta && Number.isInteger(meta.port) ? meta.port : null;
  const health =
    alive && port ? await request(localUrl(port, sessionId, token)) : { ok: false, statusCode: 0 };

  process.stdout.write(
    `${JSON.stringify(
      {
        sessionId,
        token,
        pid,
        alive,
        port,
        url: meta ? meta.url : null,
        status: meta ? meta.status : "missing",
        reachable: health.ok,
        statusCode: health.statusCode,
      },
      null,
      2
    )}\n`
  );
}

main();
