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
  generateToken,
  hostUrl,
  isoNow,
  parseArgs,
  readJsonIfExists,
  sessionRoot,
  writeJson,
} = require("./common");

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

  const result = {
    sessionId,
    token,
    appDir,
    meta: readJsonIfExists(appMetaPath(sessionId, token), meta),
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main();
