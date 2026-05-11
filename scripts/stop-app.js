"use strict";

const fs = require("fs");
const { spawnSync } = require("child_process");
const {
  appMetaPath,
  assertSafeSessionId,
  assertSafeToken,
  parseArgs,
  pidFilePath,
  readJsonIfExists,
  writeJson,
} = require("./common");

function stopPid(pid) {
  if (!Number.isInteger(pid)) {
    return false;
  }

  if (process.platform === "win32") {
    const result = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
    });
    return result.status === 0;
  }

  try {
    process.kill(pid, "SIGTERM");
    return true;
  } catch (error) {
    return false;
  }
}

function main() {
  const args = parseArgs(process.argv);
  const sessionId = args.sessionId;
  const token = args.token;

  assertSafeSessionId(sessionId);
  assertSafeToken(token);

  const pidFile = pidFilePath(sessionId, token);
  if (!fs.existsSync(pidFile)) {
    process.stdout.write(`${JSON.stringify({ stopped: false, reason: "missing-pid-file" }, null, 2)}\n`);
    return;
  }

  const raw = fs.readFileSync(pidFile, "utf8").trim();
  const pidRecord = raw.startsWith("{")
    ? JSON.parse(raw)
    : { pid: Number(raw), sessionId, token };
  const pid =
    pidRecord &&
    pidRecord.sessionId === sessionId &&
    pidRecord.token === token &&
    Number.isInteger(pidRecord.pid)
      ? pidRecord.pid
      : null;
  const stopped = pid !== null ? stopPid(pid) : false;
  fs.rmSync(pidFile, { force: true });

  const metaFile = appMetaPath(sessionId, token);
  const meta = readJsonIfExists(metaFile, null);
  if (meta) {
    writeJson(metaFile, {
      ...meta,
      status: stopped ? "stopped" : "unknown",
      updatedAt: new Date().toISOString(),
    });
  }

  process.stdout.write(`${JSON.stringify({ stopped, pid }, null, 2)}\n`);
}

main();
