# Phase 18.5 Implementation - Mobile Optimize Basket Screen

Implemented on 2026-04-24.

## Scope

Phase 18.5 replaces the `/optimize` placeholder with a real Flutter basket optimization screen backed by the existing `POST /basket/optimize` backend contract.

## Mobile Contract

Route:

```text
/optimize
```

Route arguments:

```json
{
  "items": ["milk", "eggs"]
}
```

Missing, null, non-map, or empty arguments are safe and render an empty basket input state.

## API Request

`QueryApiClient.optimizeBasket(...)` posts:

```json
{
  "items": ["milk", "10 eggs"],
  "layer_mode": "canonical_with_enrichment",
  "optimizer_options": {
    "strategy": "multi_store",
    "include_explanation": true,
    "include_convenience_scoring": false
  }
}
```

The mobile client does not request internal metrics by default.

## Visible Sections

- Editable multiline basket input with comma/newline parsing.
- Strategy toggle for `single_store` and `multi_store`.
- Loading, empty, success, and retryable error states.
- Summary card with recommended strategy, estimated total, currency, savings, and store count.
- Store cards with chain/store name, subtotal, item count, and item rows.
- Notes/warnings for user-useful optimizer warnings.
- Explanation headline, summary text, item notes, and limitations.

## Intentionally Excluded

- Basket persistence.
- Saved-list automatic optimization.
- Convenience scoring toggle.
- Internal `score_total`.
- Raw metrics and debug objects.
- Backend behavior changes.

## Verification

Recorded in `docs/test_runs/phase_18_5_2026-04-24.json`.
