"use strict";

const { spawnSync } = require("child_process");
const {
  assertSafeSessionId,
  assertSafeToken,
  extractLastJsonObject,
  parseArgs,
  repoRoot,
} = require("./common");

function runNodeScript(scriptName, args) {
  const result = spawnSync(process.execPath, [scriptName, ...args], {
    cwd: repoRoot(),
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `Script failed: ${scriptName}\n${result.stderr || result.stdout || "Unknown error"}`
    );
  }
  return extractLastJsonObject(result.stdout);
}

function main() {
  const args = parseArgs(process.argv);
  const sessionId = args.sessionId;
  const token = args.token;

  assertSafeSessionId(sessionId);
  assertSafeToken(token);

  if (!args.skipBuild) {
    runNodeScript("scripts/install-app.js", [
      "--sessionId",
      sessionId,
      "--token",
      token,
    ]);
    runNodeScript("scripts/build-app.js", [
      "--sessionId",
      sessionId,
      "--token",
      token,
    ]);
  }

  const started = runNodeScript("scripts/start-app.js", [
    "--sessionId",
    sessionId,
    "--token",
    token,
  ]);

  const synced = runNodeScript("scripts/sync-docs.js", [
    "--sessionId",
    sessionId,
    "--token",
    token,
    "--status",
    started.ready ? "running" : "starting",
    "--port",
    String(started.port),
    "--url",
    started.url,
  ]);

  const registry = runNodeScript("scripts/update-registry.js", [
    "--sessionId",
    sessionId,
    "--token",
    token,
  ]);

  process.stdout.write(
    `${JSON.stringify(
      {
        started,
        synced,
        registry,
        built: !args.skipBuild,
      },
      null,
      2
    )}\n`
  );
}

main();
