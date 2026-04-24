# PHASE 5.6 IMPLEMENTATION

## Phase
`PHASE_5_6_LOCALIZATION`

## Goal
Add a standard Flutter localization layer so visible UI copy comes from ARB files, English and Bulgarian are fully supported now, and the app structure is ready for future languages without changing backend product/content handling.

## Scope
- Configure Flutter localization with `flutter_localizations`, `intl`, `l10n.yaml`, delegates, supported locales, and locale fallback.
- Add `app_en.arb` and `app_bg.arb`.
- Replace hardcoded visible UI strings across implemented screens and shared widgets.
- Keep backend-driven product and store content unchanged.
- Add localization-focused Flutter widget tests and repo-level verification.

## Out of Scope
- Backend translation changes
- Product-name translation inside widgets
- Runtime machine translation in the mobile client
- New backend endpoints

## Implementation Contract

### Localization setup
- `pubspec.yaml` must enable Flutter code generation and include:
  - `flutter_localizations`
  - `intl`
- `l10n.yaml` must keep ARB source files in `lib/l10n/`.
- Generated localization Dart files must be written to a separate source folder under `lib/` so ARB inputs remain the source of truth.
- The app root must register:
  - `AppLocalizations.delegate`
  - `GlobalMaterialLocalizations.delegate`
  - `GlobalWidgetsLocalizations.delegate`
  - `GlobalCupertinoLocalizations.delegate`
- Supported locales must include:
  - `Locale('en')`
  - `Locale('bg')`
- Unsupported locales must fall back safely to English.

### String ownership rules
- UI labels, buttons, empty states, retry states, banners, and app-bar copy must come from `AppLocalizations`.
- Backend product/store content stays backend-driven.
- Widgets must not translate backend content locally.

### Formatting rules
- App-side currency/date helpers should use the active locale where formatting is app-owned.
- Missing-value placeholders should come from localized resources rather than hardcoded literals where practical.

### Screen coverage
Replace visible UI strings in:
- Home
- Results
- Product Detail
- Shopping Lists
- Shopping List Detail
- Watchlist
- shared cards, empty states, error states, and summary bars

### Test contract
- Flutter widget tests must verify:
  - English rendering
  - Bulgarian rendering
  - unsupported-locale fallback
  - localized results flow rendering
  - localized watchlist rendering
- Repo-level static tests must verify:
  - localization config files exist
  - app root wires delegates and locales
  - major screens import and use `AppLocalizations`
  - widget tests cover English, Bulgarian, and fallback behavior

## Acceptance Criteria
Phase 5.6 is complete when:
- Flutter localization is configured and generated successfully.
- EN and BG ARB files exist.
- ARB inputs are not mixed with generated Dart outputs.
- Major visible UI strings are sourced from l10n rather than hardcoded widget strings.
- `flutter test` passes locally.
- Repo-level Phase 5.6 static verification passes.
- Docs, logs, and handoff files are updated.

## Notes
- The current implementation keeps the structure ready for future `de`, `uk`, `ru`, and `nl` support by extending ARB files and backend display selection later.
- Native Android/iOS runtime verification and real Firebase config remain separate operator steps.
