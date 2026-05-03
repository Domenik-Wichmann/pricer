const { buildDailyAggregation } = require('./aggregator');

async function runDailyAggregation({
  store,
  date,
}) {
  const state = await store.load();
  const alreadyAggregated = hasDateAggregation(state, date);
  if (alreadyAggregated) {
    return {
      skipped: true,
      reason: 'already_aggregated',
      state,
    };
  }

  const aggregation = buildDailyAggregation({
    rawPriceSnapshots: state.raw_price_snapshots,
    targetDate: date,
  });

  aggregation.product_daily_prices.forEach((row) => {
    state.product_daily_prices.push(row);
  });
  aggregation.category_daily_aggregates.forEach((row) => {
    state.category_daily_aggregates.push(row);
  });
  await store.save(state);

  return {
    skipped: false,
    product_rows: aggregation.product_daily_prices.length,
    category_rows: aggregation.category_daily_aggregates.length,
    state,
  };
}

function hasDateAggregation(state, date) {
  return state.product_daily_prices.some((row) => row.date === date) ||
    state.category_daily_aggregates.some((row) => row.date === date);
}

module.exports = {
  runDailyAggregation,
};
