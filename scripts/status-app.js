"use strict";

const {
  appReachable,
  appMetaPath,
  assertRegisteredOwnership,
  assertSafeUserName,
  assertSafeToken,
  parseArgs,
  processAlive,
  readPidRecord,
  readJsonIfExists,
  removePidRecord,
} = require("./common");

async function main() {
  const args = parseArgs(process.argv);
  const userName = args.userName;
  const token = args.token;

  assertSafeUserName(userName);
  assertSafeToken(token);
  assertRegisteredOwnership(userName, token);

  const meta = readJsonIfExists(appMetaPath(userName, token), null);
  const pidRecord = readPidRecord(userName, token);
  const pid = pidRecord && Number.isInteger(pidRecord.pid) ? pidRecord.pid : null;
  const alive = processAlive(pid);
  const portFromPid = pidRecord && Number.isInteger(pidRecord.port) ? pidRecord.port : null;
  const portFromMeta = meta && Number.isInteger(meta.port) ? meta.port : null;
  const port = portFromPid || portFromMeta || null;
  const health = port ? await appReachable(port, userName, token) : { ok: false, statusCode: 0 };
  const orphaned = !alive && health.matched;
  const consistent = alive ? health.matched : !health.matched;
  if (!alive && pidRecord) {
    removePidRecord(userName, token);
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        userName,
        token,
        pid,
        alive,
        trackedPort: portFromPid,
        metaPort: portFromMeta,
        port,
        url: meta ? meta.url : null,
        status: meta ? meta.status : "missing",
        reachable: health.ok,
        matched: health.matched,
        statusCode: health.statusCode,
        orphaned,
        consistent,
      },
      null,
      2
    )}\n`
  );
}

main();
