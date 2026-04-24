const crypto = require('crypto');
const { EMBEDDING_MODEL } = require('./constants');

function generateEmbeddingRecord({
  sourceProductId,
  semanticProfile,
  generatedAt = new Date().toISOString(),
}) {
  const text = [semanticProfile.semantic_text_bg, semanticProfile.semantic_text_en]
    .filter(Boolean)
    .join(' || ');
  const vector = generateDeterministicEmbedding(text);

  return {
    source_product_id: sourceProductId,
    embedding_model: EMBEDDING_MODEL,
    embedding_dimensions: vector.length,
    embedding_text: text,
    embedding_vector_json: JSON.stringify(vector),
    generated_at: generatedAt,
  };
}

function generateDeterministicEmbedding(text, dimensions = 8) {
  const hash = crypto.createHash('sha256').update(text, 'utf8').digest();
  const vector = [];

  for (let index = 0; index < dimensions; index += 1) {
    const value = hash.readUInt32BE((index * 4) % (hash.length - 3));
    vector.push(Number(((value / 0xffffffff) * 2 - 1).toFixed(6)));
  }

  return vector;
}

module.exports = {
  generateDeterministicEmbedding,
  generateEmbeddingRecord,
};
