"use strict";

const { spawnSync } = require("child_process");
const {
  extractLastJsonObject,
  listAppMetaRecords,
  parseArgs,
  repoRoot,
} = require("./common");

function runNodeScript(scriptName, args) {
  const result = spawnSync(process.execPath, [scriptName, ...args], {
    cwd: repoRoot(),
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return {
      ok: false,
      scriptName,
      error: result.stderr || result.stdout || "Unknown error",
    };
  }
  return {
    ok: true,
    scriptName,
    data: extractLastJsonObject(result.stdout),
  };
}

function flattenApps(onlyUserName) {
  return listAppMetaRecords()
    .filter((app) => !onlyUserName || app.userName === onlyUserName)
    .filter((app) => app.autoStart !== false)
    .map((app) => ({
      userName: app.userName,
      token: app.token,
    }));
}

function main() {
  const args = parseArgs(process.argv);
  const onlyUserName = args.userName || null;
  const skipBuild = args.skipBuild ? true : false;
  const apps = flattenApps(onlyUserName);

  const results = [];
  for (const app of apps) {
    const deployArgs = ["--userName", app.userName, "--token", app.token];
    if (skipBuild) {
      deployArgs.push("--skipBuild");
    }
    results.push(
      runNodeScript("scripts/deploy-app.js", deployArgs)
    );
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        restored: results.filter((item) => item.ok).length,
        attempted: apps.length,
        results,
      },
      null,
      2
    )}\n`
  );
}

main();
