# Bulgarian Grocery Price Alert App - Starter Repo

This repository is a document-first starter for a Bulgarian grocery price-alert MVP built around daily price ingestion, deterministic matching, and later selective AI escalation where ambiguity remains.

## Current status
The repo now contains the completed Phase 1 data backbone plus the planning scaffold. It includes:
- repository structure and implementation docs
- prompts, contracts, registries, and handoff templates
- sample Bulgarian input data
- Phase 1 ingestion, identity, persistence, and enrichment logic
- Phase 1 automated verification

Matching, user-facing shopping flows, notifications, and monetization remain future phases.

## Proposed stack
- Flutter mobile app
- Firebase Auth (anonymous)
- Firestore
- Cloud Functions
- Firebase Cloud Messaging
- AdMob
- one LLM provider for selective ambiguity resolution

## Repo map
- `app/mobile/` - Flutter application
- `app/functions/` - Cloud Functions and backend logic
- `docs/` - architecture, phases, contracts, prompts, logs, and registries
- `data_samples/` - sample input data and fixtures
- `scripts/` - verification helpers
- `handoff/` - per-phase operator packages
- `tests/` - automated verification

## Operator workflow
1. Give the relevant phase prompt to your coding agent.
2. Review the implementation artifacts and test outputs.
3. Perform only the steps listed in that phase's `handoff/.../operator_actions.md`.
4. Continue to the next phase.

## Source data notes
The daily source files provide:
- locality / settlement code
- store / merchant label
- raw product display name
- source product code
- source category code
- retail price
- promo price

Phase 1 preserves these source values, computes stable source identities, stores daily raw snapshots, and generates deterministic search-ready enrichment for later matching phases.
