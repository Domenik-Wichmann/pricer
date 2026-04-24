const PHASE3_COST_LIMITS = Object.freeze({
  max_ai_calls_per_request: 1,
  max_ai_candidates_per_call: 5,
  max_semantic_records_per_run: 250,
  max_embedding_records_per_run: 250,
});

const EMBEDDING_MODEL = 'phase3-hash-embedding-v1';
const AI_DISAMBIGUATOR_MODEL = 'phase3-local-ranker-v1';
const SEMANTIC_ENRICHMENT_VERSION = 'phase3-semantic-v1';

module.exports = {
  AI_DISAMBIGUATOR_MODEL,
  EMBEDDING_MODEL,
  PHASE3_COST_LIMITS,
  SEMANTIC_ENRICHMENT_VERSION,
};
