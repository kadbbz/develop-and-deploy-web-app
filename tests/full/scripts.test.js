"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const http = require("http");
const path = require("path");

const {
  cleanupSession,
  cleanupSharedHost,
  common,
  randomUserName,
  randomToken,
  runScript,
  writeFakeRunnableApp,
} = require("../helpers/script-test-utils");

test("init-app and scaffold-app create an app scaffold", async (t) => {
  t.after(() => {
    cleanupSharedHost();
  });
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
  const customizeDir = common.customizeRoot();
  fs.mkdirSync(customizeDir, { recursive: true });
  fs.copyFileSync(
    path.join(common.repoRoot(), "customize", "login-service.js"),
    path.join(customizeDir, "login-service.js")
  );
  fs.copyFileSync(
    path.join(common.repoRoot(), "customize", "master-data-service.js"),
    path.join(customizeDir, "master-data-service.js")
  );
  fs.copyFileSync(
    path.join(common.repoRoot(), "customize", "available-master-data-services.md"),
    path.join(customizeDir, "available-master-data-services.md")
  );
  fs.copyFileSync(
    path.join(common.repoRoot(), "customize", "style-intro.md"),
    path.join(customizeDir, "style-intro.md")
  );

  const notes = fs.readFileSync(common.appNotesPath(userName, token), "utf8");
  assert.match(notes, /Task Tracker/);
  assert.match(notes, /Verify init and scaffold flows\./);

  const scaffoldResult = runScript("scaffold-app.js", { userName, token }).json;
  assert.equal(scaffoldResult.scaffolded, true);

  assert.ok(fs.existsSync(path.join(appDir, "README.md")));
  assert.ok(fs.existsSync(path.join(appDir, "client", "src", "App.tsx")));
  assert.ok(fs.existsSync(path.join(appDir, "server", "src", "index.ts")));
  assert.ok(fs.existsSync(path.join(appDir, "server", "customize", "login-service.js")));
  assert.ok(fs.existsSync(path.join(appDir, "server", "customize", "master-data-service.js")));
  assert.ok(fs.existsSync(path.join(appDir, "client", "public", "customize", "login-aspect.js")));
  assert.ok(fs.existsSync(path.join(appDir, "client", "public", "customize", "master-data-aspect.js")));
  assert.ok(fs.existsSync(path.join(appDir, "available-master-data-services.md")));
  assert.ok(fs.existsSync(path.join(appDir, "style-intro.md")));

  const indexHtml = fs.readFileSync(path.join(appDir, "client", "index.html"), "utf8");
  assert.match(indexHtml, /customize\/login-aspect\.js/);
  assert.match(indexHtml, /customize\/master-data-aspect\.js/);

  const appReadme = fs.readFileSync(path.join(appDir, "README.md"), "utf8");
  assert.match(appReadme, /templates\/simple-form\/readme\.md/);
  assert.match(appReadme, /available-master-data-services\.md/);
  assert.match(appReadme, /server\/customize/);
});

test("set-autostart, sync-docs, update-registry, and list-apps stay in sync", async (t) => {
  t.after(() => {
    cleanupSharedHost();
  });
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
    url: "http://you-host-name:33333/test/",
    goal: "Updated registry goal",
    design: "Updated design summary",
  }).json;

  assert.equal(synced.status, "running");
  assert.equal(synced.port, 34567);
  assert.equal(synced.url, "http://you-host-name:33333/test/");
  assert.equal(synced.goal, "Updated registry goal");

  const notes = fs.readFileSync(common.appNotesPath(userName, token), "utf8");
  assert.match(notes, /Updated registry goal/);
  assert.match(notes, /Updated design summary/);
  assert.match(notes, /Auto Start[\s\S]*Disabled/);
  assert.match(notes, /http:\/\/you-host-name:33333\/test\//);

  const registryResult = runScript("update-registry.js", { userName, token }).json;
  assert.equal(registryResult.userName, userName);

  const listResult = runScript("list-apps.js", { userName }).json;
  assert.equal(listResult.userName, userName);
  assert.equal(listResult.apps.length, 1);
  assert.equal(listResult.apps[0].token, token);
  assert.equal(listResult.apps[0].autoStart, false);
});

test("install, build, deploy, restart, stop, status, and restore work for a runnable app", async (t) => {
  t.after(() => {
    cleanupSharedHost();
  });
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
  ports.push(started.internalPort);
  assert.equal(started.ready, true);
  assert.ok(Number.isInteger(started.pid));
  assert.equal(started.port, 33333);
  assert.ok(Number.isInteger(started.internalPort));
  assert.notEqual(started.internalPort, started.port);

  let status = runScript("status-app.js", { userName, token }).json;
  assert.equal(status.alive, true);
  assert.equal(status.reachable, true);
  assert.equal(status.statusCode, 200);
  assert.equal(status.port, 33333);
  assert.equal(status.internalPort, started.internalPort);

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
  ports.push(deployed.started.internalPort);
  assert.equal(deployed.built, true);
  assert.equal(deployed.started.ready, true);
  assert.equal(deployed.registry.userName, userName);
  assert.equal(deployed.started.port, 33333);

  const restarted = runScript(
    "restart-app.js",
    { userName, token },
    { timeoutMs: 120000 }
  ).json;
  ports.push(restarted.deployed.started.internalPort);
  assert.equal(restarted.deployed.started.ready, true);
  assert.equal(restarted.deployed.started.port, 33333);

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
  ports.push(restored.results[0].data.started.internalPort);
  assert.equal(restored.results[0].data.started.port, 33333);

  status = runScript("status-app.js", { userName, token }).json;
  assert.equal(status.alive, true);
  assert.equal(status.reachable, true);
});

test("start-app reuses the tracked instance instead of spawning a second one", async (t) => {
  t.after(() => {
    cleanupSharedHost();
  });
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
  ports.push(first.internalPort);
  assert.equal(first.ready, true);
  assert.equal(first.reused, false);
  assert.equal(first.port, 33333);

  const second = runScript("start-app.js", { userName, token }).json;
  assert.equal(second.ready, true);
  assert.equal(second.reused, true);
  assert.equal(second.port, first.port);
  assert.equal(second.internalPort, first.internalPort);
  assert.equal(second.pid, first.pid);
});

test("start-app fails instead of drifting to a new internal port when the recorded internal port is occupied", async (t) => {
  t.after(() => {
    cleanupSharedHost();
  });
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
    port: 33333,
    internalPort: blockedPort,
    url: common.hostUrl(33333, token),
  });

  let error = null;
  try {
    runScript("start-app.js", { userName, token });
  } catch (currentError) {
    error = currentError;
  }

  assert.ok(error);
  assert.match(String(error.message), /Expected to reuse internal port 35555, but it is occupied/);
});

test("registered ownership is enforced for app operations", async (t) => {
  t.after(() => {
    cleanupSharedHost();
  });
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

test("two apps can run simultaneously behind the shared port 33333", async (t) => {
  t.after(() => {
    cleanupSharedHost();
  });

  const userName = randomUserName("FULLSHARED");
  const tokenA = randomToken();
  const tokenB = randomToken();
  const ports = [];

  t.after(async () => {
    await cleanupSession(userName, tokenA, ports);
    await cleanupSession(userName, tokenB, ports);
  });

  runScript("init-app.js", {
    userName,
    token: tokenA,
    title: "Shared Port A",
    goal: "Verify shared port routing A.",
  });
  runScript("init-app.js", {
    userName,
    token: tokenB,
    title: "Shared Port B",
    goal: "Verify shared port routing B.",
  });
  writeFakeRunnableApp(userName, tokenA);
  writeFakeRunnableApp(userName, tokenB);

  const startedA = runScript("start-app.js", { userName, token: tokenA }, { timeoutMs: 30000 }).json;
  const startedB = runScript("start-app.js", { userName, token: tokenB }, { timeoutMs: 30000 }).json;
  ports.push(startedA.internalPort, startedB.internalPort);

  assert.equal(startedA.port, 33333);
  assert.equal(startedB.port, 33333);
  assert.notEqual(startedA.internalPort, startedB.internalPort);

  const healthA = await common.request(common.localUrl(33333, tokenA) + "api/health");
  const healthB = await common.request(common.localUrl(33333, tokenB) + "api/health");

  assert.equal(healthA.ok, true);
  assert.equal(healthA.statusCode, 200);
  assert.match(healthA.body, new RegExp(tokenA));

  assert.equal(healthB.ok, true);
  assert.equal(healthB.statusCode, 200);
  assert.match(healthB.body, new RegExp(tokenB));
});
