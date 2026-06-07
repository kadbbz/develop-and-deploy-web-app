# Script Contracts

Use these scripts for local app lifecycle operations.

## Main Flow

```bash
node scripts/init-app.js --userName <name> [--token <TOKEN>] [--title <title>] [--goal <goal>] [--design <summary>] [--nfr <summary>]
node scripts/scaffold-app.js --userName <name> --token <TOKEN>
node scripts/deploy-app.js --userName <name> --token <TOKEN>
```

`deploy-app.js` runs install, build, start, doc sync, and registry update.

## Other Commands

- `node scripts/status-app.js --userName <name> --token <TOKEN>`
- `node scripts/restart-app.js --userName <name> --token <TOKEN> [--skipBuild]`
- `node scripts/stop-app.js --userName <name> --token <TOKEN>`
- `node scripts/remove-app.js --userName <name> --token <TOKEN>`
- `node scripts/list-apps.js [--userName <name>]`
- `node scripts/restore-apps.js [--userName <name>] [--skipBuild]`
- `node scripts/set-autostart.js --userName <name> --token <TOKEN> [--enabled true|false]`
- `node scripts/bootstrap-host.js`

## Required State

- App metadata: `APP-META.json`
- Human notes: `APP-NOTES.md`
- Agent notes: `.ai.md`
- NFR checklist: `NON_FUNCTIONAL_REQUIREMENTS.md`
- Registry: `.lite-apps/app-registry.json`

## Safety Constraints

- Do not scaffold into the repository root.
- Keep generated apps under `.lite-apps/apps/{token}`.
- Keep shared users under `.lite-apps/platform/users.db`.
- Do not kill processes except the PID tracked for the selected app.
- Keep the public preview port fixed at `33333`.
