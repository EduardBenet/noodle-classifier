# Noodle Classifier

A web app for cataloging and browsing instant noodle products. Users can search, filter, and add new products — including barcode scanning with auto-fill from OpenFoodFacts.

**Stack:** [Eleventy](https://www.11ty.dev/) (SSG) + Azure Static Web Apps + Azure Functions (Node.js) + Azure Cosmos DB

---

## Project Structure

```
noodle-classifier/
├── src/                        # Source files (input to Eleventy)
│   ├── index.html              # Home page (Noodle of the Day + manifesto)
│   ├── list.html               # Browse & search noodles (public)
│   ├── add.html                # Add/edit noodles (authenticated only)
│   ├── staticwebapp.config.json # Azure SWA route protection + auth config
│   ├── _includes/
│   │   ├── base.html           # Shared HTML shell (layout)
│   │   └── header.html         # Sticky header with nav burger + auth widget
│   └── assets/
│       ├── css/style.css
│       └── js/
│           ├── home.js         # Noodle of the Day logic
│           ├── list.js         # Listing, sorting, pagination
│           ├── search.js       # Search with 300ms debounce
│           ├── add.js          # Add form, barcode scanning, OpenFoodFacts
│           └── auth.js         # Auth widget + burger menu
├── _site/                      # Eleventy build output (gitignored, served by SWA)
├── .eleventy.js                # Eleventy config
├── package.json                # Root — Eleventy dev dependency + build scripts
├── api/                        # Azure Functions backend
│   ├── host.json
│   ├── package.json
│   └── src/functions/
│       └── noodles.js          # HTTP function: GET / POST / PUT /api/noodles
└── tests/
    └── test-noodle.js          # Manual integration test
```

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Azure Functions Core Tools](https://learn.microsoft.com/en-us/azure/azure-functions/functions-run-local) v4
- An [Azure Cosmos DB](https://azure.microsoft.com/en-us/products/cosmos-db) account

---

## Local Development

### 1. Install dependencies

```bash
# Root (Eleventy)
npm install

# API
cd api && npm install
```

### 2. Configure environment

Create `api/local.settings.json` (gitignored, local only):

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "DATABASE_CONNECTION_STRING": "AccountEndpoint=https://<your-account>.documents.azure.com:443/;AccountKey=<your-key>=="
  }
}
```

> Copy `DATABASE_CONNECTION_STRING` from the Azure Portal: Cosmos DB account → **Keys** → **Primary Connection String**.

### 3. Build the frontend

```bash
npm run build       # one-off build → outputs to _site/
npm run dev         # build + watch + local dev server (hot reload)
```

Eleventy serves the dev server at `http://localhost:8080`. The `_site/` directory is the build output and is gitignored.

### 4. Start the API

```bash
cd api
npm start           # runs: func start
```

The API will be available at `http://localhost:7071/api/noodles`.

> **Note:** when running locally via `npm run dev`, API calls to `/api/noodles` won't resolve unless you also run the Functions host. For read-only browsing the frontend works standalone; write operations require the API.

### Debugging in VS Code

Press **F5** — the pre-configured launch task starts `func host start` and attaches the Node.js debugger on port 9229.

---

## How Eleventy Works Here

[Eleventy](https://www.11ty.dev/) (11ty) is a static site generator used to eliminate repeated HTML across pages. The key ideas:

- **Input:** `src/` — HTML files with [Nunjucks](https://mozilla.github.io/nunjucks/) templating
- **Output:** `_site/` — plain static HTML ready to serve
- **Layouts:** `src/_includes/base.html` wraps every page with the shared `<head>`, header, and footer scripts
- **Includes:** `src/_includes/header.html` is the shared sticky nav, included once by the layout
- **Front matter:** each page declares its layout, title, active nav item, and which JS files to load:

```yaml
---
layout: base.html
title: "Add Noodle 🍜"
currentPage: "add"
loginRedirect: "/add.html"
localScripts:
  - assets/js/add.js
---
```

- **Passthrough copy:** `assets/` and `staticwebapp.config.json` are copied to `_site/` as-is
- **Config:** `.eleventy.js` at the repo root

---

## Authentication

Authentication is handled by Azure Static Web Apps built-in auth (no custom code):

- **GitHub** and **Entra ID (AAD)** are configured as providers
- The `/add` and `/add.html` routes are restricted to `authenticated` role in `staticwebapp.config.json`; unauthenticated requests are redirected to Entra ID login
- The auth widget in the header reads `/.auth/me` to determine login state
- Post-login/logout redirects are controlled per-page via the `loginRedirect` / `logoutRedirect` front matter variables

---

## API Reference

All endpoints are served at `/api/noodles` with `authLevel: anonymous` (Azure SWA enforces auth at the route level before requests reach the function).

### GET /api/noodles

Returns all noodles, or a filtered subset.

| Parameter | Description |
|-----------|-------------|
| `id`      | Fetch a single noodle by its ID |
| `search`  | Case-insensitive search across `name` and `brand` |

```bash
GET /api/noodles
GET /api/noodles?search=indomie
GET /api/noodles?id=8991701051148
```

### POST /api/noodles

Create a new noodle. Requires authentication (`x-ms-client-principal` header, injected by SWA). Returns `201`.

### PUT /api/noodles

Upsert an existing noodle. Same auth requirement and body shape as POST.

```json
{
  "id": "8991701051148",
  "name": "Mi Goreng",
  "brand": "Indomie",
  "price": 0.35,
  "rating": 5,
  "spicy": 3,
  "hasSoup": false,
  "description": "Classic Indonesian fried noodles.",
  "keywords": ["fried", "indonesian"],
  "image": "https://..."
}
```

---

## Data Model

| Field         | Type           | Description                       |
|---------------|----------------|-----------------------------------|
| `id`          | `string`       | Barcode or unique product ID      |
| `name`        | `string`       | Product name                      |
| `brand`       | `string`       | Brand name                        |
| `price`       | `number`       | Price in GBP                      |
| `rating`      | `number` (0–5) | Quality rating                    |
| `spicy`       | `number` (0–5) | Spice level                       |
| `hasSoup`     | `boolean`      | Whether the product includes soup |
| `description` | `string`       | Free-text description             |
| `keywords`    | `string[]`     | Search tags                       |
| `image`       | `string`       | URL or filename of product image  |

---

## Cosmos DB Setup

Database: `noodles`, container: `packages`, partition key: `/id`.

```bash
az cosmosdb create --name <account-name> --resource-group <rg>
az cosmosdb sql database create --account-name <account-name> --name noodles
az cosmosdb sql container create \
  --account-name <account-name> \
  --database-name noodles \
  --name packages \
  --partition-key-path "/id"
```

---

## Deployment

The app is deployed via the [Azure Static Web Apps GitHub Action](https://docs.microsoft.com/en-us/azure/static-web-apps/github-actions-workflow):

- `app_location: "/"` — repo root (where `package.json` and `.eleventy.js` live)
- `output_location: "_site"` — Eleventy's build output
- `api_location: "api"` — Azure Functions source

The Oryx build system detects `package.json` at the root, runs `npm run build` (which runs `eleventy`), and serves `_site/`.

Set `DATABASE_CONNECTION_STRING` in the Function App's **Application Settings** (Azure Portal → Function App → Configuration).

---

## Tests

`tests/test-noodle.js` is a manual integration script that writes a test entry to Cosmos DB. Requires a `.env` file at the repo root:

```bash
node tests/test-noodle.js
```

---

## License

MIT — see [LICENSE](LICENSE).
