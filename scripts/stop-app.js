"use strict";

const fs = require("fs");
const { spawnSync } = require("child_process");
const {
  appReachable,
  appMetaPath,
  assertRegisteredOwnership,
  assertSafeUserName,
  assertSafeToken,
  hostUrl,
  isoNow,
  parseArgs,
  processAlive,
  readPidRecord,
  readJsonIfExists,
  removePidRecord,
  syncWorkspaceRegistryEntry,
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

async function waitForShutdown(port, userName, token, attempts = 20) {
  for (let i = 0; i < attempts; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const reachable = await appReachable(port, userName, token);
    if (!reachable.matched) {
      return { ok: false, statusCode: reachable.statusCode || 0, matched: false };
    }
    // eslint-disable-next-line no-await-in-loop
    await wait(250);
  }
  return appReachable(port, userName, token);
}

async function main() {
  const args = parseArgs(process.argv);
  const userName = args.userName;
  const token = args.token;

  assertSafeUserName(userName);
  assertSafeToken(token);
  assertRegisteredOwnership(userName, token);

  const pidRecord = readPidRecord(userName, token);
  const meta = readJsonIfExists(appMetaPath(userName, token), null);
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
  removePidRecord(userName, token);

  const reachableAfter =
    port && (aliveBefore || stopped)
      ? await waitForShutdown(port, userName, token)
      : port
        ? await appReachable(port, userName, token)
        : { ok: false, statusCode: 0 };
  if (meta) {
    const next = {
      ...meta,
      port: port || meta.port || null,
      url: port ? hostUrl(port, token) : meta.url,
      status: reachableAfter.ok ? "unknown" : "stopped",
      updatedAt: isoNow(),
    };
    writeJson(appMetaPath(userName, token), next);
    syncWorkspaceRegistryEntry(next);
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
