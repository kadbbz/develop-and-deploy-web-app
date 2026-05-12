"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const http = require("http");
const path = require("path");

const {
  cleanupSession,
  common,
  randomUserName,
  randomToken,
  runScript,
  writeFakeRunnableApp,
} = require("../helpers/script-test-utils");

test("init-app and scaffold-app create a workspace scaffold", async (t) => {
  const userName = randomUserName("FULLINIT");
  const token = randomToken();

  t.after(async () => {
    await cleanupSession(userName, token);
  });

  const initResult = runScript("init-app.js", {
    userName,
    token,
    title: "Task Tracker",
    goal: "Verify init and scaffold flows.",
    design: "Keep the layout minimal.",
  }).json;

  assert.equal(initResult.userName, userName);
  assert.equal(initResult.token, token);
  assert.equal(initResult.meta.status, "initialized");
  assert.equal(initResult.meta.appKind, "TaskTracker");
  assert.equal(initResult.meta.appLabel, "WebApp");
  assert.equal(initResult.meta.title, "Task Tracker");

  const appDir = common.appRoot(userName, token);
  const notes = fs.readFileSync(common.appNotesPath(userName, token), "utf8");  assert.match(notes, /Task Tracker/);
  assert.match(notes, /Verify init and scaffold flows\./);

  const scaffoldResult = runScript("scaffold-app.js", { userName, token }).json;
  assert.equal(scaffoldResult.scaffolded, true);

  assert.ok(fs.existsSync(path.join(appDir, "README.md")));
  assert.ok(fs.existsSync(path.join(appDir, "client", "src", "App.tsx")));
  assert.ok(fs.existsSync(path.join(appDir, "server", "src", "index.ts")));
});

test("set-autostart, sync-docs, update-registry, and list-apps stay in sync", async (t) => {
  const userName = randomUserName("FULLMETA");
  const token = randomToken();

  t.after(async () => {
    await cleanupSession(userName, token);
  });

  runScript("init-app.js", {
    userName,
    token,
    title: "Registry Test App",
    goal: "Verify registry synchronization.",
  });

  const autoStartResult = runScript("set-autostart.js", {
    userName,
    token,
    enabled: "false",
  }).json;
  assert.equal(autoStartResult.autoStart, false);

  const synced = runScript("sync-docs.js", {
    userName,
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

  const notes = fs.readFileSync(common.appNotesPath(userName, token), "utf8");
  assert.match(notes, /Updated registry goal/);
  assert.match(notes, /Updated design summary/);
  assert.match(notes, /Auto Start[\s\S]*Disabled/);
  assert.match(notes, /http:\/\/host:34567\/test\//);

  const registryResult = runScript("update-registry.js", { userName, token }).json;
  assert.equal(registryResult.userName, userName);

  const listResult = runScript("list-apps.js", { userName }).json;
  assert.equal(listResult.userName, userName);
  assert.equal(listResult.apps.length, 1);
  assert.equal(listResult.apps[0].token, token);
  assert.equal(listResult.apps[0].autoStart, false);
});

test("install, build, deploy, restart, stop, status, and restore work for a runnable app", async (t) => {
  const userName = randomUserName("FULLRUN");
  const token = randomToken();
  const ports = [];

  t.after(async () => {
    await cleanupSession(userName, token, ports);
  });

  runScript("init-app.js", {
    userName,
    token,
    title: "Runnable Test App",
    goal: "Exercise lifecycle scripts.",
  });
  writeFakeRunnableApp(userName, token);

  const installResult = runScript(
    "install-app.js",
    { userName, token },
    { timeoutMs: 120000 }
  ).json;
  assert.equal(installResult.installed, true);

  const buildResult = runScript(
    "build-app.js",
    { userName, token },
    { timeoutMs: 120000 }
  ).json;
  assert.equal(buildResult.built, true);

  const started = runScript(
    "start-app.js",
    { userName, token },
    { timeoutMs: 30000 }
  ).json;
  ports.push(started.port);
  assert.equal(started.ready, true);
  assert.ok(Number.isInteger(started.pid));

  let status = runScript("status-app.js", { userName, token }).json;
  assert.equal(status.alive, true);
  assert.equal(status.reachable, true);
  assert.equal(status.statusCode, 200);

  const stopped = runScript("stop-app.js", { userName, token }).json;
  assert.equal(stopped.stopped, true);

  status = runScript("status-app.js", { userName, token }).json;
  assert.equal(status.alive, false);
  assert.equal(status.reachable, false);

  const deployed = runScript(
    "deploy-app.js",
    { userName, token },
    { timeoutMs: 120000 }
  ).json;
  ports.push(deployed.started.port);
  assert.equal(deployed.built, true);
  assert.equal(deployed.started.ready, true);
  assert.equal(deployed.registry.userName, userName);

  const restarted = runScript(
    "restart-app.js",
    { userName, token },
    { timeoutMs: 120000 }
  ).json;
  ports.push(restarted.deployed.started.port);
  assert.equal(restarted.deployed.started.ready, true);

  const stoppedAgain = runScript("stop-app.js", { userName, token }).json;
  assert.equal(stoppedAgain.stopped, true);

  const restored = runScript(
    "restore-apps.js",
    { userName },
    { timeoutMs: 120000 }
  ).json;
  assert.equal(restored.attempted, 1);
  assert.equal(restored.restored, 1);
  assert.equal(restored.results[0].ok, true);
  ports.push(restored.results[0].data.started.port);

  status = runScript("status-app.js", { userName, token }).json;
  assert.equal(status.alive, true);
  assert.equal(status.reachable, true);
});

test("start-app reuses the tracked instance instead of spawning a second one", async (t) => {
  const userName = randomUserName("FULLSINGLE");
  const token = randomToken();
  const ports = [];

  t.after(async () => {
    await cleanupSession(userName, token, ports);
  });

  runScript("init-app.js", {
    userName,
    token,
    title: "Single Instance App",
    goal: "Verify repeated start calls do not create duplicates.",
  });
  writeFakeRunnableApp(userName, token);

  const first = runScript("start-app.js", { userName, token }).json;
  ports.push(first.port);
  assert.equal(first.ready, true);
  assert.equal(first.reused, false);

  const second = runScript("start-app.js", { userName, token }).json;
  assert.equal(second.ready, true);
  assert.equal(second.reused, true);
  assert.equal(second.port, first.port);
  assert.equal(second.pid, first.pid);
});

test("start-app fails instead of drifting to a new port when the recorded port is occupied", async (t) => {
  const userName = randomUserName("FULLPORT");
  const token = randomToken();
  const blocker = http.createServer((_req, res) => {
    res.statusCode = 404;
    res.end("occupied");
  });

  t.after(async () => {
    blocker.close();
    await cleanupSession(userName, token);
  });

  runScript("init-app.js", {
    userName,
    token,
    title: "Port Reuse App",
    goal: "Verify port conflicts fail closed.",
  });
  writeFakeRunnableApp(userName, token);

  const metaPath = common.appMetaPath(userName, token);
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
    runScript("start-app.js", { userName, token });
  } catch (currentError) {
    error = currentError;
  }

  assert.ok(error);
  assert.match(String(error.message), /Expected to reuse port 35555, but it is occupied/);
});

test("registered ownership is enforced for app operations", async (t) => {
  const ownerName = randomUserName("FULLOWNER");
  const otherUserName = randomUserName("FULLOTHER");
  const token = randomToken();

  t.after(async () => {
    await cleanupSession(ownerName, token);
    await cleanupSession(otherUserName, token);
  });

  runScript("init-app.js", {
    userName: ownerName,
    token,
    goal: "Verify ownership enforcement.",
  });

  let error = null;
  try {
    runScript("status-app.js", { userName: otherUserName, token });
  } catch (currentError) {
    error = currentError;
  }

  assert.ok(error);
  assert.match(String(error.message), /not registered under user/);
});
