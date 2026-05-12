"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const common = require(path.join(repoRoot, "scripts", "common.js"));

function ensurePlatformDataDir() {
  common.ensureDir(common.platformDataDir());
}

function randomUserName(prefix = "TEST") {
  const stamp = Date.now().toString(36).toUpperCase();
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}_${stamp}_${suffix}`;
}

function randomSessionId(prefix = "TEST") {
  return randomUserName(prefix);
}

function randomToken() {
  return common.generateToken();
}

function toCliArgs(argMap = {}) {
  const args = [];
  for (const [key, value] of Object.entries(argMap)) {
    if (value === undefined || value === null || value === false) {
      continue;
    }
    args.push(`--${key}`);
    if (value !== true) {
      args.push(String(value));
    }
  }
  return args;
}

function runScript(scriptName, argMap, options = {}) {
  ensurePlatformDataDir();
  const args = Array.isArray(argMap) ? argMap : toCliArgs(argMap);
  const scriptPath = path.join(repoRoot, "scripts", scriptName);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: options.timeoutMs || 60000,
  });

  if (result.error) {
    throw result.error;
  }

  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  const json = common.extractLastJsonObject(stdout);

  if (!options.allowFailure && result.status !== 0) {
    throw new Error(
      [
        `Script failed: ${scriptName}`,
        `status=${result.status}`,
        stdout.trim(),
        stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  return {
    ...result,
    stdout,
    stderr,
    json,
  };
}

function writeFakeRunnableApp(userName, token) {
  const appDir = common.appRoot(userName, token);
  const serverDir = path.join(appDir, "server");
  const serverDistDir = path.join(serverDir, "dist");
  const clientDistDir = path.join(appDir, "client", "dist");

  common.ensureDir(serverDistDir);
  common.ensureDir(clientDistDir);

  common.writeJson(path.join(appDir, "package.json"), {
    name: "fake-app",
    private: true,
    scripts: {
      build: 'node -e "process.exit(0)"',
    },
  });

  common.writeJson(path.join(serverDir, "package.json"), {
    name: "fake-app-server",
    private: true,
    scripts: {
      start: "node dist/index.js",
      build: 'node -e "process.exit(0)"',
    },
  });

  fs.writeFileSync(
    path.join(serverDistDir, "index.js"),
    `"use strict";

const http = require("http");

const port = Number(process.env.PORT || "3000");
const token = process.env.APP_TOKEN || "APP00000";
const basePath = process.env.BASE_PATH || \`/\${token}\`;

let closing = false;

function closeServer(server) {
  if (closing) {
    return;
  }
  closing = true;
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 250).unref();
}

const server = http.createServer((req, res) => {
  if (req.url === \`\${basePath}/shutdown\`) {
    res.statusCode = 200;
    res.end("bye");
    closeServer(server);
    return;
  }

  if (req.url === \`\${basePath}/api/health\`) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, token, basePath }));
    return;
  }

  if (req.url && req.url.startsWith(basePath)) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end("<!doctype html><html><body>ok</body></html>");
    return;
  }

  res.statusCode = 404;
  res.end("not found");
});

server.listen(port, "0.0.0.0");

process.on("SIGTERM", () => closeServer(server));
process.on("SIGINT", () => closeServer(server));
setTimeout(() => closeServer(server), 120000).unref();
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(clientDistDir, "index.html"),
    "<!doctype html><html><body>ok</body></html>\n",
    "utf8"
  );
}

function request(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve({ ok: true, statusCode: res.statusCode || 0 });
    });
    req.on("error", () => resolve({ ok: false, statusCode: 0 }));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve({ ok: false, statusCode: 0 });
    });
  });
}

async function shutdownPort(port, userName, token) {
  if (!Number.isInteger(port)) {
    return;
  }
  await request(`${common.localUrl(port, token)}shutdown`);
}

async function cleanupSession(userName, token, extraPorts = []) {
  try {
    runScript("stop-app.js", { userName, token }, { allowFailure: true });
  } catch (error) {
    // Best-effort cleanup only.
  }

  const meta = common.readJsonIfExists(common.appMetaPath(userName, token), null);
  const ports = new Set(extraPorts.filter((port) => Number.isInteger(port)));
  if (meta && Number.isInteger(meta.port)) {
    ports.add(meta.port);
  }

  for (const port of ports) {
    // eslint-disable-next-line no-await-in-loop
    await shutdownPort(port, userName, token);
  }

  fs.rmSync(common.userRoot(userName), { recursive: true, force: true });
  fs.rmSync(common.userIndexPath(userName), { force: true });
  common.removeWorkspaceRegistryEntry(userName, token);
}

module.exports = {
  cleanupSession,
  common,
  ensurePlatformDataDir,
  randomUserName,
  randomSessionId,
  randomToken,
  repoRoot,
  runScript,
  writeFakeRunnableApp,
};
