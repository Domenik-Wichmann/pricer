# Next Phase Readiness

## Ready now
- The repo has a streamed production ingest path for ZIP snapshots.
- The repo now reuses enrichment once per normalized source chain plus product code, cutting the real 2026-04-21 archive from 1,109,810 potential enrichments to 110,037 actual runs.
- Daily orchestration can now be scheduled through a single runnable CLI target.
- Analytics, pipeline logs, alert detection, and notification queueing are available as flat collections.
- Grok ambiguity escalation and remote embeddings are environment-configurable and budget-aware.

## Constraints to preserve
- Keep stable Phase 1 identities as the source of truth for dedupe and persistence.
- Keep Grok usage limited to ambiguity cases only.
- Keep provider credentials and live project config outside the repo.
- Keep new production records flat and SQL-compatible.

## Remaining gap
- Live deployment still requires operator-managed Firebase, xAI, FCM, and scheduler setup.
- Real device-token capture for alert delivery remains a production integration concern outside this local repo pass.

## Recommended next focus
1. Complete the live credential and scheduler setup.
2. Verify one full end-to-end daily ingest against the real source ZIP.
3. Verify one real price-drop alert delivery with a registered device token.
