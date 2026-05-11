"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { randomSessionId, runScript } = require("../helpers/script-test-utils");

test("bootstrap-host prints the startup command", () => {
  const result = runScript("bootstrap-host.js");

  assert.equal(result.json.purpose, "Host-level startup command");
  assert.match(result.json.command, /restore-apps\.js".*--skipBuild$/);
  assert.match(result.json.note, /startup mechanism|process supervisor/);
});

test("list-apps returns an empty session record for a missing session", () => {
  const sessionId = randomSessionId("FASTLIST");
  const result = runScript("list-apps.js", { sessionId });

  assert.deepEqual(result.json, {
    sessionId,
    apps: [],
  });
});

test("status-app reports a missing app without throwing", () => {
  const sessionId = randomSessionId("FASTSTATUS");
  const result = runScript("status-app.js", {
    sessionId,
    token: "ABCD1234",
  });

  assert.equal(result.json.sessionId, sessionId);
  assert.equal(result.json.token, "ABCD1234");
  assert.equal(result.json.alive, false);
  assert.equal(result.json.port, null);
  assert.equal(result.json.status, "missing");
  assert.equal(result.json.reachable, false);
});
