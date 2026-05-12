"use strict";

const { spawnSync } = require("child_process");
const {
  assertSafeSessionId,
  assertSafeToken,
  extractLastJsonObject,
  parseArgs,
  repoRoot,
} = require("./common");

function run(scriptName, args, allowFailure = false) {
  const result = spawnSync(process.execPath, [scriptName, ...args], {
    cwd: repoRoot(),
    encoding: "utf8",
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `Script failed: ${scriptName}`);
  }
  return result.stdout
    ? extractLastJsonObject(result.stdout)
    : { ok: result.status === 0 };
}

function main() {
  const args = parseArgs(process.argv);
  const sessionId = args.sessionId;
  const token = args.token;

  assertSafeSessionId(sessionId);
  assertSafeToken(token);

  const stopped = run(
    "scripts/stop-app.js",
    ["--sessionId", sessionId, "--token", token],
    true
  );
  if (stopped && stopped.reachableAfter) {
    throw new Error(
      `Refusing to restart while the previous instance is still reachable on port ${stopped.port}`
    );
  }
  const deployArgs = ["--sessionId", sessionId, "--token", token];
  if (args.skipBuild) {
    deployArgs.push("--skipBuild");
  }
  const deployed = run("scripts/deploy-app.js", deployArgs);

  process.stdout.write(`${JSON.stringify({ stopped, deployed }, null, 2)}\n`);
}

main();
