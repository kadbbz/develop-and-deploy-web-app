"use strict";

const {
  appReachable,
  appMetaPath,
  assertSafeSessionId,
  assertSafeToken,
  parseArgs,
  processAlive,
  readPidRecord,
  readJsonIfExists,
  removePidRecord,
} = require("./common");

async function main() {
  const args = parseArgs(process.argv);
  const sessionId = args.sessionId;
  const token = args.token;

  assertSafeSessionId(sessionId);
  assertSafeToken(token);

  const meta = readJsonIfExists(appMetaPath(sessionId, token), null);
  const pidRecord = readPidRecord(sessionId, token);
  const pid = pidRecord && Number.isInteger(pidRecord.pid) ? pidRecord.pid : null;
  const alive = processAlive(pid);
  const portFromPid = pidRecord && Number.isInteger(pidRecord.port) ? pidRecord.port : null;
  const portFromMeta = meta && Number.isInteger(meta.port) ? meta.port : null;
  const port = portFromPid || portFromMeta || null;
  const health = port ? await appReachable(port, sessionId, token) : { ok: false, statusCode: 0 };
  const orphaned = !alive && health.matched;
  const consistent = alive ? health.matched : !health.matched;
  if (!alive && pidRecord) {
    removePidRecord(sessionId, token);
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        sessionId,
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
