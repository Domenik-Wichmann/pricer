# Pricer Admin/Test Web Console

Last updated: 2026-05-03

## Purpose

`app/admin-web` is a private developer console for exercising the Firebase Functions Express API before the consumer mobile app is polished. It is intentionally operational and unbranded: the first screen is a test workbench for backend requests, not a public product experience.

Admin Console V0 covers:

- `GET /` backend health and route inventory
- `POST /products/search`
- `GET /products/:id`
- `GET /product-history?source_product_id=...`
- `POST /basket/optimize`
- manual Raw API requests by method, path, and JSON body

TODO: add Firebase Auth, custom claims, or an equivalent private admin gate before exposing this console beyond trusted developer environments.

## Local Development

Install dependencies once:

```powershell
npm install
npm --prefix app/admin-web install
```

Run the admin app locally:

```powershell
npm run admin-web:dev
```

The Vite dev server runs at:

```text
http://127.0.0.1:5173
```

Build the static Hosting artifact:

```powershell
npm run admin-web:build
```

Preview the built app:

```powershell
npm run admin-web:preview
```

## Point At The Local Emulator API

Start Functions, Firestore, and Hosting emulators from the repo root:

```powershell
$env:PRICER_STORE_BACKEND='json'
$env:PRICER_STATE_FILE='C:\dev\Pricer\runtime_data\state.json'
npx -y firebase-tools@latest emulators:start --only functions,firestore,hosting --project pricer-ee440
```

Set the admin web API base URL with either `.env.local`:

```powershell
Set-Content -Path app/admin-web/.env.local -Value 'VITE_PRICER_API_BASE_URL=http://127.0.0.1:5001/pricer-ee440/europe-west1/api'
```

or paste this into the console's API base URL field:

```text
http://127.0.0.1:5001/pricer-ee440/europe-west1/api
```

When served by the Firebase Hosting emulator, the console is available at:

```text
http://127.0.0.1:5000
```

## Point At Deployed Functions

For the current Firebase project and `europe-west1` Functions region, use:

```text
https://europe-west1-pricer-ee440.cloudfunctions.net/api
```

For a deployed Hosting build, set the build-time API URL before building:

```powershell
$env:VITE_PRICER_API_BASE_URL='https://europe-west1-pricer-ee440.cloudfunctions.net/api'
npm run admin-web:build
```

The in-app API base URL field can still override the build-time default in browser `localStorage`.

## Firebase Hosting Deploy

Build and deploy only Hosting:

```powershell
$env:VITE_PRICER_API_BASE_URL='https://europe-west1-pricer-ee440.cloudfunctions.net/api'
npm run admin-web:build
npx -y firebase-tools@latest deploy --only hosting --project pricer-ee440
```

Deploying Hosting does not deploy Functions. Use the existing Functions deploy command separately when backend code changes:

```powershell
npx -y firebase-tools@latest deploy --only functions --project pricer-ee440
```

## Known Limitations

- No Firebase Auth or admin claims yet; treat V0 as local/private only.
- Raw API supports method, path, and JSON body, but does not yet have a dedicated headers editor.
- GET and DELETE requests in Raw API intentionally ignore the JSON body.
- The console does not mutate mobile UI and does not add consumer-facing UX.
- Runtime data status is currently represented by the backend health route and response envelopes; collection-level ingest/debug views are future work.

## Next Recommended Phase

Admin Console V1 should add admin auth/protection, a reusable headers/token editor, runtime collection counts, ingest-run and pipeline-log views, saved request presets, and endpoint-specific helpers for location review and internal analytics.
