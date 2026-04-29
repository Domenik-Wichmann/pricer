# Verification Report

## Status
The backend persistence upgrade is implemented and verified locally. The repo now supports Firestore-backed production persistence while retaining JSON-file and in-memory backends for local development and tests. The Firebase deployment root is now present at the repo root, the Cloud Functions package is self-contained under `functions/`, and the `api` function deploys successfully from `C:\dev\Pricer`.

## Commands Run
- `npm install`
  Result:
  `added 181 packages, and audited 185 packages in 35s`
  `8 low severity vulnerabilities`
- `npm run test:phase11`
  Result:
  `Phase 11 tests: 3 passed, 0 failed, 3 total`
- `npm run test:phase1`
  Result:
  `Phase tests: 17 passed, 0 failed, 17 total`
- `npm run test:phase10`
  Result:
  `Phase 10 tests: 6 passed, 0 failed, 6 total`
- `npm run test:phase2`
  Result:
  `Phase 2 tests: 7 passed, 0 failed, 7 total`
- `npm run test:phase3`
  Result:
  `Phase 3 tests: 5 passed, 0 failed, 5 total`
- `npm run test:phase3_5`
  Result:
  `Phase 3.5 tests: 4 passed, 0 failed, 4 total`
- `npm run test:phase4`
  Result:
  `Phase 4 tests: 7 passed, 0 failed, 7 total`
- `npm run test:phase7`
  Result:
  `Phase 7 tests: 6 passed, 0 failed, 6 total`
- `npm run test:phase8`
  Result:
  `Phase 8 tests: 6 passed, 0 failed, 6 total`
- `npm run test:phase9`
  Result:
  `Phase 9 tests: 6 passed, 0 failed, 6 total`
- `npm run test:phase12`
  Result:
  `Phase 12 tests: 5 passed, 0 failed, 5 total`
- `npm test`
  Result:
  all phase suites passed, including the new Phase 11 persistence suite
- `node -e "require('./index.js'); console.log('functions entrypoint loaded')"`
  Result:
  `functions entrypoint loaded`
- `node -e "require('./functions/index.js'); console.log('repo root functions entrypoint loaded')"`
  Result:
  `repo root functions entrypoint loaded`
- `node -e "require('./index.js'); console.log('functions package entrypoint loaded')"`
  Result:
  `functions package entrypoint loaded`
- `firebase deploy --only functions`
  Result:
  first rerun reached Cloud Run startup and failed because deployed runtime dependency `yauzl` was missing from `functions/package.json`
- `firebase functions:log --only api -n 50`
  Result:
  Cloud Run startup logs showed `Error: Cannot find module 'yauzl'` from `/workspace/src/phase6/kolkostruva_client.js`
- `npm install yauzl`
  Result:
  `added 3 packages, and audited 536 packages in 4s`
- `firebase deploy --only functions`
  Result:
  function update succeeded, URL emitted as `https://api-wzmbpv2nwa-uc.a.run.app`, but CLI exited non-zero because Artifact Registry cleanup policy was not configured
- `firebase functions:artifacts:setpolicy --location us-central1 --force`
  Result:
  `Successfully set up cleanup policy that deletes images older than 1 days`
- `firebase deploy --only functions`
  Result:
  `Deploy complete!`
  `functions[api(us-central1)] Skipped (No changes detected)`
  `Project Console: https://console.firebase.google.com/project/pricer-ee440/overview`

## Deployment Implications
- Production runtime can now use Firestore instead of the previous JSON-only backbone.
- Existing flat collection names and record shapes are preserved.
- Store-backed backend flows now await persistence operations, which is required for Firestore correctness.
- Firebase now has a valid repo-root project configuration and a deployable Cloud Functions source tree.
- The deployed `api` function is active in `us-central1` and backed by the self-contained `functions/` package.
- Firebase CLI still warns that `compute.googleapis.com` is disabled when looking up the default compute service account, but deployment completes by falling back to `548084257282-compute@developer.gserviceaccount.com`.
- Deployment is still not complete because Firestore rules, auth posture, mobile FCM registration, and final live credential setup are still missing.
