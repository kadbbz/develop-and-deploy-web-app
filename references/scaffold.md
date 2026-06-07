# Scaffold Guide

The default scaffold is `templates/openclaw-liteapp`.

`scripts/scaffold-app.js` copies the template into the target app directory, replaces token/title/owner placeholders, and injects `customize/login-service.js` into `server/customize/login-service.js`.

## Template Requirements

The template must include:

- Express server in `server/src/index.ts`
- NeDB store for records
- shared platform login service
- React app in `client/src/App.tsx`
- Ant Design Pro UI
- ECharts status chart
- business data-entry form
- fixed-rule calculation preview
- current-user record filtering
- `NON_FUNCTIONAL_REQUIREMENTS.md`
- generated `README.md`

## Generated App Commands

```bash
npm --prefix client install
npm --prefix server install
npm run build
npm run start
```

The root `package.json` delegates build/start to the `client` and `server` packages.
