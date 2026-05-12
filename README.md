# develop-and-deploy-web-app

A local toolkit for scaffolding, running, and managing small full-stack web apps inside this repository.

It stores generated LiteApps under a shared root at `PLATFORM_DATA_ROOT/.lite-apps` when `PLATFORM_DATA_ROOT` is set, otherwise `~/.lite-apps`. Apps live under `apps/{token}`. The registry file is `app-registry.json` at that same root. Helper scripts in `scripts/` cover initialization, build, start, restart, restore, removal, metadata sync, and registry updates. Generated apps use a React + TypeScript + Vite frontend, an Express + TypeScript backend, and SQLite for local persistence.

## Structure

- `scripts/` - app lifecycle and registry utilities
- `references/` - stack, scaffold, and UI guidance
- `agents/` - agent configuration

## Common Commands

- `node scripts/init-app.js --userName <name> --token <token>`
- `node scripts/scaffold-app.js --userName <name> --token <token>`
- `node scripts/deploy-app.js --userName <name> --token <token>`
- `node scripts/status-app.js --userName <name> --token <token>`
- `node scripts/remove-app.js --userName <name> --token <token>`
- `node scripts/restore-apps.js --skipBuild`

## Notes

- Apps are served under `/<token>/`
- All LiteApps share the public port `33333`
- Each app process still uses its own internal port in `33334-39999`, routed through the shared host on `33333`
- Tokens must be globally unique across generated apps
- `app-registry.json` is stored at `.lite-apps/app-registry.json`
- Registry records include `name`, `token`, `local_path`, `port`, `internal_port`, `description`, `created_by`, `last_modified_by`, `created_at`, `last_modified_at`, and `is_disabled`
- In the registry, `name` is the same as `token`, and `created_by` is the owner user name
- Each user can only operate on apps registered under that same `userName`
- Runtime metadata is stored in each app's `APP-META.json`, `APP-NOTES.md`, and `.ai.md`
- `stop-app.js` sets `is_disabled=true`, which stops shared-host routing for that app
- `start-app.js` clears `is_disabled` back to `false` before returning the app to service
- The external URL template is always `http://you-host-name:33333/{token}/`
- Before modifying an existing generated app, read its `.ai.md`
