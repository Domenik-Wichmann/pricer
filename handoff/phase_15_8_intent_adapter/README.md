# Phase 15.8 Intent Adapter Follow-Up Handoff

Date: 2026-05-03
Status: implemented, deployed, and smoke-tested

## What Changed

- Added Admin Console `Shopping Intent` tab for `POST /shopping-intent/resolve`.
- Added inline preference preview and `preference_record` output to the resolver endpoint without persisting preview JSON.
- Added opt-in `use_shopping_intent: true` / `resolution_mode: "intent_first"` to shopping-list resolution, basket planning, basket optimization, and saved-list optimization pass-through.
- Added transient `clarification_needed` item status and basket `clarification_items` for broad/ambiguous intent before canonical product lookup.
- Preserved disabled/default resolver, planner, optimizer, saved-list, and mobile behavior.

## Verification

- `npm run test:phase15_8` passed: 10 passed, 0 failed.
- `npm run test:phase15_3` passed: 9 passed, 0 failed.
- `npm run test:phase15_4` passed: 12 passed, 0 failed.
- `npm run admin-web:build` passed.

## Deploy / Smoke

- Functions deployed with `npx -y firebase-tools@latest deploy --only functions --project pricer-ee440`.
- Hosting rebuilt with `VITE_PRICER_API_BASE_URL=https://europe-west1-pricer-ee440.cloudfunctions.net/api` and deployed with `npx -y firebase-tools@latest deploy --only hosting --project pricer-ee440`.
- Hosting URL: `https://pricer-ee440.web.app`.
- Live smoke passed:
  - Hosting returned 200 and deployed bundle contains `Shopping Intent`.
  - `yogurt` returns style clarification first.
  - `cheese` returns family ambiguity across cream cheese, kashkaval, and sirene.
  - Bulgarian `sirene` input resolves to selected family `sirene`.
  - `juice` asks flavor first.
  - `bread` asks bread type.
  - Shopping-list opt-in returns item `status = "clarification_needed"` for `yogurt`.
  - Basket-plan opt-in returns `optimization_ready = false` with one `clarification_items` row for `yogurt`.

## Remaining Limitations

- No mobile UI changes were made.
- Inline Admin preference JSON is preview-only; it does not write `user_product_family_preferences`.
- Intent-first catalog filtering is intentionally minimal: family/default attributes become a deterministic query for the existing product resolver rather than a new product-selection engine.
- Admin Console still has no Firebase Auth/admin-claims gate.
