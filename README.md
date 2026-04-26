# Noodle Classifier

A web app for cataloging and browsing instant noodle products. Users can search, filter, and add new products — including barcode scanning with auto-fill from OpenFoodFacts.

**Stack:** Static frontend (HTML/CSS/JS) + Azure Functions (Node.js) + Azure Cosmos DB

---

## Project Structure

```
noodle-classifier/
├── index.html              # Frontend entry point
├── assets/
│   ├── css/style.css       # Styles
│   └── js/
│       ├── app.js          # Tab navigation, overlays, Noodle of the Day
│       ├── list.js         # Listing, sorting, filtering
│       ├── search.js       # Search with 300ms debounce
│       └── add.js          # Add form, barcode scanning, OpenFoodFacts integration
├── api/                    # Azure Functions backend
│   ├── host.json           # Functions runtime config (extension bundle)
│   ├── package.json        # Node.js dependencies
│   └── src/functions/
│       └── noodles.js      # HTTP function: GET / POST / PUT /api/noodles
└── tests/
    └── test-noodle.js      # Manual integration test (creates a test entry)
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
cd api
npm install
```

### 2. Configure environment

Create `api/local.settings.json` (this file is gitignored and only used locally):

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

> The `DATABASE_CONNECTION_STRING` is a Cosmos DB connection string. You can copy it from the Azure Portal under your Cosmos DB account > **Keys** > **Primary Connection String**.

### 3. Start the API

```bash
cd api
npm start        # runs: func start
```

The API will be available at `http://localhost:7071/api/noodles`.

### 4. Serve the frontend

Open `index.html` directly in a browser, or use the [VS Code Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension.

### Debugging in VS Code

Press **F5** — the pre-configured launch task starts `func host start` and attaches the Node.js debugger on port 9229.

---

## API Reference

All endpoints are served at `/api/noodles` with `authLevel: anonymous`.

### GET /api/noodles

Returns all noodles.

**Query parameters:**

| Parameter | Description |
|-----------|-------------|
| `id`      | Fetch a single noodle by its ID |
| `search`  | Case-insensitive search across `name` and `brand` |

```bash
# All noodles
GET /api/noodles

# Search
GET /api/noodles?search=indomie

# By ID
GET /api/noodles?id=8991701051148
```

### POST /api/noodles

Create a new noodle. Returns `201` with the created document.

```bash
POST /api/noodles
Content-Type: application/json

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

### PUT /api/noodles

Upsert (create or update) a noodle. Same body as POST.

---

## Data Model

| Field         | Type             | Description                      |
|---------------|------------------|----------------------------------|
| `id`          | `string`         | Barcode or unique product ID     |
| `name`        | `string`         | Product name                     |
| `brand`       | `string`         | Brand name                       |
| `price`       | `number`         | Price (local currency)           |
| `rating`      | `number` (0–5)   | Quality rating                   |
| `spicy`       | `number` (0–5)   | Spice level                      |
| `hasSoup`     | `boolean`        | Whether the product includes soup|
| `description` | `string`         | Free-text description            |
| `keywords`    | `string[]`       | Search tags                      |
| `image`       | `string`         | URL or filename of product image |

---

## Cosmos DB Setup

The function connects to a Cosmos DB database named `noodles`, container `packages`.

Create these in the Azure Portal or with the Azure CLI:

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

## Azure Functions Configuration

### host.json

```json
{
  "version": "2.0",
  "extensionBundle": {
    "id": "Microsoft.Azure.Functions.ExtensionBundle",
    "version": "[4.*, 5.0.0)"
  }
}
```

**Extension Bundle** — Instead of manually installing individual Azure Functions binding extensions (HTTP, Timer, Cosmos DB trigger, etc.), the runtime downloads a pre-tested bundle of compatible extensions. The version range `[4.*, 5.0.0)` means "latest 4.x bundle, but not 5.0 or higher". The runtime updates the bundle automatically on startup within this range.

See the [official documentation](https://learn.microsoft.com/en-us/azure/azure-functions/extension-bundles) for available bundle versions and the extensions each one includes.

### Runtime

- **Runtime version:** `~4` (Azure Functions v4)
- **Language:** JavaScript (Node.js v4 programming model)
- **Auth level:** `anonymous` — no API key required

---

## Deployment

The `api/` subdirectory is the deployable unit. The VS Code [Azure Functions extension](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-azurefunctions) is pre-configured (see `.vscode/settings.json`):

1. Open the Azure Functions panel in VS Code.
2. Click **Deploy to Function App**.
3. Set `DATABASE_CONNECTION_STRING` in the Function App's **Application Settings** (Azure Portal > Function App > Configuration).

Pre-deploy, dev dependencies are pruned automatically (`npm prune --production`).

---

## Tests

`tests/test-noodle.js` is a manual integration script that writes a test entry to Cosmos DB. It requires a `.env` file at the repo root (not `local.settings.json`):

```bash
node tests/test-noodle.js
```

---

## License

MIT — see [LICENSE](LICENSE).
