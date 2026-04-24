const { runWatchlistDailyEvaluation } = require('./intelligence');
const { recomputeWatchlistRecurringPatterns } = require('./recurrence');

async function runWeeklyIntervalRecompute({
  store,
  watchlistEntries = [],
  computedAt = new Date().toISOString(),
}) {
  return recomputeWatchlistRecurringPatterns({
    store,
    watchlistEntries,
    computedAt,
  });
}

async function runDailyWatchlistIntelligence({
  store,
  watchlistEntries = [],
  date,
  createdAt = new Date().toISOString(),
}) {
  return runWatchlistDailyEvaluation({
    store,
    watchlistEntries,
    date,
    createdAt,
  });
}

module.exports = {
  runDailyWatchlistIntelligence,
  runWeeklyIntervalRecompute,
};
