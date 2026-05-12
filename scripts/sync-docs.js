"use strict";

const fs = require("fs");
const path = require("path");
const {
  appMetaPath,
  appNotesPath,
  appRoot,
  assertSafeSessionId,
  assertSafeToken,
  hostUrl,
  isoNow,
  parseArgs,
  readJsonIfExists,
  syncPlatformRegistryEntry,
  writeJson,
} = require("./common");

function aiNotesPath(sessionId, token) {
  return path.join(appRoot(sessionId, token), ".ai.md");
}

function upsertSection(markdown, heading, body) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sectionRegex = new RegExp(`## ${escaped}[\\s\\S]*?(?=\\n## |$)`, "m");
  const nextSection = `## ${heading}\n\n${body.trim()}\n`;
  if (sectionRegex.test(markdown)) {
    return markdown.replace(sectionRegex, nextSection);
  }
  return `${markdown.trim()}\n\n${nextSection}\n`;
}

function changeLogEntry(previous, next) {
  const changes = [];
  if (previous.goal !== next.goal) {
    changes.push(`goal updated to "${next.goal}"`);
  }
  if (previous.designSummary !== next.designSummary) {
    changes.push("design summary updated");
  }
  if (previous.port !== next.port) {
    changes.push(`port set to ${next.port}`);
  }
  if (previous.url !== next.url) {
    changes.push(`URL set to ${next.url}`);
  }
  if (previous.status !== next.status) {
    changes.push(`status changed to ${next.status}`);
  }
  if (changes.length === 0) {
    changes.push("metadata synchronized");
  }
  return `- ${next.updatedAt}: ${changes.join("; ")}.`;
}

function aiNotesTemplate(meta) {
  return `# AI Context

## User Requirements

- ${meta.goal}

## AI Design Notes

- ${meta.designSummary}
- Stack: ${meta.stack.frontend}, ${meta.stack.backend}, ${meta.stack.database}
- Base path: /${meta.token}/
- URL: ${meta.url || "Pending startup"}

## Working Rule

- Read this file before modifying the generated web app.
`;
}

function main() {
  const args = parseArgs(process.argv);
  const sessionId = args.sessionId;
  const token = args.token;

  assertSafeSessionId(sessionId);
  assertSafeToken(token);

  const metaFile = appMetaPath(sessionId, token);
  const notesFile = appNotesPath(sessionId, token);
  const previous = readJsonIfExists(metaFile, null);
  if (!previous) {
    throw new Error(`Missing app metadata: ${metaFile}`);
  }

  const next = { ...previous };
  if (args.title) {
    next.title = args.title;
  }
  if (args.goal) {
    next.goal = args.goal;
  }
  if (args.design) {
    next.designSummary = args.design;
  }
  if (args.status) {
    next.status = args.status;
  }
  if (args.port) {
    next.port = Number(args.port);
  }
  if (args.url) {
    next.url = args.url;
  } else if (next.port) {
    next.url = hostUrl(next.port, token);
  }
  next.updatedAt = isoNow();

  writeJson(metaFile, next);

  const existingNotes = fs.existsSync(notesFile)
    ? fs.readFileSync(notesFile, "utf8")
    : `# ${next.title}\n`;

  let notes = existingNotes;
  if (!notes.startsWith(`# ${next.title}`)) {
    notes = `# ${next.title}\n\n${notes.replace(/^# .*?\n+/, "")}`;
  }
  notes = upsertSection(notes, "Goal", next.goal);
  notes = upsertSection(notes, "Design", next.designSummary);
  notes = upsertSection(
    notes,
    "Runbook",
    "- Install: `npm install`\n- Build: `npm run build`\n- Start: `npm run start`"
  );
  notes = upsertSection(notes, "Current URL", next.url || "Pending startup");
  notes = upsertSection(notes, "Auto Start", next.autoStart === false ? "Disabled" : "Enabled");

  const existingChangeLogMatch = notes.match(/## Change log[\s\S]*$/m);
  const existingEntries = existingChangeLogMatch
    ? existingChangeLogMatch[0].replace(/^## Change log\s*/m, "").trim()
    : "";
  const entry = changeLogEntry(previous, next);
  const mergedEntries = existingEntries ? `${entry}\n${existingEntries}` : entry;
  notes = upsertSection(notes, "Change log", mergedEntries);

  fs.writeFileSync(notesFile, `${notes.trim()}\n`, "utf8");
  fs.writeFileSync(aiNotesPath(sessionId, token), aiNotesTemplate(next), "utf8");
  fs.rmSync(path.join(appRoot(sessionId, token), "config.json"), { force: true });
  syncPlatformRegistryEntry(next);
  process.stdout.write(`${JSON.stringify(next, null, 2)}\n`);
}

main();
