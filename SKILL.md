---
name: develop-and-deploy-web-app
description: Build and preview governed OpenClaw lightweight web apps with shared platform users, Basic authentication, Express, NeDB, React, Ant Design Pro, and ECharts. Use when a user asks for a 轻应用, LiteApp, data-entry app, approval app, rule-calculation app, or small internal web app that must be scaffolded and previewed locally.
metadata:
  openclaw:
    requires:
      bins:
        - node
    emoji: "web"
---

# Develop And Deploy Web App

This skill builds OpenClaw lightweight web apps from a governed scaffold.

The source of truth is `docs/design.md`.

Use these references when implementing or updating the skill:

- `references/stack.md`
- `references/scaffold.md`
- `references/scripts.md`
- `references/autoload.md`
- `references/ui-style.md`

The primary audience is non-IT business users. Generated apps should contain
business workspaces for data entry, fixed-rule calculation, filtering,
collaboration, and database persistence.

## Platform Contract

- Store users once at platform level so every app can use the same account.
- Support self-registration.
- Support one authentication mechanism across apps:
  - session token
  - Bearer token
  - Basic auth
- Isolate app pages under `/{token}/`.
- Isolate app data under the app directory.
- Serve previews through the shared host at `http://you-host-name:33333/{token}/`.

## Scaffold Contract

Generated apps must include:

- Express server.
- NeDB data stores.
- React frontend.
- Ant Design Pro components.
- ECharts for data visualization.
- Normal app pages show the current user's own records and business filters.
- Fixed business rules are calculated deterministically by the server and may be previewed in the UI.
- Submitted data is stored in the app's NeDB `records.db`.
- Payload schema versioning with read-time migration hooks.

## Developer Interaction

Before scaffolding or extending an app, guide the developer to state non-functional requirements, especially:

- target business process
- required form fields
- fixed calculation rules
- common filters and status flow
- collaboration roles
- authentication expectations
- current-user data visibility rules
- schema evolution expectations
- preview availability

If the user does not provide these details, use the secure defaults in the scaffold and record the assumptions in `APP-NOTES.md`, the agent notes file `.ai.md`, and `NON_FUNCTIONAL_REQUIREMENTS.md`.

## Workflow

1. Inspect the workspace.
2. Resolve the LiteApp root:
   - `PLATFORM_DATA_ROOT/.lite-apps` when `PLATFORM_DATA_ROOT` is set
   - otherwise `~/.lite-apps`
3. Create app metadata with `scripts/init-app.js`.
4. Scaffold from `templates/openclaw-liteapp` with `scripts/scaffold-app.js`.
5. Install, build, and start with `scripts/deploy-app.js`.
6. Verify:
   - `/{token}/api/health`
   - self-registration
   - Basic auth
   - normal-user data isolation
   - fixed-rule calculation
   - local business filtering
   - data stored in `records.db`
   - final preview URL

## Required Final Block

Always finish app delivery with these four fields:

`Id: {token}`
`Name: {appName}`
`Description: {appSummary}`
`Url template: http://you-host-name:33333/{token}/`
