ALTER TABLE recipe_ingest_jobs
  DROP CONSTRAINT IF EXISTS recipe_ingest_jobs_status_check;

ALTER TABLE recipe_ingest_jobs
  ADD CONSTRAINT recipe_ingest_jobs_status_check CHECK (
    status IN ('pending', 'extracting', 'staged', 'needs_review', 'completed', 'failed', 'cancelled')
  );
