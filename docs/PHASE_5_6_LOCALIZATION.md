# PHASE 5.6 IMPLEMENTATION — LOCALIZATION SYSTEM

## Phase ID
PHASE_5_6_LOCALIZATION

## Objective
Add a proper localization system to the Flutter app so that:
- all UI copy is localized through Flutter l10n
- the app can switch languages cleanly
- product/store/content data remains sourced from backend multilingual fields
- future languages can be added without rewriting widgets

This phase is about UI language infrastructure, not about changing backend product translation logic.

---

## Scope

### In scope
- Flutter localization setup
- ARB-based UI string management
- app locale resolution
- optional in-app language selector
- replace hardcoded UI strings in widgets
- integrate localized formatting where relevant
- establish rules for UI copy vs backend content fields

### Out of scope
- reworking backend multilingual product data
- machine translation in the mobile app
- dynamic runtime translation
- advanced locale-specific content strategy

---

## Architectural Rules

### Rule 1 — UI copy comes from l10n
All app labels, buttons, screen titles, empty states, loading messages, and error messages must come from Flutter localization files.

### Rule 2 — product/store/content data comes from backend
Product names, store names, price data, and multilingual product display fields must continue to come from backend data models, not from ARB localization files.

### Rule 3 — no hardcoded user-facing strings in widgets
Do not leave English strings inline in widget trees except as temporary technical comments.

### Rule 4 — start with EN + BG
The implementation must fully support:
- English (`en`)
- Bulgarian (`bg`)

The structure must be ready for:
- German (`de`)
- Ukrainian (`uk`)
- Russian (`ru`)
- Dutch (`nl`)

---

## Tech Stack

Use Flutter’s standard localization stack:
- `flutter_localizations`
- `intl`

Use ARB files under:
```text
lib/l10n/
File / Folder Structure

Create or update:

app/mobile/
  lib/
    l10n/
      app_en.arb
      app_bg.arb
    main.dart
    app.dart
    ...

Generated localization output should follow Flutter standard generation behavior.

Required Dependencies

Ensure pubspec.yaml supports localization generation.

Required support includes:

flutter_localizations
intl

Also ensure the Flutter project is configured to generate localization classes from ARB files.

Required App Configuration

The app root must support:

localizationsDelegates
supportedLocales
locale resolution
optional manual locale override

At minimum, supportedLocales must include:

Locale('en')
Locale('bg')

Structure should be ready to add:

Locale('de')
Locale('uk')
Locale('ru')
Locale('nl')
Locale Strategy
Default behavior

Use device locale if supported.

Fallback behavior

If device locale is unsupported:

fallback to English
Optional override

Add a lightweight language selector if straightforward, but do not overbuild settings UX in this phase.

If implemented, manual selection must override device locale during the app session and be easy to persist later.

ARB Structure
Required file names
app_en.arb
app_bg.arb
Example keys

The actual implementation should cover all visible UI copy, including but not limited to:

appTitle
homeTitle
searchPlaceholder
searchButton
recentSearches
recentLists
cheapestToday
biggestDropsToday
resultsTitle
cheapestStore
savingsLabel
addAllToList
saveList
addToWatchlist
productDetailsTitle
currentPrice
averagePrice
belowAverage
aboveAverage
aroundAverage
shoppingListsTitle
createList
watchlistTitle
dropsToday
rerunList
emptyStateTitle
emptyStateBody
errorTitle
retryButton
loadingLabel
cityLabel
shareResult
goodDeal
normalPrice
expensiveNow
Example EN entry
{
  "searchPlaceholder": "What do you want to buy?"
}
Example BG entry
{
  "searchPlaceholder": "Какво искаш да купиш?"
}
Required Screen Coverage

Replace hardcoded UI copy in all currently implemented screens, including:

Home Screen
Results Screen
Product Detail Screen
Shopping Lists Screen
Shopping List Detail Screen
Watchlist Screen

Also replace strings in:

reusable widgets
banners
empty states
retry/error text
share CTA labels
chart labels if app-side strings exist
app bar titles
button labels
Required Widget Usage Pattern

Widgets must use generated localization accessors, for example:

final l10n = AppLocalizations.of(context)!;

Then use:

l10n.searchPlaceholder

Do not:

hardcode "Search"
hardcode "Save list"
hardcode "Watchlist"
Backend Content Integration Rule

Where product/store/content data is shown:

UI labels should be localized by l10n
content values should come from backend fields

Example:

label: localized (Current price)
value: backend-driven (display.bg, display.en, store name, etc.)

The app should not attempt to translate backend product names itself.

Display Language Selection Rule

When rendering backend content:

if app locale is Bulgarian and localized product display is available, prefer Bulgarian
otherwise use English fallback
for future locales, use corresponding backend display fields if available
always have a safe English fallback

This phase does not require full implementation of all language-specific backend content selection, but the model usage should be prepared for it.

Formatting Rules

Use locale-aware formatting where relevant:

currency formatting
decimal formatting
date formatting

At minimum, ensure the structure allows locale-aware formatting through intl.

If pricing remains in raw numeric strings for now, document where formatting should be applied later.

Optional Language Selector

If implemented in this phase:

keep it simple
place it in Settings or a lightweight top-level selector
supported options:
English
Български

Do not create a large settings subsystem for this.

If not implemented, device-locale detection alone is acceptable for Phase 5.6.

Migration Work Required
Step 1

Scan all Flutter files for hardcoded visible strings.

Step 2

Move those strings into ARB files.

Step 3

Replace widget string literals with localization lookups.

Step 4

Verify no major screen still has hardcoded English UI copy.

Testing Requirements
Widget / app tests

Add or update tests to verify:

localization setup does not break app boot
English renders expected copy
Bulgarian renders expected copy
key screens can render using localization context
no missing delegate / unsupported locale crash
Static checks

Search codebase for obvious hardcoded visible strings and remove them where feasible.

Acceptance Criteria

Phase 5.6 is complete when:

Flutter localization is configured correctly
ARB files exist for EN and BG
major visible UI strings are no longer hardcoded
the app renders correctly in English
the app renders correctly in Bulgarian
unsupported locale falls back safely
docs/logs are updated
handoff package is produced
Deliverables

Implementation must produce:

Code / config
localization-enabled app root
ARB files
localized widget copy across major screens
Tests
localization coverage tests or updated smoke tests
Docs

Update:

docs/CURRENT_STATE.md
docs/DECISION_LOG.md
docs/TEST_REGISTRY.md
CHANGELOG.md
Handoff

Produce:

handoff/phase_5_6/operator_actions.md
handoff/phase_5_6/verification_report.md
handoff/phase_5_6/files_changed.md
handoff/phase_5_6/env_and_secrets.md
handoff/phase_5_6/next_phase_readiness.md
Implementation Rules for the Coding Agent
Read all relevant Flutter app docs before making changes.
Do not change backend logic.
Do not translate backend content inside widgets.
Keep localization infrastructure standard and maintainable.
Prefer small, clear, idiomatic Flutter l10n usage.
Keep the structure ready for future languages even if only EN/BG are fully wired now.
Run tests and record exact outcomes.
Do not mark the phase complete unless acceptance criteria are met.