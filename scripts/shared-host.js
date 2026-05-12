"use strict";

const http = require("http");
const {
  SHARED_HOST_HEALTH_PATH,
  SHARED_PUBLIC_PORT,
  appReachable,
  assertSafeToken,
  readAppRegistry,
} = require("./common");

function flattenApps(registry) {
  const apps = Array.isArray(registry && registry.apps) ? registry.apps : [];
  return apps.map((app) => ({
    token: app.token || app.name,
    internalPort: Number.isInteger(app.internal_port) ? app.internal_port : null,
    disabled: app.is_disabled === true,
  }));
}

async function resolveTarget(token) {
  assertSafeToken(token);
  const registry = readAppRegistry();
  const entry = flattenApps(registry).find((app) => app.token === token);
  if (!entry || !Number.isInteger(entry.internalPort)) {
    return null;
  }
  if (entry.disabled) {
    return { disabled: true, token };
  }

  const health = await appReachable(entry.internalPort, null, token);
  if (!health.ok || !health.matched) {
    return null;
  }

  return {
    token,
    internalPort: entry.internalPort,
    disabled: false,
  };
}

function proxyRequest(targetPort, req, res) {
  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port: targetPort,
      method: req.method,
      path: req.url,
      headers: {
        ...req.headers,
        host: `127.0.0.1:${targetPort}`,
      },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );

  upstream.on("error", (error) => {
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        ok: false,
        error: "upstream-error",
        message: error.message,
      })
    );
  });

  req.pipe(upstream);
}

const server = http.createServer(async (req, res) => {
  if (req.url === SHARED_HOST_HEALTH_PATH) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: true, port: SHARED_PUBLIC_PORT }));
    return;
  }

  const match = /^\/([A-Z0-9]{8})(\/.*|$)/.exec(req.url || "");
  if (!match) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, error: "unknown-token-path" }));
    return;
  }

  const token = match[1];
  let target = null;
  try {
    target = await resolveTarget(token);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, error: "target-resolution-failed", message: error.message }));
    return;
  }

  if (target && target.disabled) {
    res.statusCode = 403;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, error: "app-disabled", token }));
    return;
  }

  if (!target) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, error: "app-not-ready", token }));
    return;
  }

  proxyRequest(target.internalPort, req, res);
});

server.listen(SHARED_PUBLIC_PORT, "0.0.0.0");
