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

test("findAppByToken only returns apps with app metadata", () => {
  const userName = randomUserName("FASTREG");
  const token = randomToken();
  const appDir = common.appRoot(userName, token);

  common.ensureDir(appDir);
  assert.equal(common.findAppByToken(token), null);

  common.writeAppRegistry({
    apps: [
      {
        name: token,
        token,
        local_path: `apps/${token}`,
        port: null,
        internal_port: null,
        description: "Registry-only app",
        created_by: userName,
        last_modified_by: userName,
        created_at: new Date().toISOString(),
        last_modified_at: new Date().toISOString(),
        is_disabled: false,
      },
    ],
  });

  assert.equal(common.findAppByToken(token), null);

  common.writeJson(common.appMetaPath(userName, token), {
    userName,
    token,
    title: "Task Tracker",
    goal: "Registry-only app",
    path: `apps/${token}`,
    port: null,
    internalPort: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  assert.equal(common.findAppByToken(token).userName, userName);
});
