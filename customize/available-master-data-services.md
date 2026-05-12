# Available Master Data Services

Check this file before inventing a new master data integration for a LiteApp.

## Expected Selection Process

1. Read this file first when the user's request needs master data.
2. Reuse an existing service definition whenever the required dataset already exists.
3. Only add a new service when no listed service can satisfy the request.
4. When a service exists, access it through `window.master_data_aspect` in the generated app.

## Service Definition Shape

Each service should be registered into `createMasterDataService({ services: [...] })` with:

- `name`: unique service key used by the app
- `description`: human-readable purpose
- `baseUrl`: upstream platform base URL
- `accessKey`: OAuth client access key
- `secretKey`: OAuth client secret key
- `scope`: optional OAuth scope
- `requestPath`: API path relative to `apiUrl`

## Current Service Catalog

Add entries here when a shared service becomes reusable across multiple LiteApps.

- `employee-directory`: employee profile and organization lookup
- `product-catalog`: product master data, categories, and lifecycle status
- `supplier-registry`: supplier identity, qualification, and contact metadata
