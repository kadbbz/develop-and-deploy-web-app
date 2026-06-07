"use strict";

const fs = require("fs");
const path = require("path");
const {
  appRoot,
  assertRegisteredOwnership,
  assertSafeToken,
  assertSafeUserName,
  customizeRoot,
  parseArgs,
  readJsonIfExists,
  repoRoot,
} = require("./common");

const TEMPLATE_NAME = "openclaw-liteapp";

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function copyBinary(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function isTextFile(filePath) {
  return /\.(css|html|js|json|md|ts|tsx|txt|yml|yaml)$/i.test(filePath);
}

function replacementsFor(meta) {
  return {
    __APP_TITLE__: meta.title || "业务轻应用",
    __APP_GOAL__: meta.goal || "Build a governed business workspace for data entry, fixed-rule calculation, filtering, and database persistence.",
    __TOKEN__: meta.token,
    __BASE_PATH__: `/${meta.token}`,
    __OWNER_USERNAME__: meta.userName,
  };
}

function applyReplacements(content, replacements) {
  let next = content;
  for (const [key, value] of Object.entries(replacements)) {
    next = next.replaceAll(key, String(value));
  }
  return next;
}

function copyTemplateDirectory(sourceDir, targetDir, replacements) {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyTemplateDirectory(sourcePath, targetPath, replacements);
      continue;
    }

    const finalTargetPath =
      entry.name === "app-readme.md"
        ? path.join(targetDir, "README.md")
        : targetPath;

    if (isTextFile(sourcePath)) {
      writeText(
        finalTargetPath,
        applyReplacements(fs.readFileSync(sourcePath, "utf8"), replacements)
      );
    } else {
      copyBinary(sourcePath, finalTargetPath);
    }
  }
}

function resolveLoginServiceSource() {
  const runtimeOverride = path.join(customizeRoot(), "login-service.js");
  if (fs.existsSync(runtimeOverride)) {
    return runtimeOverride;
  }
  return path.join(repoRoot(), "customize", "login-service.js");
}

function writeDeveloperChecklist(appDir, meta) {
  writeText(
    path.join(appDir, "NON_FUNCTIONAL_REQUIREMENTS.md"),
    `# Non-Functional Requirements

Use this checklist before changing or extending the app.

## Security

- Authentication: shared platform users, session token, Bearer token, and Basic auth.
- Authorization: normal app pages and record APIs expose the current user's own records.
- Data isolation: app pages and data are mounted under /${meta.token}/ and stored in this app directory.

## Data

- Database: NeDB.
- Schema compatibility: payloads carry schemaVersion and server-side read migration.
- Business rules: deterministic calculations run on the server and can be previewed in the UI.
- Persistence: submitted records are stored in server/data/records.db.

## Operations

- Preview URL: http://you-host-name:33333/${meta.token}/
- Health endpoint: /${meta.token}/api/health
`
  );
}

function scaffoldProject(meta) {
  const appDir = appRoot(meta.userName, meta.token);
  const templateDir = path.join(repoRoot(), "templates", TEMPLATE_NAME);
  if (!fs.existsSync(templateDir)) {
    throw new Error(`Missing template: ${templateDir}`);
  }

  copyTemplateDirectory(templateDir, appDir, replacementsFor(meta));
  copyBinary(
    resolveLoginServiceSource(),
    path.join(appDir, "server", "customize", "login-service.js")
  );
  writeDeveloperChecklist(appDir, meta);
}

function main() {
  const args = parseArgs(process.argv);
  const userName = args.userName;
  const token = args.token;

  assertSafeUserName(userName);
  assertSafeToken(token);
  assertRegisteredOwnership(userName, token);

  const meta = readJsonIfExists(path.join(appRoot(userName, token), "APP-META.json"), null);
  if (!meta) {
    throw new Error("Run init-app.js before scaffold-app.js");
  }

  scaffoldProject(meta);
  process.stdout.write(
    `${JSON.stringify(
      {
        userName,
        token,
        template: TEMPLATE_NAME,
        path: meta.path,
        scaffolded: true,
        previewUrl: `http://you-host-name:33333/${token}/`,
      },
      null,
      2
    )}\n`
  );
}

main();
