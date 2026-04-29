# Operator Actions

Required before deployed internal use:

1. Set `PRICER_INTERNAL_ANALYTICS_TOKEN` in the Firebase Functions runtime secret/env configuration.
2. Send `x-pricer-admin-token: <token>` and `x-pricer-role: admin` or `analyst` from internal tools.

Optional follow-up:

- Replace the temporary shared-secret guard with Firebase Auth claims and merchant/account scoping before merchant-facing exposure.
