const { rebuildDemandAggregates } = require('./aggregator');
const { rebuildDemandClusters, rebuildDemandEmbeddings } = require('./clustering');

async function runDemandIntelligenceJobs({
  store,
  generatedAt = new Date().toISOString(),
  similarityThreshold = 0.72,
}) {
  const aggregateSummary = await rebuildDemandAggregates({ store });
  const embeddingSummary = await rebuildDemandEmbeddings({
    store,
    generatedAt,
  });
  const clusterSummary = await rebuildDemandClusters({
    store,
    similarityThreshold,
    generatedAt,
  });

  return {
    ...aggregateSummary,
    ...embeddingSummary,
    ...clusterSummary,
  };
}

module.exports = {
  runDemandIntelligenceJobs,
};
