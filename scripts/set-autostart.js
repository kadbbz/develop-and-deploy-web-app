"use strict";

const {
  appMetaPath,
  assertSafeSessionId,
  assertSafeToken,
  isoNow,
  parseArgs,
  readJsonIfExists,
  writeJson,
} = require("./common");

function main() {
  const args = parseArgs(process.argv);
  const sessionId = args.sessionId;
  const token = args.token;

  assertSafeSessionId(sessionId);
  assertSafeToken(token);

  const metaPath = appMetaPath(sessionId, token);
  const meta = readJsonIfExists(metaPath, null);
  if (!meta) {
    throw new Error("Missing APP-META.json");
  }

  const autoStart = args.enabled === "false" ? false : true;
  const next = {
    ...meta,
    autoStart,
    updatedAt: isoNow(),
  };
  writeJson(metaPath, next);
  process.stdout.write(`${JSON.stringify(next, null, 2)}\n`);
}

main();
