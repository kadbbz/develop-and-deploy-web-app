# develop-and-deploy-web-app

A local toolkit for scaffolding, running, and managing small full-stack web apps inside this repository.

It is built around session-scoped app workspaces under `workspaces/web-apps/`, with helper scripts in `scripts/` for initialization, build, start, restart, restore, metadata sync, and registry updates. Generated apps use a React + TypeScript + Vite frontend, an Express + TypeScript backend, and SQLite for local persistence.

## Structure

- `scripts/` - app lifecycle and registry utilities
- `workspaces/web-apps/` - generated app workspaces
- `references/` - stack, scaffold, and UI guidance
- `agents/` - agent configuration

## Common Commands

- `node scripts/init-app.js --sessionId <id> --token <token>`
- `node scripts/scaffold-app.js --sessionId <id> --token <token>`
- `node scripts/deploy-app.js --sessionId <id> --token <token>`
- `node scripts/status-app.js --sessionId <id> --token <token>`
- `node scripts/restore-apps.js --skipBuild`

## Notes

- Apps are served under `/<sessionId>/<token>/`
- Runtime metadata is stored in `APP-META.json`, `APP-NOTES.md`, and registry files under `workspaces/web-apps/`
