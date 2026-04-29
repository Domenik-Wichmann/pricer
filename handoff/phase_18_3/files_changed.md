# Phase 18.3 Files Changed

## Mobile App

- `app/mobile/lib/features/search/home_screen.dart`
  - Added top home search/add-to-basket input.
  - Routed search submits, search button, voice capture, and recent-search chips to `/search`.
  - Added comma/newline draft item parsing and `/optimize` navigation.
  - Removed the legacy direct home-to-results search execution path.

- `app/mobile/lib/core/navigation/app_routes.dart`
  - Made `/search` render optional query arguments.
  - Made `/optimize` render optional draft basket item arguments.
  - Added safe string-list argument parsing.

- `app/mobile/test/widget_smoke_test.dart`
  - Added Phase 18.3 widget coverage for home input rendering, search navigation, add-to-basket navigation/parsing, empty input safety, and safe route behavior.
  - Updated older home shell expectations to match the new top input.

- `tests/phase_5_5_ui_and_growth.test.js`
  - Updated static growth-flow checks from the removed direct home results flow to the Phase 18.3 route-entry flow.

## Docs

- `CHANGELOG.md`
- `docs/REPO_MAP.md`
- `docs/TEST_REGISTRY.md`
- `docs/test_registry.json`
- `docs/current_state.json`
- `docs/CURRENT_STATE.md`
- `docs/decision_log.md`
- `docs/PHASE_18_3_HOME_SCREEN_SEARCH.md`
- `docs/implementation/PHASE_18_3_HOME_SCREEN_SEARCH.md`
- `docs/test_runs/phase_18_3_2026-04-24.json`
- `handoff/phase_18_3/*`
