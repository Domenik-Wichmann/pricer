# Pricer Admin/Test Web Console

Last updated: 2026-05-05

## Purpose

`app/admin-web` is a private developer console for exercising the Firebase Functions Express API before the consumer mobile app is polished. It is intentionally operational and unbranded: the first screen is a test workbench for backend requests, not a public product experience.

Admin Console V0 covers:

- `GET /` backend health and route inventory
- `GET /home/summary`
- `POST /products/search`
- `GET /products/:id`
- `GET /product-history?source_product_id=...`
- `POST /prices/lookup`
- `POST /shopping-intent/resolve`
- `POST /basket/optimize`
- `POST /internal/ingest/plan`, `POST /internal/ingest/jobs`, and `GET /internal/ingest/jobs`
- manual Raw API requests by method, path, and JSON body

The Product Search view renders the top returned products plus compact current-price summaries when the backend returns them: cheapest price, highest price, average price, offer count, and cheapest retailer/chain. It keeps the raw JSON response visible below the interpreted summary.

The Product Detail view renders the canonical id, name, brand/category hints, legacy deterministic markers, structured `size_marker` display/totals when returned by the backend, bounded current offers, and bounded source-product mappings. Offer and mapping rows include copy actions and a direct Price History launch that fills and runs the `source_product_id` lookup. The Price Lookup tab calls `/prices/lookup` for one or more canonical ids and shows request status/timing with the raw response.

The Shopping Intent tab calls `POST /shopping-intent/resolve` and is meant for deterministic resolver QA before product selection. It accepts query/item text, optional owner id, optional inline existing preference JSON, and optional selected-answer JSON. It includes example buttons for `yogurt`, `cheese`, `ÑÐ¸Ñ€ÐµÐ½Ðµ`, `juice`, `bread`, and `coffee`, then renders family resolution, ambiguity, clarification question/options, suggested defaults, readiness, preference record, status/timing, and the raw JSON response.

The Ingest / Data Jobs tab is planning-only for KolkoStruva ZIP snapshots. It shows the API base and Firestore target prefix, accepts a snapshot date, ZIP URL or local path, target collections, and dry-run flag, then generates copyable PowerShell commands for historical `npm run phase6:ingest-snapshot` and daily incremental `npm run phase6:diff-snapshot` dry-runs. Creating a job writes an `admin_ingest_jobs` record with `status = planned`; it does not upload a ZIP or run a long ingest in the browser or HTTPS function.

The same page also shows the read-only current-offer fingerprint baseline export command. That command reads `prod_current_product_offers` page-by-page and writes a compact local JSONL file for future `PRICER_INCREMENTAL_BASELINE_PATH` diff runs.

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

For a deployed Hosting build, the console defaults to the live `europe-west1` Functions API when no build-time override is provided. It also replaces a stale localhost API-base value in browser `localStorage` when served from `web.app` or `firebaseapp.com`. To pin the deployed API URL explicitly, set the build-time API URL before building:

```powershell
$env:VITE_PRICER_API_BASE_URL='https://europe-west1-pricer-ee440.cloudfunctions.net/api'
npm run admin-web:build
```

The in-app API base URL field can still override the build-time default in browser `localStorage`, except that hosted builds ignore localhost overrides because those cannot reach the live backend from an operator browser.

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

## Historical Snapshot CLI Runbook

Dry-run one historical ZIP/date first:

```powershell
$env:PRICER_SNAPSHOT_DATE="2026-04-21"; $env:PRICER_SNAPSHOT_ZIP_PATH="C:\dev\Pricer\data_samples\phase6_snapshot_2026-04-21.zip"; $env:PRICER_STORE_BACKEND="firestore"; $env:PRICER_FIRESTORE_PROJECT_ID="pricer-ee440"; $env:PRICER_FIRESTORE_DATABASE_ID="(default)"; $env:PRICER_FIRESTORE_COLLECTION_PREFIX="prod"; $env:PRICER_PHASE6_PUBLISH_DRY_RUN="true"; $env:PRICER_PHASE6_PUBLISH_COLLECTIONS="raw_price_snapshots,product_daily_prices,ingest_runs,pipeline_logs"; $env:ENABLE_LLM_ENRICHMENT="false"; $env:XAI_API_KEY=""; npm run phase6:ingest-snapshot
```

After reviewing the dry-run output, the equivalent real run is the same command with:

```powershell
$env:PRICER_PHASE6_PUBLISH_DRY_RUN="false"
```

Do not include `current_product_offers` or `canonical_current_offer_summary` for historical backfill unless the goal is explicitly to rebuild current/latest read models from a current selector.

## Daily Incremental Dry-Run Runbook

Use the diff command before any daily latest update. It writes nothing and reports scanned rows, new/changed/unchanged/missing offers, affected canonical summaries, estimated reads, estimated writes, and target collections.

```powershell
$env:PRICER_SNAPSHOT_DATE="2026-05-05"; $env:PRICER_SNAPSHOT_URL="https://kolkostruva.bg/opendata_files/2026-05-05.zip"; $env:PRICER_FIRESTORE_PROJECT_ID="pricer-ee440"; $env:PRICER_FIRESTORE_DATABASE_ID="(default)"; $env:PRICER_FIRESTORE_COLLECTION_PREFIX="prod"; $env:PRICER_INCREMENTAL_DRY_RUN="true"; $env:PRICER_INCREMENTAL_PROGRESS_EVERY="10000"; npm run phase6:diff-snapshot
```

For a full production-scale diff, provide an exported fingerprint baseline:

```powershell
$env:PRICER_INCREMENTAL_BASELINE_PATH="C:\dev\Pricer\runtime_data\prod_current_offer_fingerprints.jsonl"
```

Without a baseline, a full direct comparison can require one Firestore read per incoming offer. Use `PRICER_INCREMENTAL_LIMIT` for a bounded sample or explicitly set `PRICER_INCREMENTAL_ALLOW_FIRESTORE_DIRECT_COMPARE=true` only after reviewing read cost. The command never deletes records and does not perform the real incremental update yet.

Export the baseline:

```powershell
$env:PRICER_FIRESTORE_PROJECT_ID="pricer-ee440"; $env:PRICER_FIRESTORE_DATABASE_ID="(default)"; $env:PRICER_FIRESTORE_COLLECTION_PREFIX="prod"; $env:PRICER_INCREMENTAL_BASELINE_OUTPUT_PATH="C:\dev\Pricer\runtime_data\prod_current_offer_fingerprints.jsonl"; $env:PRICER_INCREMENTAL_PROGRESS_EVERY="10000"; npm run phase6:export-current-offer-fingerprints
```

The export command reads `current_product_offers`, writes a local JSONL file, and performs no Firestore writes. Set `PRICER_INCREMENTAL_BASELINE_LIMIT` for a bounded sample.

Optional fingerprint collection backfill is available but remains dry-run by default:

```powershell
$env:PRICER_FIRESTORE_PROJECT_ID="pricer-ee440"; $env:PRICER_FIRESTORE_DATABASE_ID="(default)"; $env:PRICER_FIRESTORE_COLLECTION_PREFIX="prod"; $env:PRICER_INCREMENTAL_BASELINE_OUTPUT_PATH="C:\dev\Pricer\runtime_data\prod_current_offer_fingerprints.jsonl"; $env:PRICER_INCREMENTAL_BASELINE_BACKFILL_FIRESTORE="true"; $env:PRICER_INCREMENTAL_BASELINE_BACKFILL_DRY_RUN="true"; npm run phase6:backfill-current-offer-fingerprints
```

## Latest Current-Price Publisher Progress Runbook

Use `npm run phase6:publish-firestore-latest` only for the latest/current Firestore read models. The command is an offline operator job, not an HTTPS function path, and it does not delete Firestore data.

Default dry-run command with progress logging:

```powershell
$env:PRICER_FIRESTORE_PROJECT_ID="pricer-ee440"
$env:PRICER_FIRESTORE_DATABASE_ID="(default)"
$env:PRICER_FIRESTORE_COLLECTION_PREFIX="prod"
$env:PRICER_PHASE6_PUBLISH_COLLECTIONS="current_product_offers,canonical_current_offer_summary"
$env:PRICER_PHASE6_PUBLISH_SKIP_EXISTING="true"
$env:PRICER_PHASE6_PUBLISH_DRY_RUN="true"
$env:ENABLE_LLM_ENRICHMENT="false"
$env:XAI_API_KEY=""
npm run phase6:publish-firestore-latest
```

The publisher writes timestamped progress logs to the console and keeps the final JSON summary on stdout. It logs start/end and elapsed time for config validation, latest snapshot resolution, ZIP cache/download, import/canonicalization, semantic enrichment, embeddings, daily aggregation, current-offer read-model build, each collection publish, and final summary.

Progress interval:

```powershell
$env:PRICER_PHASE6_PUBLISH_PROGRESS_EVERY="5000"
```

If `PRICER_PHASE6_PUBLISH_PROGRESS_EVERY` is missing, invalid, or non-positive, the script uses `10000` records. Smaller intervals make long Firestore writes feel more responsive but produce more console output and heartbeat writes.

Heartbeat files are written under:

```text
tmp/phase6_publish_logs/
```

Each run creates one JSON file named like:

```text
tmp/phase6_publish_logs/phase6_latest_2026-05-05_10-00-00-000Z.json
```

The heartbeat includes `run_id`, `started_at`, `updated_at`, `snapshot_date`, `current_phase`, `current_collection`, selected collections, `dry_run`, `skip_existing`, collection prefix, record totals, written/skipped/failed counts, `last_message`, `status`, and `finished_at` when complete. If the command fails, the file is updated with `status = "failed"` plus the error message/stack.

Manual Firestore count checks:

```powershell
node -e "const admin=require('firebase-admin/app'); const {getFirestore}=require('firebase-admin/firestore'); const app=admin.initializeApp({credential:admin.applicationDefault(), projectId:'pricer-ee440'}, 'count-check'); const db=getFirestore(app, '(default)'); Promise.all(['prod_current_product_offers','prod_canonical_current_offer_summary'].map(async c=>({collection:c,count:(await db.collection(c).count().get()).data().count}))).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.stack||e.message); process.exitCode=1;});"
```

How to tell whether a run is active:

- The console should show phase transitions or per-collection progress at least every `PRICER_PHASE6_PUBLISH_PROGRESS_EVERY` processed records during publish.
- The heartbeat file's `updated_at` should keep moving during long phases; during deep local build phases it updates at phase boundaries.
- For Firestore publish phases, `current_collection`, `records_written`, and/or `records_skipped` should advance.
- If `updated_at` is stale for much longer than the expected phase duration, check the Node process CPU/RAM and Firestore write counts before deciding whether to stop and resume.

Resume guidance:

- Keep `PRICER_PHASE6_PUBLISH_SKIP_EXISTING="true"` when resuming after an interrupted current-offer publish.
- Keep the target collection list narrow, for example `current_product_offers,canonical_current_offer_summary`, when completing a compact current-price model publish.
- After dry-run review, the real publish is the same command with `PRICER_PHASE6_PUBLISH_DRY_RUN="false"`.

## Known Limitations

- No Firebase Auth or admin claims yet; treat V0 as local/private only.
- Raw API supports method, path, and JSON body, but does not yet have a dedicated headers editor.
- GET and DELETE requests in Raw API intentionally ignore the JSON body.
- Ingest / Data Jobs does not process large ZIPs in the browser and does not start a worker. Use the generated CLI command from an operator shell.
- Incremental diff cost estimates are complete only when a local fingerprint baseline or an explicitly allowed direct comparison is available.
- Historical ingest defaults to dry-run and archive/history/log collections. Current read models remain separate from price history.
- The console does not mutate mobile UI and does not add consumer-facing UX.
- Runtime data status is currently represented by the backend health route and response envelopes; collection-level ingest/debug views are future work.
- Product detail source mappings are bounded by the backend response limit; use backend/operator tools for exhaustive mapping exports.

## Next Recommended Phase

Admin Console V1 should add admin auth/protection, a reusable headers/token editor, runtime collection counts, ingest-run and pipeline-log views, saved request presets, and endpoint-specific helpers for location review and internal analytics.
