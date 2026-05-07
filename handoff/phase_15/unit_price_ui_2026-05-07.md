# Phase 15 Unit Price UI Handoff

Date: 2026-05-07

## Summary

- Added UI-only unit-price rendering for Phase 15 `comparison_basis` / `price_per_comparison_basis` fields.
- Admin Product Search/Product Detail now shows supported normalized unit prices and avoids ugly `n/a` output for absent unit-price/debug metadata.
- Mobile product search, product detail, watchlist, and basket item rows now render `/kg`, `/L`, or `/unit` when the API/DTO has a supported basis.
- Primary prices remain unchanged; missing unit normalization is hidden.

## Verification

- `npm run admin-web:build` - passed
- `flutter test test/widget_smoke_test.dart` from `app/mobile` - passed, 75 tests
- `npm run validate:docs` - passed

## Operator Actions

None.

## Notes

- No backend semantics were changed.
- Price lookup/watchlist APIs still only show unit prices where the returned DTO includes the normalization fields.
