# DB5B Next Phase Readiness

DB5B leaves recipe ingest ready for later review and promotion work.

Ready inputs:
- Raw recipe jobs can move from `pending` to `extracting`, then `staged` or `failed`.
- Strict-JSON extraction provenance is preserved on both the job and staged recipe records.
- Existing DB3A ingredients can be matched deterministically by key, normalized name, and alias without creating new ingredient rows.

Boundaries for the next phase:
- Promotion into canonical recipes must remain explicit and reviewed.
- Ingredient creation should remain a separate review workflow rather than a side effect of extraction.
- Any richer extraction/review UI should read DB5 staging provenance instead of bypassing it.
