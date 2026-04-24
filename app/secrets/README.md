# Local Secrets Workspace

Store only local placeholders or machine-local secret helpers here.

## Files
- `backend.env.example`: example backend environment variables
- `mobile.dart-defines.ps1.example`: example Flutter `--dart-define` launcher values for `com.pricer.mobile` against the `europe-west1` backend
- `*.local`: your machine-local copies with real values

## Enrichment default
- `backend.env.example` now reflects the intended runtime default of `ENABLE_LLM_ENRICHMENT=true`.
- Live enrichment still stays safe because actual remote calls require `XAI_API_KEY`, and missing keys should remain non-fatal.

## Safety
- Production secrets should live in Firebase, Google Cloud, or CI secret stores.
- Do not commit real secrets into this folder.
- `app/secrets/.gitignore` ignores local files here by default.
