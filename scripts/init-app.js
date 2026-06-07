"use strict";

const fs = require("fs");
const path = require("path");
const {
  appMetaPath,
  appNotesPath,
  appRoot,
  appsRoot,
  assertSafeUserName,
  assertSafeToken,
  deriveAppDescriptors,
  ensureDir,
  findAppByToken,
  generateToken,
  isoNow,
  parseArgs,
  readJsonIfExists,
  syncPlatformRegistryEntry,
  syncAppRegistryEntry,
  writeJson,
} = require("./common");

function aiNotesPath(userName, token) {
  return path.join(appRoot(userName, token), ".ai.md");
}

function notesTemplate(meta) {
  return `# ${meta.title}

## Goal

${meta.goal}

## Scope

- Initial scaffold

## Design

${meta.designSummary}

## Non-functional requirements

${meta.nonFunctionalRequirements}

## Data model

- NeDB records with owner-based access control.
- Server-side deterministic business rules for calculation and filtering.
- Payload schema versioning with read-time migration.

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
  return `# Agent Context

## User Requirements

- ${meta.goal}

## Design Notes

- ${meta.designSummary}
- Stack: ${meta.stack.frontend}, ${meta.stack.backend}, ${meta.stack.database}
- Base path: /${meta.token}/
- Non-functional requirements: ${meta.nonFunctionalRequirements}

## Working Rule

- Read this file before modifying the generated web app.
`;
}

function main() {
  const args = parseArgs(process.argv);
  const userName = args.userName;
  const requestedToken = args.token;
  const title = args.title || "Web App";
  const goal = args.goal || "Build and run a governed business workspace for data entry, fixed-rule calculation, filtering, and collaboration.";
  const designSummary = args.design || "Use Huashu Design direction with Ant Design Pro operational UI.";
  const nonFunctionalRequirements =
    args.nfr ||
    "Confirm authentication, current-user data visibility, database persistence, schema compatibility, and preview access before delivery.";

  assertSafeUserName(userName);
  const token = requestedToken || generateToken();
  assertSafeToken(token);
  const tokenOwner = findAppByToken(token);
  if (tokenOwner) {
    throw new Error(`Token already exists: ${token}`);
  }

  const appDir = appRoot(userName, token);
  if (fs.existsSync(appDir)) {
    throw new Error(`App directory already exists: ${appDir}`);
  }

  ensureDir(appsRoot());
  ensureDir(appDir);

  const now = isoNow();
  const descriptors = deriveAppDescriptors({
    title,
    goal,
    appKind: args.appKind,
    appLabel: args.appLabel,
  });
  const meta = {
    userName,
    token,
    title,
    goal,
    designSummary,
    nonFunctionalRequirements,
    path: path.join("apps", token).replaceAll("\\", "/"),
    port: null,
    url: null,
    stack: {
      frontend: "React + Ant Design Pro + ECharts",
      backend: "Express + TypeScript",
      database: "NeDB",
    },
    autoStart: true,
    isDisabled: false,
    status: "initialized",
    appKind: descriptors.appKind,
    appLabel: descriptors.appLabel,
    createdAt: now,
    updatedAt: now,
  };

  writeJson(appMetaPath(userName, token), meta);
  fs.writeFileSync(appNotesPath(userName, token), notesTemplate(meta), "utf8");
  fs.writeFileSync(aiNotesPath(userName, token), aiNotesTemplate(meta), "utf8");
  syncAppRegistryEntry(meta);
  syncPlatformRegistryEntry(meta);

  const result = {
    userName,
    token,
    appDir,
    meta: readJsonIfExists(appMetaPath(userName, token), meta),
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main();
