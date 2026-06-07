# Stack Guide

Use this stack for every generated OpenClaw lightweight app unless the user explicitly asks for a different implementation.

## Required Stack

- Server: Express + TypeScript
- Database: NeDB through `@seald-io/nedb`
- Frontend: React + TypeScript
- UI components: Ant Design Pro
- Charts: ECharts

## Required Runtime Shape

```text
.
|-- client/
|-- server/
|-- NON_FUNCTIONAL_REQUIREMENTS.md
|-- README.md
`-- package.json
```

## Platform Data

- Shared users live in `PLATFORM_DATA_ROOT/.lite-apps/platform/users.db` or `~/.lite-apps/platform/users.db`.
- App records live under the generated app directory.

## Server Defaults

Expose these routes under `/{token}/api`:

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/session`
- `POST /auth/logout`
- `GET /schema`
- `GET /records`
- `POST /records`
- `PATCH /records/:id`
- `DELETE /records/:id`
- `GET /stats`

Authentication must accept:

- `x-openclaw-session`
- `Authorization: Bearer ...`
- `Authorization: Basic ...`

## Data Visibility Defaults

- Normal app pages and record APIs expose the current user's own records.
- Submitted records must be persisted to NeDB `records.db`.

## Business Workspace Defaults

- Generated apps should serve non-IT business users.
- Prefer concrete forms, fixed-rule calculations, status flow, and business filters.
- Keep deterministic calculations in the server; the frontend may preview the same result.

## Compatibility Defaults

- Store record payloads with a schema version.
- Keep a read-time migration hook even when the first version has no migrations.
- Expose the current schema contract through `/schema`.
