const { runDailyAggregation } = require('../phase3_5/job');
const { runSemanticEnrichmentJob } = require('../phase3/jobs');
const { backfillCanonicalEmbeddings } = require('./embeddings');
const { detectWatchlistPriceDrops, sendWatchlistAlerts } = require('./alerts');
const { importDailySnapshotZip } = require('./ingest');
const { downloadSnapshotZip, resolveLatestAvailableSnapshotDate } = require('./kolkostruva_client');
const { appendPipelineLog, createPipelineLog } = require('./logging');
const { shouldRunIngestForDate } = require('./scheduler');

async function runDailyProductionPipeline({
  store,
  workingDirectory,
  today = new Date(),
  fetchImpl = fetch,
  watchlistEntries = [],
  notifier = null,
  now = new Date().toISOString(),
}) {
  const initialState = await store.load();
  const latest = await resolveLatestAvailableSnapshotDate({
    today,
    fetchImpl,
  });

  if (!latest) {
    appendPipelineLog(initialState, createPipelineLog({
      level: 'error',
      event_type: 'ingest_no_snapshot_found',
      message: 'No snapshot zip was available within the lookback window.',
      logged_at: now,
    }));
    await store.save(initialState);
    return {
      skipped: true,
      reason: 'no_snapshot_available',
      state: initialState,
    };
  }

  if (!shouldRunIngestForDate({
    state: initialState,
    snapshotDate: latest.snapshot_date,
  })) {
    appendPipelineLog(initialState, createPipelineLog({
      level: 'info',
      event_type: 'ingest_already_completed',
      message: 'Skipped daily ingest because this snapshot date was already processed.',
      context: {
        snapshot_date: latest.snapshot_date,
      },
      logged_at: now,
    }));
    await store.save(initialState);
    return {
      skipped: true,
      reason: 'already_ingested',
      snapshot_date: latest.snapshot_date,
      state: initialState,
    };
  }

  const download = await downloadSnapshotZip({
    snapshotDate: latest.snapshot_date,
    outputDir: workingDirectory,
    fetchImpl,
  });

  const ingest = await importDailySnapshotZip({
    store,
    zipFilePath: download.file_path,
    snapshotDate: latest.snapshot_date,
    sourceUrl: latest.url,
    ingestedAt: now,
  });

  const semantic = await runSemanticEnrichmentJob({
    store,
    generatedAt: now,
  });
  const embeddings = await backfillCanonicalEmbeddings({
    store,
    generatedAt: now,
    fetchImpl,
  });
  const aggregation = await runDailyAggregation({
    store,
    date: latest.snapshot_date,
  });
  const alertCandidates = detectWatchlistPriceDrops({
    watchlistEntries,
    state: await store.load(),
    date: latest.snapshot_date,
    createdAt: now,
  });
  const notifications = await sendWatchlistAlerts({
    store,
    alerts: alertCandidates,
    notifier,
    sentAt: now,
  });

  return {
    skipped: false,
    snapshot_date: latest.snapshot_date,
    ingest,
    semantic,
    embeddings,
    aggregation,
    notifications,
    state: await store.load(),
  };
}

module.exports = {
  runDailyProductionPipeline,
};
