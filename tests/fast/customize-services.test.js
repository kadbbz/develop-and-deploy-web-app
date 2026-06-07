"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createLoginService } = require("../../customize/login-service");
const { createMasterDataService } = require("../../customize/master-data-service");

test("login-service supports shared NeDB users, sessions, registration, and Basic auth", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "liteapp-login-"));
  const dbPath = path.join(tempDir, "users.db");

  try {
    const service = await createLoginService({
      dbPath,
      sessionTtlMs: 60_000,
    });

    const seeded = await service.seedUser({
      username: "analyst",
      password: "pass-123",
      displayName: "Data Analyst",
      roles: ["staff", "survey"],
    });

    assert.equal(seeded.username, "analyst");
    assert.deepEqual(seeded.roles, ["staff", "survey"]);

    const registered = await service.register({
      username: "operator",
      password: "pass-456",
      displayName: "Operator",
    });

    assert.equal(registered.username, "operator");
    assert.deepEqual(registered.roles, ["user"]);

    const session = await service.login({
      username: "analyst",
      password: "pass-123",
    });

    assert.equal(session.authenticated, true);
    assert.equal(typeof session.sessionToken, "string");
    assert.ok(session.sessionToken.length > 10);

    const restored = await service.authenticate(session.sessionToken);
    assert.equal(restored.user.username, "analyst");
    assert.deepEqual(restored.user.roles, ["staff", "survey"]);

    const basic = await service.authenticateBasicHeader(
      `Basic ${Buffer.from("operator:pass-456").toString("base64")}`
    );
    assert.equal(basic.user.username, "operator");

    const elevated = await service.ensureUserRoles("operator", ["admin"]);
    assert.deepEqual(elevated.roles, ["user", "admin"]);

    assert.equal(await service.logout(session.sessionToken), true);
    assert.equal(await service.authenticate(session.sessionToken), null);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("master-data-service performs oauth token exchange and bearer request", async () => {
  const requests = [];
  const service = createMasterDataService({
    services: [
      {
        name: "employee-directory",
        description: "Employee lookup",
        baseUrl: "https://example.com",
        accessKey: "ak-demo",
        secretKey: "sk-demo",
        scope: "master.read",
        requestPath: "/directory/search",
      },
    ],
  });

  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    if (String(url).endsWith("/oauth/token")) {
      return fakeResponse(200, {
        access_token: "token-123",
        token_type: "Bearer",
        expires_in: 1800,
      });
    }

    return fakeResponse(200, {
      items: [{ id: "E-001", name: "Nina" }],
      requestEcho: JSON.parse(String(options.body || "{}")),
    });
  };

  assert.equal(service.isExist("employee-directory"), true);
  assert.equal(service.isExist("missing-service"), false);

  const result = await service.call(
    "employee-directory",
    { keyword: "Nina" },
    { fetchImpl }
  );

  assert.equal(result.service, "employee-directory");
  assert.deepEqual(result.data.items, [{ id: "E-001", name: "Nina" }]);
  assert.equal(requests.length, 2);
  assert.match(String(requests[0].options.headers.Authorization), /^Basic /);
  assert.equal(requests[1].options.headers.Authorization, "Bearer token-123");
});

function fakeResponse(status, jsonPayload) {
  const body = JSON.stringify(jsonPayload);
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return body;
    },
  };
}
