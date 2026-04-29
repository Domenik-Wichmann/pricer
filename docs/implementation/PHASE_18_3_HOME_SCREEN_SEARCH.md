# Phase 18.3 Implementation - Home Search + Add-to-Basket Entry

Date: 2026-04-24

## Scope

Phase 18.3 adds a lightweight home-screen entry point for two actions:

- search for products
- draft basket items for later optimization

The implementation is Flutter-only. It does not add backend endpoints, persistence, resolver calls, planner calls, optimizer calls, or external service calls.

## Behavior

`app/mobile/lib/features/search/home_screen.dart` renders a top input with:

- placeholder: `Search products or add to basket...`
- search submit through Enter/search keyboard action
- search button
- secondary `Add to basket` button

Search submit navigates to:

```dart
Navigator.of(context).pushNamed(
  AppRoutes.search,
  arguments: {'query': query},
);
```

Add-to-basket parses the input with a simple comma/newline splitter:

```dart
value.split(RegExp(r'[,\n]'))
```

It trims entries, ignores empty values, and navigates to:

```dart
Navigator.of(context).pushNamed(
  AppRoutes.optimize,
  arguments: {'items': items},
);
```

## Route Handling

`app/mobile/lib/core/navigation/app_routes.dart` keeps `/search` and `/optimize` as lightweight placeholder screens for now, but they are argument-aware:

- `/search` renders the passed query when present.
- `/optimize` renders the parsed draft basket item list when present.
- both routes tolerate missing arguments.

## Tests

Coverage lives in `app/mobile/test/widget_smoke_test.dart`:

- input renders with the contract placeholder
- Enter/search navigates to `/search` with query
- `Add to basket` navigates to `/optimize` with parsed draft items
- empty input does nothing safely
- named routes tolerate missing and provided arguments

Repo static tests were updated so the older direct-results home search expectation now reflects the Phase 18.3 route-entry behavior.

## Verification

Passed on 2026-04-24:

- `flutter analyze`
- `flutter test test/widget_test.dart test/widget_smoke_test.dart`
- `node tests/phase_5_flutter_app.test.js`
- `node tests/phase_5_5_ui_and_growth.test.js`
- `node tests/phase_5_6_localization.test.js`
