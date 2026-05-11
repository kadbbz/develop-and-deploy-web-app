# Script Contracts

Use these scripts instead of ad hoc deployment logic whenever possible.

## Available Scripts

- `node scripts/init-app.js --sessionId <id> [--token <TOKEN>] [--title <title>] [--goal <goal>] [--design <summary>]`
- `node scripts/sync-docs.js --sessionId <id> --token <TOKEN> [--title <title>] [--goal <goal>] [--design <summary>] [--status <status>] [--port <port>] [--url <url>]`
- `node scripts/update-registry.js --sessionId <id> --token <TOKEN>`
- `node scripts/list-apps.js [--sessionId <id>]`
- `node scripts/install-app.js --sessionId <id> --token <TOKEN>`
- `node scripts/build-app.js --sessionId <id> --token <TOKEN>`
- `node scripts/start-app.js --sessionId <id> --token <TOKEN>`
- `node scripts/deploy-app.js --sessionId <id> --token <TOKEN>`
- `node scripts/status-app.js --sessionId <id> --token <TOKEN>`
- `node scripts/restart-app.js --sessionId <id> --token <TOKEN> [--skipBuild]`
- `node scripts/stop-app.js --sessionId <id> --token <TOKEN>`
- `node scripts/scaffold-app.js --sessionId <id> --token <TOKEN>`
- `node scripts/restore-apps.js [--sessionId <id>] [--skipBuild]`
- `node scripts/set-autostart.js --sessionId <id> --token <TOKEN> [--enabled true|false]`
- `node scripts/bootstrap-host.js`

## Safety Constraints

- Keep all operations inside the current workspace.
- Do not add script behavior that downloads and executes remote code.
- Do not store or exfiltrate secrets.
- Do not modify files outside the target app directory and registry paths unless the user explicitly asks for broader work.
- Do not kill unrelated processes. `stop-app.js` should only target the PID recorded for that app.

## Expected State

- `init-app.js` creates the app directory plus `APP-META.json` and `APP-NOTES.md`.
- `sync-docs.js` updates the per-app metadata and notes.
- `update-registry.js` updates `workspaces/web-apps/registry.json` and `workspaces/web-apps/sessions/{sessionId}.json`.
- `list-apps.js` returns current registry data.
- `install-app.js` runs `npm install` inside the generated app workspace.
- `build-app.js` runs `npm run build` inside the generated app workspace.
- `start-app.js` finds a free port in `33333-39999`, starts the app, and writes runtime info.
- `deploy-app.js` runs install, build, start, doc sync, and registry update in order.
- `status-app.js` reports PID, port, URL, and reachability for an app.
- `restart-app.js` stops and redeploys an app in order.
- `stop-app.js` stops the recorded process for that app if present.
- `scaffold-app.js` generates the actual React, Express, and SQLite project files.
- `restore-apps.js` redeploys all apps marked for auto-start from the registry.
- `set-autostart.js` toggles whether an app should be included in restore operations.
- `bootstrap-host.js` prints the explicit host startup command instead of registering one automatically.
