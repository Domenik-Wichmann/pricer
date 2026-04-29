# DB5B Operator Actions

No required operator action remains for DB5B.

Optional local execution:
- Configure Postgres through the existing DB1 environment variables.
- Create or seed `recipe_ingest_jobs` rows that contain `raw_text`.
- Run `npm run db5b:extract-recipe-to-staging -- --status=pending --dry-run --json` to preview extraction behavior.
- Run `npm run db5b:extract-recipe-to-staging -- --status=pending --json` against a configured environment when an LLM API key is available.

