"use strict";

const fs = require("fs");
const { spawnSync } = require("child_process");
const {
  appReachable,
  appMetaPath,
  assertSafeSessionId,
  assertSafeToken,
  hostUrl,
  isoNow,
  parseArgs,
  processAlive,
  readPidRecord,
  readJsonIfExists,
  removePidRecord,
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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForShutdown(port, sessionId, token, attempts = 20) {
  for (let i = 0; i < attempts; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const reachable = await appReachable(port, sessionId, token);
    if (!reachable.matched) {
      return { ok: false, statusCode: reachable.statusCode || 0, matched: false };
    }
    // eslint-disable-next-line no-await-in-loop
    await wait(250);
  }
  return appReachable(port, sessionId, token);
}

async function main() {
  const args = parseArgs(process.argv);
  const sessionId = args.sessionId;
  const token = args.token;

  assertSafeSessionId(sessionId);
  assertSafeToken(token);

  const pidRecord = readPidRecord(sessionId, token);
  const meta = readJsonIfExists(appMetaPath(sessionId, token), null);
  const pid =
    pidRecord &&
    Number.isInteger(pidRecord.pid)
      ? pidRecord.pid
      : null;
  const port =
    pidRecord && Number.isInteger(pidRecord.port)
      ? pidRecord.port
      : meta && Number.isInteger(meta.port)
        ? meta.port
        : null;

  if (!pidRecord && !meta) {
    process.stdout.write(`${JSON.stringify({ stopped: false, reason: "missing-pid-file" }, null, 2)}\n`);
    return;
  }

  const aliveBefore = processAlive(pid);
  const stopped = aliveBefore ? stopPid(pid) : false;
  removePidRecord(sessionId, token);

  const reachableAfter =
    port && (aliveBefore || stopped)
      ? await waitForShutdown(port, sessionId, token)
      : port
        ? await appReachable(port, sessionId, token)
        : { ok: false, statusCode: 0 };
  if (meta) {
    writeJson(appMetaPath(sessionId, token), {
      ...meta,
      port: port || meta.port || null,
      url: port ? hostUrl(port, token) : meta.url,
      status: reachableAfter.ok ? "unknown" : "stopped",
      updatedAt: isoNow(),
    });
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        stopped,
        pid,
        aliveBefore,
        port,
        reachableAfter: reachableAfter.ok,
        matchedAfter: reachableAfter.matched,
      },
      null,
      2
    )}\n`
  );
}

main();
