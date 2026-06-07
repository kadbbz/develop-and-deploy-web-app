# develop-and-deploy-web-app

OpenClaw skill for developing and previewing governed lightweight web apps.

The original requirements live in `docs/design.md`. The refactored implementation centers on a single default scaffold:

- Server: Express
- Database: NeDB via `@seald-io/nedb`
- Frontend: React
- UI: Ant Design Pro
- Charts: ECharts

## What The Scaffold Provides

- Shared platform user store
- Self-registration
- Session, Bearer, and Basic authentication
- App-isolated pages under `/{token}/`
- App-isolated NeDB data files
- Business-user workspace for collaborative data entry
- Deterministic rule calculation and business filtering inside the app
- User-owned record visibility for normal app pages
- Submitted data stored in `records.db`
- Payload schema versioning for compatible data changes
- Preview URL through the shared host: `http://you-host-name:33333/{token}/`

## Structure

- `templates/openclaw-liteapp/` - default governed app template
- `scripts/` - app initialization, scaffolding, deployment, shared-host routing, and registry utilities
- `customize/login-service.js` - shared NeDB platform authentication service copied into generated apps
- `docs/design.md` - source requirements
- `references/` - implementation notes for stack, scripts, and UI

## Common Commands

```bash
node scripts/init-app.js --userName <name> --token <TOKEN> --title <title> --goal <goal> --nfr <summary>
node scripts/scaffold-app.js --userName <name> --token <TOKEN>
node scripts/deploy-app.js --userName <name> --token <TOKEN>
node scripts/status-app.js --userName <name> --token <TOKEN>
node scripts/stop-app.js --userName <name> --token <TOKEN>
node scripts/remove-app.js --userName <name> --token <TOKEN>
```

## Runtime Layout

Apps are stored under:

- `PLATFORM_DATA_ROOT/.lite-apps/apps/{token}` when `PLATFORM_DATA_ROOT` is set
- otherwise `~/.lite-apps/apps/{token}`

The shared platform user database is stored at:

- `PLATFORM_DATA_ROOT/.lite-apps/platform/users.db`
- otherwise `~/.lite-apps/platform/users.db`

All previews are routed through public port `33333`.
