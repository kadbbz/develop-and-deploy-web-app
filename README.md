# develop-and-deploy-web-app

A local toolkit for scaffolding, running, and managing small full-stack web apps inside this repository.

It stores generated LiteApps under a shared root at `PLATFORM_DATA_ROOT/.lite-apps` when `PLATFORM_DATA_ROOT` is set, otherwise `~/.lite-apps`. Apps live under `apps/{token}`. The registry file is `app-registry.json` at that same root. Helper scripts in `scripts/` cover initialization, build, start, restart, restore, removal, metadata sync, and registry updates. Generated apps use a React + TypeScript + Vite frontend, an Express + TypeScript backend, and SQLite for local persistence.

## Structure

- `scripts/` - app lifecycle and registry utilities
- `customize/` - deploy-time templates for runtime customize modules and markdown guides
- `templates/` - reusable app templates; each template must be discovered through its `readme.md`
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
- Before creating a new app, inspect `templates/*/readme.md` and choose the closest template
- Tokens must be globally unique across generated apps
- `app-registry.json` is stored at `.lite-apps/app-registry.json`
- Runtime customize overrides are loaded from `.lite-apps/customize`
- `login-service.js` and `master-data-service.js` are copied into generated apps under `server/customize/` when present in `.lite-apps/customize`
- `available-master-data-services.md` and `style-intro.md` are copied into the generated app root when present in `.lite-apps/customize`
- Unless the user explicitly asks for anonymous access, generated LiteApps should use the scaffolded `window.login_aspect` contract for authentication
- When master data is needed, check `available-master-data-services.md` first and use the scaffolded `window.master_data_aspect` contract if a matching service exists
- When `style-intro.md` is present in the generated app, treat it as the local UI contract together with `references/ui-style.md`
- Registry records include `name`, `token`, `local_path`, `port`, `internal_port`, `description`, `created_by`, `last_modified_by`, `created_at`, `last_modified_at`, and `is_disabled`
- In the registry, `name` is the same as `token`, and `created_by` is the owner user name
- Each user can only operate on apps registered under that same `userName`
- Runtime metadata is stored in each app's `APP-META.json`, `APP-NOTES.md`, and `.ai.md`
- `stop-app.js` sets `is_disabled=true`, which stops shared-host routing for that app
- `start-app.js` clears `is_disabled` back to `false` before returning the app to service
- The external URL template is always `http://you-host-name:33333/{token}/`
- Before modifying an existing generated app, read its `.ai.md`
