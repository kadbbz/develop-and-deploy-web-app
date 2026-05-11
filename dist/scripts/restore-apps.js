"use strict";

const { spawnSync } = require("child_process");
const {
  extractLastJsonObject,
  parseArgs,
  readJsonIfExists,
  registryPath,
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

function flattenApps(registry, onlySessionId) {
  const sessions = Array.isArray(registry.sessions) ? registry.sessions : [];
  const apps = [];
  for (const session of sessions) {
    if (onlySessionId && session.sessionId !== onlySessionId) {
      continue;
    }
    for (const app of Array.isArray(session.apps) ? session.apps : []) {
      apps.push({
        sessionId: session.sessionId,
        token: app.token,
        autoStart: app.autoStart !== false,
      });
    }
  }
  return apps;
}

function main() {
  const args = parseArgs(process.argv);
  const onlySessionId = args.sessionId || null;
  const skipBuild = args.skipBuild ? true : false;
  const registry = readJsonIfExists(registryPath(), { sessions: [] });
  const apps = flattenApps(registry, onlySessionId).filter((app) => app.autoStart);

  const results = [];
  for (const app of apps) {
    const deployArgs = ["--sessionId", app.sessionId, "--token", app.token];
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
