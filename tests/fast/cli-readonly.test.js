"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { common, randomUserName, randomToken, runScript } = require("../helpers/script-test-utils");

test("bootstrap-host prints the startup command", () => {
  const result = runScript("bootstrap-host.js");

  assert.equal(result.json.purpose, "Host-level startup command");
  assert.match(result.json.command, /restore-apps\.js".*--skipBuild$/);
  assert.match(result.json.note, /startup mechanism|process supervisor/);
});

test("list-apps returns an empty user record for a missing user", () => {
  const userName = randomUserName("FASTLIST");
  const result = runScript("list-apps.js", { userName });

  assert.deepEqual(result.json, {
    userName,
    apps: [],
  });
});

test("status-app reports a missing app without throwing", () => {
  const userName = randomUserName("FASTSTATUS");
  let error = null;

  try {
    runScript("status-app.js", {
      userName,
      token: "ABCD1234",
    });
  } catch (currentError) {
    error = currentError;
  }

  assert.ok(error);
  assert.match(String(error.message), /not registered under user/);
});

test("findAppByToken only returns apps registered in the registry", () => {
  const userName = randomUserName("FASTREG");
  const token = randomToken();
  const appDir = common.appRoot(userName, token);

  common.ensureDir(appDir);
  assert.equal(common.findAppByToken(token), null);

  common.writeWorkspaceRegistry({
    users: [
      {
        userName,
        apps: [
          {
            userName,
            token,
            path: `workspaces/web-apps/${userName}/${token}`,
            port: null,
            url: null,
            title: "Task Tracker",
            goal: "Registry-only app",
            status: "initialized",
            autoStart: true,
            updatedAt: new Date().toISOString(),
            appKind: "TaskTracker",
            appLabel: "WebApp",
          },
        ],
      },
    ],
  });

  assert.equal(common.findAppByToken(token).userName, userName);
});
