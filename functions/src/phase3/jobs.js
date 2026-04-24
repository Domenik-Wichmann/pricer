const { PHASE3_COST_LIMITS } = require('./constants');
const { generateEmbeddingRecord } = require('./embedding_generator');
const { buildSemanticProfile } = require('./semantic_enricher');

async function runSemanticEnrichmentJob({
  store,
  limit = PHASE3_COST_LIMITS.max_semantic_records_per_run,
  generatedAt = new Date().toISOString(),
}) {
  const state = await store.load();
  const enrichmentIndex = new Map(state.source_product_enrichment.map((row) => [row.source_product_id, row]));
  const semanticIndex = new Map(state.semantic_profiles.map((row) => [row.source_product_id, row]));

  let processed = 0;
  for (const sourceProduct of state.source_products) {
    if (processed >= limit) {
      break;
    }

    if (semanticIndex.has(sourceProduct.source_product_id)) {
      continue;
    }

    const enrichment = enrichmentIndex.get(sourceProduct.source_product_id);
    if (!enrichment) {
      continue;
    }

    state.semantic_profiles.push(buildSemanticProfile({
      sourceProduct,
      enrichment,
      generatedAt,
    }));
    processed += 1;
  }

  await store.save(state);
  return {
    processed,
    state,
  };
}

async function runEmbeddingGenerationJob({
  store,
  limit = PHASE3_COST_LIMITS.max_embedding_records_per_run,
  generatedAt = new Date().toISOString(),
}) {
  const state = await store.load();
  const embeddingIndex = new Map(state.embedding_records.map((row) => [row.source_product_id, row]));

  let processed = 0;
  for (const semanticProfile of state.semantic_profiles) {
    if (processed >= limit) {
      break;
    }

    if (embeddingIndex.has(semanticProfile.source_product_id)) {
      continue;
    }

    state.embedding_records.push(generateEmbeddingRecord({
      sourceProductId: semanticProfile.source_product_id,
      semanticProfile,
      generatedAt,
    }));
    processed += 1;
  }

  await store.save(state);
  return {
    processed,
    state,
  };
}

module.exports = {
  runEmbeddingGenerationJob,
  runSemanticEnrichmentJob,
};
