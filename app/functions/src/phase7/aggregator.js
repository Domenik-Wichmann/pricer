async function rebuildDemandAggregates({
  store,
}) {
  const state = await store.load();
  const logs = state.demand_logs || [];
  const existingClusterByKey = new Map(
    (state.demand_aggregates || []).map((row) => [row.demand_key, row.cluster_id || null]),
  );
  const grouped = new Map();

  logs.forEach((log) => {
    const existing = grouped.get(log.demand_key);
    if (existing) {
      existing.frequency += 1;
      if (log.demand_source === 'manual_feedback') {
        existing.manual_frequency += 1;
      } else {
        existing.automatic_frequency += 1;
      }

      if (log.created_at < existing.first_seen_at) {
        existing.first_seen_at = log.created_at;
        existing.sample_raw_query = log.raw_query;
      }

      if (log.created_at >= existing.last_seen_at) {
        existing.last_seen_at = log.created_at;
        existing.last_raw_query = log.raw_query;
      }

      return;
    }

    grouped.set(log.demand_key, {
      demand_key: log.demand_key,
      normalized_query: log.normalized_query,
      locality_code: log.locality_code || null,
      city: log.city || null,
      frequency: 1,
      automatic_frequency: log.demand_source === 'automatic_unmatched' ? 1 : 0,
      manual_frequency: log.demand_source === 'manual_feedback' ? 1 : 0,
      first_seen_at: log.created_at,
      last_seen_at: log.created_at,
      sample_raw_query: log.raw_query,
      last_raw_query: log.raw_query,
      cluster_id: existingClusterByKey.get(log.demand_key) || null,
    });
  });

  state.demand_aggregates = Array.from(grouped.values()).sort((left, right) => {
    if (right.frequency !== left.frequency) {
      return right.frequency - left.frequency;
    }

    return right.last_seen_at.localeCompare(left.last_seen_at);
  });
  await store.save(state);

  return {
    aggregate_count: state.demand_aggregates.length,
    log_count: logs.length,
  };
}

module.exports = {
  rebuildDemandAggregates,
};
