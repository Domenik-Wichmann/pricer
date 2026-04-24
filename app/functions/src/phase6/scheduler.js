const { DEFAULT_SCHEDULE } = require('./constants');

function buildDailyIngestSchedule() {
  return {
    ...DEFAULT_SCHEDULE,
    job_name: 'phase6_daily_ingest',
  };
}

function shouldRunIngestForDate({
  state,
  snapshotDate,
}) {
  return !(state.ingest_runs || []).some((run) => run.snapshot_date === snapshotDate && run.status === 'completed');
}

module.exports = {
  buildDailyIngestSchedule,
  shouldRunIngestForDate,
};
