# Operator Actions

No required operator action for local development.

When ready to expose locality-aware analytics outside the local environment:

- Deploy the updated Firebase Functions package.
- Decide whether downstream analyst tooling should read `/analytics/gap-detection`, `/analytics/gap-detection?locality_code=...`, or `/analytics/gap-detection/localities`.
