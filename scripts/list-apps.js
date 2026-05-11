"use strict";

const { parseArgs, readJsonIfExists, registryPath, sessionIndexPath } = require("./common");

function main() {
  const args = parseArgs(process.argv);
  if (args.sessionId) {
    const sessionIndex = readJsonIfExists(sessionIndexPath(args.sessionId), {
      sessionId: args.sessionId,
      apps: [],
    });
    process.stdout.write(`${JSON.stringify(sessionIndex, null, 2)}\n`);
    return;
  }
  const registry = readJsonIfExists(registryPath(), { sessions: [] });
  process.stdout.write(`${JSON.stringify(registry, null, 2)}\n`);
}

main();
