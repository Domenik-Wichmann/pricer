# PHASE 5 IMPLEMENTATION - FLUTTER APP

## Scope
- Build the Flutter client under `app/mobile/`
- Reuse the existing backend API contracts:
  - `POST /query`
  - `GET /product/:id/history`
- Use Firestore for anonymous shopping lists and watchlists
- Keep the UI intentionally minimal and responsive

## Repo-aligned implementation notes
- The repository did not contain a Flutter scaffold before this phase, so Phase 5 creates a tracked `app/mobile/` project structure with `lib/`, `test/`, `pubspec.yaml`, and lints.
- Native Android and iOS runner folders are not checked in yet because this environment does not have the Flutter SDK required to generate them.
- `lib/firebase_options.dart` is a generated FlutterFire file. Android+iOS settings currently reflect the `com.pricer.mobile` apps under `pricer-ee440`; non-scope platforms may still need separate regeneration later.
- The app bootstraps into Firestore-backed repositories when Firebase is configured and falls back to in-memory repositories otherwise so the UI can still run in local development.

## Screens
- `HomeScreen`: Bulgarian search input, voice trigger, and backend status
- `ResultsScreen`: cheapest-store summary, matched product cards, add-to-list, add-to-watchlist, details
- `ProductDetailScreen`: current price plus history chart from `/product/:id/history`
- `ShoppingListsScreen`: create and browse lists
- `ShoppingListDetailScreen`: free-text item entry and multi-item comparison via repeated `/query` calls
- `WatchlistScreen`: tracked products with remove action

## Tests
- Repo-level static verification lives in `tests/phase_5_flutter_app.test.js`
- Authored Flutter widget tests live in `app/mobile/test/widget_smoke_test.dart`
- Executing Flutter widget tests requires a local Flutter SDK and generated native runners
