const {
  DEFAULT_EMBEDDING_ENDPOINT,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_MAX_EMBEDDING_CALLS,
} = require('./constants');
const { generateEmbeddingRecord } = require('../phase3/embedding_generator');

function isEmbeddingApiConfigured(env = process.env) {
  return Boolean(env.XAI_API_KEY);
}

async function requestRemoteEmbedding({
  text,
  fetchImpl = fetch,
  apiKey = process.env.XAI_API_KEY,
  endpoint = DEFAULT_EMBEDDING_ENDPOINT,
  model = process.env.XAI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
}) {
  if (!apiKey) {
    throw new Error('xAI API key is not configured for remote embeddings');
  }

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: text,
      model,
    }),
  });

  if (!response.ok) {
    throw new Error(`embedding request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const vector = payload?.data?.[0]?.embedding;
  if (!Array.isArray(vector)) {
    throw new Error('embedding response did not contain a vector');
  }

  return {
    embedding_model: model,
    vector,
  };
}

async function backfillCanonicalEmbeddings({
  store,
  generatedAt = new Date().toISOString(),
  limit = DEFAULT_MAX_EMBEDDING_CALLS,
  fetchImpl = fetch,
  useRemote = isEmbeddingApiConfigured(),
  apiKey = process.env.XAI_API_KEY,
  model = process.env.XAI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
}) {
  const state = await store.load();
  const existing = new Map(state.embedding_records.map((row) => [row.source_product_id, row]));
  let processed = 0;
  let remoteCalls = 0;

  for (const semanticProfile of state.semantic_profiles) {
    if (processed >= limit) {
      break;
    }

    if (existing.has(semanticProfile.source_product_id)) {
      continue;
    }

    if (useRemote) {
      const remote = await requestRemoteEmbedding({
        text: semanticProfile.semantic_text_en || semanticProfile.semantic_text_bg || semanticProfile.semantic_summary_en,
        fetchImpl,
        apiKey,
        model,
      });
      state.embedding_records.push({
        source_product_id: semanticProfile.source_product_id,
        embedding_model: remote.embedding_model,
        embedding_dimensions: remote.vector.length,
        embedding_text: semanticProfile.semantic_text_en || semanticProfile.semantic_text_bg || semanticProfile.semantic_summary_en,
        embedding_vector_json: JSON.stringify(remote.vector),
        generated_at: generatedAt,
      });
      remoteCalls += 1;
    } else {
      state.embedding_records.push(generateEmbeddingRecord({
        sourceProductId: semanticProfile.source_product_id,
        semanticProfile,
        generatedAt,
      }));
    }

    processed += 1;
  }

  await store.save(state);
  return {
    processed,
    remote_calls: remoteCalls,
    state,
  };
}

module.exports = {
  backfillCanonicalEmbeddings,
  isEmbeddingApiConfigured,
  requestRemoteEmbedding,
};
