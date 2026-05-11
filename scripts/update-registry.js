"use strict";

const {
  appMetaPath,
  assertSafeSessionId,
  assertSafeToken,
  ensureDir,
  parseArgs,
  readJsonIfExists,
  registryPath,
  registryRoot,
  sessionIndexPath,
  webAppsRoot,
  writeJson,
} = require("./common");

function pickAppRecord(meta) {
  return {
    sessionId: meta.sessionId,
    token: meta.token,
    path: meta.path,
    port: meta.port,
    url: meta.url,
    title: meta.title,
    goal: meta.goal,
    status: meta.status,
    autoStart: meta.autoStart !== false,
    updatedAt: meta.updatedAt,
  };
}

function upsertApp(list, meta) {
  const next = Array.isArray(list) ? [...list] : [];
  const idx = next.findIndex((item) => item.token === meta.token);
  const record = pickAppRecord(meta);
  if (idx === -1) {
    next.push(record);
  } else {
    next[idx] = record;
  }
  next.sort((a, b) => a.token.localeCompare(b.token));
  return next;
}

function main() {
  const args = parseArgs(process.argv);
  const sessionId = args.sessionId;
  const token = args.token;

  assertSafeSessionId(sessionId);
  assertSafeToken(token);

  const meta = readJsonIfExists(appMetaPath(sessionId, token), null);
  if (!meta) {
    throw new Error("Cannot update registry without APP-META.json");
  }

  ensureDir(webAppsRoot());
  ensureDir(registryRoot());

  const root = readJsonIfExists(registryPath(), { sessions: [] });
  const sessionList = Array.isArray(root.sessions) ? [...root.sessions] : [];
  const sessionIdx = sessionList.findIndex((entry) => entry.sessionId === sessionId);
  const sessionRecord =
    sessionIdx === -1
      ? { sessionId, apps: [] }
      : { ...sessionList[sessionIdx], apps: Array.isArray(sessionList[sessionIdx].apps) ? sessionList[sessionIdx].apps : [] };
  sessionRecord.apps = upsertApp(sessionRecord.apps, meta);

  if (sessionIdx === -1) {
    sessionList.push(sessionRecord);
  } else {
    sessionList[sessionIdx] = sessionRecord;
  }
  sessionList.sort((a, b) => a.sessionId.localeCompare(b.sessionId));

  writeJson(registryPath(), { sessions: sessionList });
  writeJson(sessionIndexPath(sessionId), {
    sessionId,
    apps: sessionRecord.apps,
  });

  process.stdout.write(
    `${JSON.stringify({ sessionId, token, registry: registryPath() }, null, 2)}\n`
  );
}

main();
