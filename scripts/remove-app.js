"use strict";

const fs = require("fs");
const { spawnSync } = require("child_process");
const {
  appMetaPath,
  appRoot,
  assertSafeSessionId,
  assertSafeToken,
  parseArgs,
  readJsonIfExists,
  registryPath,
  removePlatformRegistryEntry,
  sessionIndexPath,
  sessionRoot,
  writeJson,
} = require("./common");

function runStop(sessionId, token) {
  return spawnSync(
    process.execPath,
    ["scripts/stop-app.js", "--sessionId", sessionId, "--token", token],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    }
  );
}

function removeFromWorkspaceRegistry(sessionId, token) {
  const root = readJsonIfExists(registryPath(), { sessions: [] });
  const sessions = Array.isArray(root.sessions) ? root.sessions : [];
  const nextSessions = [];
  let removed = false;

  for (const session of sessions) {
    if (!session || session.sessionId !== sessionId) {
      nextSessions.push(session);
      continue;
    }

    const apps = Array.isArray(session.apps) ? session.apps : [];
    const nextApps = apps.filter((app) => app.token !== token);
    removed = removed || nextApps.length !== apps.length;

    if (nextApps.length > 0) {
      nextSessions.push({
        ...session,
        apps: nextApps,
      });
    }
  }

  writeJson(registryPath(), { sessions: nextSessions });
  const remainingSession = nextSessions.find((session) => session.sessionId === sessionId);
  if (remainingSession) {
    writeJson(sessionIndexPath(sessionId), {
      sessionId,
      apps: remainingSession.apps,
    });
  } else {
    fs.rmSync(sessionIndexPath(sessionId), { force: true });
  }

  return removed;
}

function main() {
  const args = parseArgs(process.argv);
  const sessionId = args.sessionId;
  const token = args.token;

  assertSafeSessionId(sessionId);
  assertSafeToken(token);

  const meta = readJsonIfExists(appMetaPath(sessionId, token), null);
  const appDir = appRoot(sessionId, token);
  const existed = fs.existsSync(appDir);

  runStop(sessionId, token);
  const workspaceRegistryRemoved = removeFromWorkspaceRegistry(sessionId, token);
  const platformRegistryRemoved = removePlatformRegistryEntry(sessionId, token);
  fs.rmSync(appDir, { recursive: true, force: true });

  if (fs.existsSync(sessionRoot(sessionId))) {
    const remaining = fs.readdirSync(sessionRoot(sessionId), { withFileTypes: true });
    if (remaining.length === 0) {
      fs.rmSync(sessionRoot(sessionId), { recursive: true, force: true });
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        sessionId,
        token,
        name: meta ? meta.title : null,
        existed,
        removed: existed || workspaceRegistryRemoved || platformRegistryRemoved.removed,
        workspaceRegistryRemoved,
        platformRegistryRemoved: platformRegistryRemoved.removed,
      },
      null,
      2
    )}\n`
  );
}

main();
