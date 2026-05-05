# Next Phase Readiness

Ready for a small operator dry-run against one known historical ZIP/date.

Recommended next steps:

1. Run `npm run phase6:ingest-snapshot` with `PRICER_PHASE6_PUBLISH_DRY_RUN="true"` for one date.
2. Review output counts and skipped existing records.
3. Create an Admin Console planned job record for the same date.
4. After approval, run the same command with `PRICER_PHASE6_PUBLISH_DRY_RUN="false"` and archive/history/log collections only.
5. Design Cloud Storage upload plus queue/worker before allowing browser-initiated historical ingest.
