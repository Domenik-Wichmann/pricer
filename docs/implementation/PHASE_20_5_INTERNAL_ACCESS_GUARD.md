# Phase 20.5 Internal Access Guard - Implementation Notes

Date: 2026-04-25

## Scope

Phase 20.5 adds a lightweight internal access guard for Phase 20 market-intelligence APIs. It is a temporary shared-secret guard, not full production auth, billing, or merchant scoping.

The guard is intentionally small and replaceable by Firebase Auth claims, role-based access, merchant scopes, and billing gates later.

## Protected Endpoints

- `GET /analytics/gap-detection`
- `GET /analytics/gap-detection/localities`
- `GET /analytics/gap-detection/coverage-by-chain`
- `GET /analytics/opportunities`
- `GET /analytics/insights/overview`
- `GET /analytics/insights/opportunities`
- `GET /analytics/insights/categories`
- `GET /analytics/insights/localities`
- `GET /analytics/insights/chains`

## Consumer Endpoints Not Guarded Here

- `/home/summary`
- `/products/search`
- `/basket/optimize`
- `/watchlist`
- `/lists`

## Access Contract

Runtime env:

- `PRICER_INTERNAL_ANALYTICS_TOKEN`

Headers:

- `x-pricer-admin-token`: must match `PRICER_INTERNAL_ANALYTICS_TOKEN`
- `x-pricer-role`: optional placeholder role, with `admin` and `analyst` allowed

`merchant` is denied for now until merchant scopes and billing gates exist.

If `PRICER_INTERNAL_ANALYTICS_TOKEN` is missing, protected endpoints deny by default.

Forbidden response:

```json
{
  "error": "forbidden"
}
```

The response does not reveal token values, role details, or whether runtime config exists.

## Files

- `functions/src/phase18/internal_access.js`
- `app/functions/src/phase18/internal_access.js`
- `functions/index.js`

## Verification

Covered by `tests/phase_20_5_internal_access_guard.test.js`:

- missing token
- wrong token
- admin role allowed
- analyst role allowed
- merchant role denied
- missing env token denies
- consumer endpoints outside protected list
- all Phase 20 internal endpoints inside protected list
- no token leakage in forbidden responses
