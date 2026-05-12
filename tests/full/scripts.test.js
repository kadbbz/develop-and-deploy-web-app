"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const http = require("http");
const path = require("path");

const {
  cleanupSession,
  common,
  randomSessionId,
  randomToken,
  runScript,
  writeFakeRunnableApp,
} = require("../helpers/script-test-utils");

test("init-app and scaffold-app create a workspace scaffold", async (t) => {
  const sessionId = randomSessionId("FULLINIT");
  const token = randomToken();

  t.after(async () => {
    await cleanupSession(sessionId, token);
  });

  const initResult = runScript("init-app.js", {
    sessionId,
    token,
    title: "Docs Test App",
    goal: "Verify init and scaffold flows.",
    design: "Keep the layout minimal.",
  }).json;

  assert.equal(initResult.sessionId, sessionId);
  assert.equal(initResult.token, token);
  assert.equal(initResult.meta.status, "initialized");

  const appDir = common.appRoot(sessionId, token);
  const notes = fs.readFileSync(common.appNotesPath(sessionId, token), "utf8");
  assert.match(notes, /Docs Test App/);
  assert.match(notes, /Verify init and scaffold flows\./);

  const scaffoldResult = runScript("scaffold-app.js", { sessionId, token }).json;
  assert.equal(scaffoldResult.scaffolded, true);

  assert.ok(fs.existsSync(path.join(appDir, "README.md")));
  assert.ok(fs.existsSync(path.join(appDir, "client", "src", "App.tsx")));
  assert.ok(fs.existsSync(path.join(appDir, "server", "src", "index.ts")));
});

test("set-autostart, sync-docs, update-registry, and list-apps stay in sync", async (t) => {
  const sessionId = randomSessionId("FULLMETA");
  const token = randomToken();

  t.after(async () => {
    await cleanupSession(sessionId, token);
  });

  runScript("init-app.js", {
    sessionId,
    token,
    title: "Registry Test App",
    goal: "Verify registry synchronization.",
  });

  const autoStartResult = runScript("set-autostart.js", {
    sessionId,
    token,
    enabled: "false",
  }).json;
  assert.equal(autoStartResult.autoStart, false);

  const synced = runScript("sync-docs.js", {
    sessionId,
    token,
    status: "running",
    port: "34567",
    url: "http://host:34567/test/",
    goal: "Updated registry goal",
    design: "Updated design summary",
  }).json;

  assert.equal(synced.status, "running");
  assert.equal(synced.port, 34567);
  assert.equal(synced.url, "http://host:34567/test/");
  assert.equal(synced.goal, "Updated registry goal");

  const notes = fs.readFileSync(common.appNotesPath(sessionId, token), "utf8");
  assert.match(notes, /Updated registry goal/);
  assert.match(notes, /Updated design summary/);
  assert.match(notes, /Auto Start[\s\S]*Disabled/);
  assert.match(notes, /http:\/\/host:34567\/test\//);

  const registryResult = runScript("update-registry.js", { sessionId, token }).json;
  assert.equal(registryResult.sessionId, sessionId);

  const listResult = runScript("list-apps.js", { sessionId }).json;
  assert.equal(listResult.sessionId, sessionId);
  assert.equal(listResult.apps.length, 1);
  assert.equal(listResult.apps[0].token, token);
  assert.equal(listResult.apps[0].autoStart, false);
});

test("install, build, deploy, restart, stop, status, and restore work for a runnable app", async (t) => {
  const sessionId = randomSessionId("FULLRUN");
  const token = randomToken();
  const ports = [];

  t.after(async () => {
    await cleanupSession(sessionId, token, ports);
  });

  runScript("init-app.js", {
    sessionId,
    token,
    title: "Runnable Test App",
    goal: "Exercise lifecycle scripts.",
  });
  writeFakeRunnableApp(sessionId, token);

  const installResult = runScript(
    "install-app.js",
    { sessionId, token },
    { timeoutMs: 120000 }
  ).json;
  assert.equal(installResult.installed, true);

  const buildResult = runScript(
    "build-app.js",
    { sessionId, token },
    { timeoutMs: 120000 }
  ).json;
  assert.equal(buildResult.built, true);

  const started = runScript(
    "start-app.js",
    { sessionId, token },
    { timeoutMs: 30000 }
  ).json;
  ports.push(started.port);
  assert.equal(started.ready, true);
  assert.ok(Number.isInteger(started.pid));

  let status = runScript("status-app.js", { sessionId, token }).json;
  assert.equal(status.alive, true);
  assert.equal(status.reachable, true);
  assert.equal(status.statusCode, 200);

  const stopped = runScript("stop-app.js", { sessionId, token }).json;
  assert.equal(stopped.stopped, true);

  status = runScript("status-app.js", { sessionId, token }).json;
  assert.equal(status.alive, false);
  assert.equal(status.reachable, false);

  const deployed = runScript(
    "deploy-app.js",
    { sessionId, token },
    { timeoutMs: 120000 }
  ).json;
  ports.push(deployed.started.port);
  assert.equal(deployed.built, true);
  assert.equal(deployed.started.ready, true);
  assert.equal(deployed.registry.sessionId, sessionId);

  const restarted = runScript(
    "restart-app.js",
    { sessionId, token },
    { timeoutMs: 120000 }
  ).json;
  ports.push(restarted.deployed.started.port);
  assert.equal(restarted.deployed.started.ready, true);

  const stoppedAgain = runScript("stop-app.js", { sessionId, token }).json;
  assert.equal(stoppedAgain.stopped, true);

  const restored = runScript(
    "restore-apps.js",
    { sessionId },
    { timeoutMs: 120000 }
  ).json;
  assert.equal(restored.attempted, 1);
  assert.equal(restored.restored, 1);
  assert.equal(restored.results[0].ok, true);
  ports.push(restored.results[0].data.started.port);

  status = runScript("status-app.js", { sessionId, token }).json;
  assert.equal(status.alive, true);
  assert.equal(status.reachable, true);
});

test("start-app reuses the tracked instance instead of spawning a second one", async (t) => {
  const sessionId = randomSessionId("FULLSINGLE");
  const token = randomToken();
  const ports = [];

  t.after(async () => {
    await cleanupSession(sessionId, token, ports);
  });

  runScript("init-app.js", {
    sessionId,
    token,
    title: "Single Instance App",
    goal: "Verify repeated start calls do not create duplicates.",
  });
  writeFakeRunnableApp(sessionId, token);

  const first = runScript("start-app.js", { sessionId, token }).json;
  ports.push(first.port);
  assert.equal(first.ready, true);
  assert.equal(first.reused, false);

  const second = runScript("start-app.js", { sessionId, token }).json;
  assert.equal(second.ready, true);
  assert.equal(second.reused, true);
  assert.equal(second.port, first.port);
  assert.equal(second.pid, first.pid);
});

test("start-app fails instead of drifting to a new port when the recorded port is occupied", async (t) => {
  const sessionId = randomSessionId("FULLPORT");
  const token = randomToken();
  const blocker = http.createServer((_req, res) => {
    res.statusCode = 404;
    res.end("occupied");
  });

  t.after(async () => {
    blocker.close();
    await cleanupSession(sessionId, token);
  });

  runScript("init-app.js", {
    sessionId,
    token,
    title: "Port Reuse App",
    goal: "Verify port conflicts fail closed.",
  });
  writeFakeRunnableApp(sessionId, token);

  const metaPath = common.appMetaPath(sessionId, token);
  const meta = common.readJsonIfExists(metaPath, null);
  const blockedPort = 35555;
  await new Promise((resolve) => blocker.listen(blockedPort, "127.0.0.1", resolve));
  common.writeJson(metaPath, {
    ...meta,
    port: blockedPort,
    url: common.hostUrl(blockedPort, token),
  });

  let error = null;
  try {
    runScript("start-app.js", { sessionId, token });
  } catch (currentError) {
    error = currentError;
  }

  assert.ok(error);
  assert.match(String(error.message), /Expected to reuse port 35555, but it is occupied/);
});
