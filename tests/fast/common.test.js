"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { common } = require("../helpers/script-test-utils");

test("common validates user names and tokens", () => {
  assert.doesNotThrow(() => common.assertSafeUserName("USER_123-ABC"));
  assert.throws(() => common.assertSafeUserName("bad id"));
  assert.doesNotThrow(() => common.assertSafeToken("ABCD1234"));
  assert.throws(() => common.assertSafeToken("abcd1234"));
});

test("common generates safe tokens and parses args", () => {
  const token = common.generateToken();
  assert.match(token, /^[A-Z0-9]{8}$/);

  const parsed = common.parseArgs([
    "node",
    "script.js",
    "--userName",
    "USER1",
    "--skipBuild",
    "--port",
    "33333",
  ]);

  assert.deepEqual(parsed, {
    userName: "USER1",
    skipBuild: true,
    port: "33333",
  });
});

test("common path helpers and URLs are stable", () => {
  const userName = "USER1";
  const token = "ABCD1234";

  assert.equal(common.repoRoot(), path.resolve(__dirname, "..", ".."));
  assert.ok(common.appRoot(userName, token).endsWith(path.join("workspaces", "web-apps", userName, token)));
  assert.equal(common.hostUrl(33333, token), "http://host:33333/ABCD1234/");
  assert.equal(common.localUrl(33333, token), "http://127.0.0.1:33333/ABCD1234/");
  assert.ok(!Number.isNaN(Date.parse(common.isoNow())));
});

test("common writes and reads JSON files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dda-common-"));
  const filePath = path.join(tempDir, "nested", "data.json");

  try {
    common.writeJson(filePath, { ok: true, count: 1 });
    assert.deepEqual(common.readJsonIfExists(filePath, null), { ok: true, count: 1 });
    assert.deepEqual(common.readJsonIfExists(path.join(tempDir, "missing.json"), { fallback: true }), {
      fallback: true,
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("common finds a free port in the configured range", async () => {
  const port = await common.findFreePort(common.MIN_PORT, common.MIN_PORT + 20);
  assert.ok(port >= common.MIN_PORT);
  assert.ok(port <= common.MIN_PORT + 20);
});
