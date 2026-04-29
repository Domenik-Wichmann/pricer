# Operator Actions

## Purpose
Phase DB0 is a design-only architecture phase. It introduces no new live services and requires no immediate operator action.

## Ordered steps
1. Review `docs/PHASE_DB0_POSTGRES_TRANSITION_ARCHITECTURE.md` before DB1 begins.
2. Decide the preferred local/production Postgres provider before DB1 implementation.
3. Prepare a future secret name or connection string policy for `PRICER_POSTGRES_URL` or equivalent DB1 env vars.
4. Do not point the mobile app at Postgres directly; all future reads must continue through Firebase Functions/service APIs.
