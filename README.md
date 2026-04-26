# Noodle Classifier

A web app for cataloging and browsing instant noodle products. Users can search, filter, and browse noodles. The owner can add and edit products, including barcode scanning with auto-fill from OpenFoodFacts.

**Stack:** Static frontend (HTML/CSS/JS) + Azure Functions (Node.js) + Azure Cosmos DB
**Deployed on:** Azure Static Web Apps

---

## Project Structure

```
noodle-classifier/
├── index.html              # Frontend entry point
├── assets/
│   ├── css/style.css       # Styles
│   └── js/
│       ├── auth.js         # Auth: token handling, dropdown, profile overlay
│       ├── app.js          # Tab navigation, overlays, Noodle of the Day
│       ├── list.js         # Listing, sorting, filtering
│       ├── search.js       # Search with 300ms debounce
│       └── add.js          # Add form, barcode scanning, OpenFoodFacts integration
├── api/                    # Azure Functions backend
│   ├── host.json           # Functions runtime config (extension bundle)
│   ├── package.json        # Node.js dependencies
│   └── src/functions/
│       ├── noodles.js      # GET / POST / PUT /api/noodles (write ops require owner JWT)
│       └── auth.js         # OAuth login: GitHub + Google, JWT issuance
└── tests/
    └── test-noodle.js      # Manual integration test (creates a test entry)
```

---

## Authentication

The app uses custom OAuth (GitHub and Google) implemented via Azure Functions. There is no dependency on Azure SWA's built-in auth — the flow runs on the free plan.

### How it works

1. User clicks the profile icon (top-right) → dropdown opens
2. User chooses **Login with GitHub** or **Login with Google**
3. They are redirected to the provider's OAuth page
4. On success, the backend exchanges the code for a user profile, signs a JWT, and redirects to `/#token=<jwt>`
5. The frontend stores the JWT in `localStorage` and reads the user's name, avatar, and `isOwner` flag from it
6. Tokens expire after 7 days

### Owner access

One user is designated as owner via environment variables. The owner gets access to:
- The **Add** tab (create/edit noodles)
- The **edit button** on noodle cards

Everyone else (logged in or not) can only browse.

### Auth endpoints

| Route | Description |
|---|---|
| `GET /api/auth` | Redirect to GitHub OAuth |
| `GET /api/auth/callback` | GitHub OAuth callback — issues JWT |
| `GET /api/auth/google` | Redirect to Google OAuth |
| `GET /api/auth/google/callback` | Google OAuth callback — issues JWT |

---

## Environment Variables

Set these in **Azure Portal → Static Web App → Configuration → Application settings**.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_CONNECTION_STRING` | Yes | Cosmos DB primary connection string |
| `GITHUB_CLIENT_ID` | Yes | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | Yes | GitHub OAuth App client secret |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `JWT_SECRET` | Yes | Random secret used to sign tokens (any long string) |
| `OWNER_GITHUB_USERNAME` | Yes | GitHub username of the owner (case-sensitive) |
| `OWNER_EMAIL` | Yes | Gmail address of the owner (for Google login) |
| `APP_URL` | Yes | Deployed app URL, no trailing slash — e.g. `https://your-app.azurestaticapps.net` |

For local development, create `api/local.settings.json` (gitignored):

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "DATABASE_CONNECTION_STRING": "AccountEndpoint=https://...",
    "GITHUB_CLIENT_ID": "...",
    "GITHUB_CLIENT_SECRET": "...",
    "GOOGLE_CLIENT_ID": "...",
    "GOOGLE_CLIENT_SECRET": "...",
    "JWT_SECRET": "...",
    "OWNER_GITHUB_USERNAME": "...",
    "OWNER_EMAIL": "...",
    "APP_URL": "http://localhost:4280"
  }
}
```

---

## OAuth App Setup

### GitHub

1. Go to [github.com/settings/developers](https://github.com/settings/developers) → **OAuth Apps** → **New OAuth App**
2. Set **Authorization callback URL** to `https://<your-app>/api/auth/callback`
3. Copy the Client ID and Client Secret into Azure env vars

### Google

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
2. Application type: **Web application**
3. Add **Authorised redirect URI**: `https://<your-app>/api/auth/google/callback`
4. Go to **OAuth consent screen** → configure app name and add your email as a test user
5. Copy the Client ID and Client Secret into Azure env vars

---

## API Reference

### GET /api/noodles

Returns all noodles. Supports optional query parameters:

| Parameter | Description |
|---|---|
| `id` | Fetch a single noodle by its ID |
| `search` | Case-insensitive search across `name` and `brand` |

### POST /api/noodles *(owner only)*

Create a new noodle. Requires `Authorization: Bearer <token>` header. Returns `201`.

### PUT /api/noodles *(owner only)*

Upsert (create or update) a noodle. Requires `Authorization: Bearer <token>` header.

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

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Barcode or unique product ID |
| `name` | `string` | Product name |
| `brand` | `string` | Brand name |
| `price` | `number` | Price (local currency) |
| `rating` | `number` (0–5) | Quality rating |
| `spicy` | `number` (0–5) | Spice level |
| `hasSoup` | `boolean` | Whether the product includes soup |
| `description` | `string` | Free-text description |
| `keywords` | `string[]` | Search tags |
| `image` | `string` | URL or filename of product image |

---

## Cosmos DB Setup

The function connects to a Cosmos DB database named `noodles`, container `packages`, partitioned by `/id`.

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

## Local Development

```bash
cd api && npm install
# create api/local.settings.json (see above)
npm start        # runs: func start — API at http://localhost:7071
```

Serve the frontend with [VS Code Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) or the [Azure Static Web Apps CLI](https://azure.github.io/static-web-apps-cli/) (`swa start`) for full local auth testing.

---

## Deployment

Pushes to `main` trigger the GitHub Actions workflow (`.github/workflows/`) which deploys to Azure Static Web Apps automatically. The pipeline runs `npm install` in `api/` and deploys both the static frontend and the functions.

---

## Tests

`tests/test-noodle.js` is a manual integration script that writes a test entry to Cosmos DB:

```bash
node tests/test-noodle.js
```

---

## License

MIT
