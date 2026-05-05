# Product Search Price Summary Handoff

Date: 2026-05-05

## Summary
- Product search results now include `current_offer_summary` from `canonical_current_offer_summary`.
- The lookup is scoped to bounded search candidate canonical ids and does not scan raw snapshots or current offers.
- Candidates with current summaries are preferred before pagination so the first page shows currently priced products when available.
- Admin Console Product Search now displays cheapest, highest, average price, offer count, and cheapest retailer/chain while preserving raw JSON.

## Verification
- `npm run test:phase15_2` passed: 25 passed, 0 failed.
- `npm run admin-web:build` passed.
- `npm run validate:docs` passed.
- Functions and Hosting deployed to `pricer-ee440`.
- Live `POST /products/search` smoke passed for `\u043c\u043b\u044f\u043a\u043e` and `milk`; both returned priced summaries in the first results.

## Operator Notes
- No ingest, publisher, raw snapshot scan, or Firestore delete was run.
- PowerShell literal Cyrillic in inline command strings rendered as question marks in this shell. UTF-8 JSON sent from Node with Unicode escapes verified the live Cyrillic query.
