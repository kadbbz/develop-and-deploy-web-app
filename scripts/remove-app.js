"use strict";

const fs = require("fs");
const { spawnSync } = require("child_process");
const {
  appMetaPath,
  appRoot,
  assertRegisteredOwnership,
  assertSafeUserName,
  assertSafeToken,
  appsRoot,
  parseArgs,
  readJsonIfExists,
  removePlatformRegistryEntry,
  removeAppRegistryEntry,
} = require("./common");

function runStop(userName, token) {
  return spawnSync(
    process.execPath,
    ["scripts/stop-app.js", "--userName", userName, "--token", token],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    }
  );
}

function main() {
  const args = parseArgs(process.argv);
  const userName = args.userName;
  const token = args.token;

  assertSafeUserName(userName);
  assertSafeToken(token);
  assertRegisteredOwnership(userName, token);

  const meta = readJsonIfExists(appMetaPath(userName, token), null);
  const appDir = appRoot(userName, token);
  const existed = fs.existsSync(appDir);

  runStop(userName, token);
  const appRegistryRemoved = removeAppRegistryEntry(userName, token);
  const platformRegistryRemoved = removePlatformRegistryEntry(userName, token);
  fs.rmSync(appDir, { recursive: true, force: true });

  if (fs.existsSync(appsRoot())) {
    const remaining = fs.readdirSync(appsRoot(), { withFileTypes: true });
    if (remaining.length === 0) {
      fs.rmSync(appsRoot(), { recursive: true, force: true });
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        userName,
        token,
        name: meta ? meta.title : null,
        existed,
        removed: existed || appRegistryRemoved || platformRegistryRemoved.removed,
        appRegistryRemoved,
        platformRegistryRemoved: platformRegistryRemoved.removed,
      },
      null,
      2
    )}\n`
  );
}

main();
