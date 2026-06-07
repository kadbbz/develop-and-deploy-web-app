# __APP_TITLE__

__APP_GOAL__

## Platform Contract

- Public base path: `/__TOKEN__/`
- API base path: `/__TOKEN__/api`
- Application owner: `__OWNER_USERNAME__`
- App data store: `server/data/records.db`
- Shared user store: `PLATFORM_DATA_ROOT/.lite-apps/platform/users.db` when `PLATFORM_DATA_ROOT` is set, otherwise `~/.lite-apps/platform/users.db`

## Authentication

Users can self-register through `/__TOKEN__/api/auth/register`.
Requests can authenticate with either:

- `x-openclaw-session: <sessionToken>`
- `Authorization: Bearer <sessionToken>`
- `Authorization: Basic <base64(username:password)>`

The app owner account is seeded on startup. Set `OPENCLAW_OWNER_PASSWORD` before first start to control the initial owner password.

## Business Workspace

Normal app pages are for data entry, deterministic rule calculation, status updates, and current-user filtering. Users can only read and mutate records they created. Submitted records are stored in `server/data/records.db`.
