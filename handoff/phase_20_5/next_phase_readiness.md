# Next Phase Readiness

Phase 20.5 is ready for internal dashboard wiring against guarded endpoints.

## Good Next Targets

- Firebase Auth custom claims for admin and analyst access.
- Merchant-scoped access rules.
- Paid insights and billing gates.
- Audit logging for internal analytics reads.

## Remaining Cautions

- Shared-secret headers are a temporary guard only.
- Merchant role is intentionally denied until scoping and billing rules exist.
- Production clients should not embed the analytics token in public mobile/web bundles.
