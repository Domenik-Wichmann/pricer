# DB4D Next Phase Readiness

Ready follow-ons:

1. Use `buildRecipeQualityReport(...)` as the review-side source for canonical recipe recommendation eligibility dashboards.
2. Recompute and persist canonical `recipes.usability_status` from the DB4D readiness model if a later phase wants the stored status to reflect grams/product coverage more tightly.
3. Add product-coverage rollups by substitution group once DB3E product-equivalence review has enough approved mappings.

Known constraints:

- DB4D is intentionally read-only and does not repair recipe rows.
- Stored `recipes.usability_status` and computed DB4D `readiness_status` can diverge by design because DB4D adds `needs_grams` and `needs_product_mapping` reporting without mutating canonical recipe records.
