async function syncFirestoreToVector({
  store,
}) {
  const state = await store.load();
  const existingKeys = new Set(state.vector_index_records.map((row) => `${row.source_product_id}|${row.embedding_model}`));
  let inserted = 0;

  for (const embedding of state.embedding_records) {
    const key = `${embedding.source_product_id}|${embedding.embedding_model}`;
    if (existingKeys.has(key)) {
      continue;
    }

    state.vector_index_records.push({
      source_product_id: embedding.source_product_id,
      embedding_model: embedding.embedding_model,
      embedding_dimensions: embedding.embedding_dimensions,
      embedding_vector_json: embedding.embedding_vector_json,
      embedding_text: embedding.embedding_text,
      generated_at: embedding.generated_at,
    });
    existingKeys.add(key);
    inserted += 1;
  }

  await store.save(state);

  return {
    inserted,
    total: state.vector_index_records.length,
    state,
  };
}

module.exports = {
  syncFirestoreToVector,
};
