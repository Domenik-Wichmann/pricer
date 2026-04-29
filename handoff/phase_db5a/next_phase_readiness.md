# DB5A Next Phase Readiness

DB5A leaves a raw-preserving staging layer ready for later review and promotion work.

Ready inputs:
- Staged recipe bundles with raw job provenance.
- Nullable links from staged ingredients to existing DB3A ingredients.
- Separate rich metadata rows for tools, methods, tags, state changes, substitution hints, and quality signals.

Boundaries for the next phase:
- Promotion into canonical `recipes` must remain explicit and reviewed.
- Ingredient creation should stay out of ingest staging unless a future phase adds a dedicated review workflow.
- Any LLM-assisted extraction should write provenance into staging and remain cache/review-oriented.
