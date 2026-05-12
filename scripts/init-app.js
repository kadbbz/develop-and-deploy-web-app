"use strict";

const fs = require("fs");
const path = require("path");
const {
  appMetaPath,
  appNotesPath,
  appRoot,
  assertSafeSessionId,
  assertSafeToken,
  ensureDir,
  findAppByToken,
  generateToken,
  hostUrl,
  isoNow,
  parseArgs,
  readJsonIfExists,
  sessionRoot,
  syncPlatformRegistryEntry,
  writeJson,
} = require("./common");

function aiNotesPath(sessionId, token) {
  return path.join(appRoot(sessionId, token), ".ai.md");
}

function notesTemplate(meta) {
  return `# ${meta.title}

## Goal

${meta.goal}

## Scope

- Initial scaffold

## Design

${meta.designSummary}

## Data model

- Define entities in the app source and keep this section current.

## Runbook

- Install: \`npm install\`
- Build: \`npm run build\`
- Start: \`npm run start\`

## Current URL

${meta.url || "Pending startup"}

## Change log

- ${meta.updatedAt}: App record initialized.
`;
}

function aiNotesTemplate(meta) {
  return `# AI Context

## User Requirements

- ${meta.goal}

## AI Design Notes

- ${meta.designSummary}
- Stack: ${meta.stack.frontend}, ${meta.stack.backend}, ${meta.stack.database}
- Base path: /${meta.token}/

## Working Rule

- Read this file before modifying the generated web app.
`;
}

function main() {
  const args = parseArgs(process.argv);
  const sessionId = args.sessionId;
  const requestedToken = args.token;
  const title = args.title || "Simple Web App";
  const goal = args.goal || "Build and run a simple full-stack web app.";
  const designSummary = args.design || "Use the skill defaults and Huashu-inspired web styling.";

  assertSafeSessionId(sessionId);
  const token = requestedToken || generateToken();
  assertSafeToken(token);
  const tokenOwner = findAppByToken(token);
  if (tokenOwner) {
    throw new Error(`Token already exists: ${token}`);
  }

  const appDir = appRoot(sessionId, token);
  if (fs.existsSync(appDir)) {
    throw new Error(`App directory already exists: ${appDir}`);
  }

  ensureDir(sessionRoot(sessionId));
  ensureDir(appDir);

  const now = isoNow();
  const meta = {
    sessionId,
    token,
    title,
    goal,
    designSummary,
    path: path.relative(process.cwd(), appDir).replaceAll("\\", "/"),
    port: null,
    url: null,
    stack: {
      frontend: "React + TypeScript + Vite",
      backend: "Express + TypeScript",
      database: "SQLite",
    },
    autoStart: true,
    status: "initialized",
    createdAt: now,
    updatedAt: now,
  };

  writeJson(appMetaPath(sessionId, token), meta);
  fs.writeFileSync(appNotesPath(sessionId, token), notesTemplate(meta), "utf8");
  fs.writeFileSync(aiNotesPath(sessionId, token), aiNotesTemplate(meta), "utf8");
  syncPlatformRegistryEntry(meta);

  const result = {
    sessionId,
    token,
    appDir,
    meta: readJsonIfExists(appMetaPath(sessionId, token), meta),
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main();
