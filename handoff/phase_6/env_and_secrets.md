# Environment And Secrets

## Required for live operation
- `XAI_API_KEY` for live Grok ambiguity calls and live remote embeddings
- `FIREBASE_PROJECT_ID` for live FCM HTTP v1 requests
- `FCM_ACCESS_TOKEN` or a production access-token provider for FCM delivery
- real generated `app/mobile/lib/firebase_options.dart`
- writable paths for:
  - `PRICER_STATE_FILE`
  - `PRICER_WORK_DIR`

## Optional overrides
- `XAI_GROK_MODEL`
- `XAI_EMBEDDING_MODEL`

## Notes
- No live secrets are stored in the repo.
- Without live xAI credentials, the repo falls back to deterministic local embeddings and skips live Grok calls.
- Without live Firebase/FCM credentials, alerts can still be queued in state but not delivered to devices.
