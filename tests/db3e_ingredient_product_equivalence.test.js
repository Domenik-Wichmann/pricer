const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildIngredientProductMappingSuggestions,
  buildProductCandidates,
  insertProductCandidate,
  listIngredientProductMappingsByIngredient,
  listProductsByIngredient,
  matchProductCandidateToIngredient,
  reviewIngredientProductMapping,
  suggestIngredientProductMappings,
  upsertIngredientProductMapping,
} = require('../app/functions/src');

function makeIngredient(overrides = {}) {
  return {
    ingredient_id: 'ingredient:apple',
    ingredient_key: 'apple',
    name_en: 'Apple',
    name_bg: 'yabalka',
    normalized_name: 'apple',
    food_family: 'fruit',
    ingredient_type: 'whole_food',
    aliases_json: { en: ['apple'], bg: ['yabalka'], all: ['apple', 'yabalka'] },
    state_defaults_json: {},
    ...overrides,
  };
}

function makeClient() {
  const state = {
    candidates: new Map(),
    mappings: new Map(),
    commands: [],
  };
  return {
    state,
    async query(sql, params = []) {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();
      state.commands.push({ sql: normalizedSql, params });
      if (normalizedSql.startsWith('INSERT INTO ingredient_product_candidates')) {
        return upsertCandidate(state, params);
      }
      if (normalizedSql.startsWith('INSERT INTO ingredient_product_mappings')) {
        return upsertMapping(state, params);
      }
      if (normalizedSql.startsWith('SELECT * FROM ingredient_product_mappings WHERE ingredient_id')) {
        const [ingredientId, limit] = params;
        return {
          rows: [...state.mappings.values()]
            .filter((row) => row.ingredient_id === ingredientId)
            .sort((left, right) => String(left.review_status).localeCompare(String(right.review_status)) || right.confidence - left.confidence)
            .slice(0, limit),
        };
      }
      if (normalizedSql.startsWith('SELECT m.*, c.candidate_id')) {
        const [ingredientId, reviewStatus, limit] = params;
        return {
          rows: [...state.mappings.values()]
            .filter((row) => row.ingredient_id === ingredientId && row.review_status === reviewStatus)
            .map((mapping) => ({ ...mapping, ...(state.candidates.get(mapping.product_id) || {}) }))
            .slice(0, limit),
        };
      }
      if (normalizedSql.startsWith('UPDATE ingredient_product_mappings')) {
        return reviewMapping(state, params, normalizedSql.includes('WHERE mapping_id = $1'));
      }
      throw new Error(`Unexpected SQL: ${normalizedSql}`);
    },
  };
}

function upsertCandidate(state, params) {
  const [
    candidate_id,
    product_id,
    product_name,
    normalized_product_name,
    brand,
    size,
    unit,
    parsed_attributes_json,
    proposed_ingredient_key,
    match_confidence,
    generation_method,
    review_status,
  ] = params;
  const existing = state.candidates.get(product_id);
  const row = {
    candidate_id: existing ? existing.candidate_id : candidate_id,
    product_id,
    product_name,
    normalized_product_name,
    brand,
    size,
    unit,
    parsed_attributes_json: JSON.parse(parsed_attributes_json || '{}'),
    proposed_ingredient_key,
    match_confidence,
    generation_method,
    review_status: existing && ['approved', 'rejected'].includes(existing.review_status) ? existing.review_status : review_status,
  };
  state.candidates.set(product_id, row);
  return { rows: [row] };
}

function upsertMapping(state, params) {
  const [
    mapping_id,
    ingredient_id,
    product_id,
    mapping_type,
    confidence,
    review_status,
    reviewed_by,
    reviewed_at,
    review_reason,
    generation_method,
  ] = params;
  const key = `${ingredient_id}|${product_id}`;
  const existing = state.mappings.get(key);
  if (existing && ['approved', 'rejected'].includes(existing.review_status)) {
    return { rows: [existing] };
  }
  const row = {
    mapping_id: existing ? existing.mapping_id : mapping_id,
    ingredient_id,
    product_id,
    mapping_type,
    confidence,
    review_status,
    reviewed_by,
    reviewed_at,
    review_reason,
    generation_method,
  };
  state.mappings.set(key, row);
  return { rows: [row] };
}

function reviewMapping(state, params, byMappingId) {
  const row = byMappingId
    ? [...state.mappings.values()].find((entry) => entry.mapping_id === params[0])
    : state.mappings.get(`${params[0]}|${params[1]}`);
  if (!row) return { rows: [] };
  if (byMappingId) {
    row.review_status = params[1];
    row.mapping_type = params[2] || row.mapping_type;
    row.reviewed_by = params[3];
    row.review_reason = params[4];
  } else {
    row.review_status = params[2];
    row.mapping_type = params[3] || row.mapping_type;
    row.reviewed_by = params[4];
    row.review_reason = params[5];
  }
  return { rows: [row] };
}

async function run() {
  const migration = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'migrations', '017_db3e_ingredient_product_equivalence.sql'),
    'utf8',
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ingredient_product_candidates/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ingredient_product_mappings/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ingredient_substitution_groups/);
  assert.match(migration, /mapping_type IN \('exact_match', 'close_match', 'substitute', 'rejected'\)/);
  assert.match(migration, /review_status IN \('suggested', 'approved', 'rejected', 'needs_review'\)/);

  const apple = makeIngredient();
  const tomato = makeIngredient({
    ingredient_id: 'ingredient:tomato',
    ingredient_key: 'tomato',
    name_en: 'Tomato',
    normalized_name: 'tomato',
    food_family: 'vegetable',
    aliases_json: { en: ['tomato'], bg: ['domati'], all: ['tomato', 'domati'] },
  });
  const products = buildProductCandidates([
    {
      product_id: 'product:apple_1kg',
      product_name: 'Fresh apple 1kg',
      category_hint: 'fruit',
      proposed_ingredient_key: 'apple',
    },
    {
      product_id: 'product:domati',
      product_name: 'Domati cherveni 500g',
      category_hint: 'vegetable',
    },
  ]);
  assert.equal(products.length, 2);
  assert.equal(products[0].review_status, 'suggested');

  const appleMatch = matchProductCandidateToIngredient(products[0], apple);
  assert.equal(appleMatch.mapping_type, 'exact_match');
  assert.equal(appleMatch.review_status, 'suggested');
  assert(appleMatch.confidence >= 0.94);

  const tomatoAliasMatch = matchProductCandidateToIngredient(products[1], tomato);
  assert.equal(tomatoAliasMatch.mapping_type, 'exact_match');
  assert(tomatoAliasMatch.match_reason_json.reasons.includes('alias_contained'));

  const suggestions = buildIngredientProductMappingSuggestions({
    ingredients: [apple, tomato],
    productCandidates: products,
  });
  assert.equal(suggestions.length, 2);
  assert(suggestions.every((suggestion) => suggestion.review_status === 'suggested'), 'DB3E must not auto-approve suggestions');

  const client = makeClient();
  const candidate = await insertProductCandidate(client, products[0]);
  const candidateAgain = await insertProductCandidate(client, products[0]);
  assert.equal(candidate.candidate_id, candidateAgain.candidate_id);

  const written = await suggestIngredientProductMappings(client, suggestions);
  const writtenAgain = await suggestIngredientProductMappings(client, suggestions);
  assert.deepEqual(written.map((row) => row.mapping_id), writtenAgain.map((row) => row.mapping_id));

  const listed = await listIngredientProductMappingsByIngredient(client, 'ingredient:apple', { limit: 10 });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].product_id, 'product:apple_1kg');

  const approved = await reviewIngredientProductMapping(client, {
    ingredientId: 'ingredient:apple',
    productId: 'product:apple_1kg',
    reviewStatus: 'approved',
    mappingType: 'exact_match',
    reviewedBy: 'fixture_reviewer',
    reviewReason: 'good purchasable apple equivalent',
  });
  assert.equal(approved.review_status, 'approved');
  await upsertIngredientProductMapping(client, {
    ingredient_id: 'ingredient:apple',
    product_id: 'product:apple_1kg',
    mapping_type: 'rejected',
    confidence: 0.1,
    review_status: 'suggested',
  });
  assert.equal(client.state.mappings.get('ingredient:apple|product:apple_1kg').review_status, 'approved');
  assert.equal(client.state.mappings.get('ingredient:apple|product:apple_1kg').mapping_type, 'exact_match');

  await upsertIngredientProductMapping(client, {
    ingredient_id: 'ingredient:tomato',
    product_id: 'product:bad_tomato',
    mapping_type: 'rejected',
    confidence: 0.2,
    review_status: 'rejected',
    review_reason: 'wrong product',
  });
  await upsertIngredientProductMapping(client, {
    ingredient_id: 'ingredient:tomato',
    product_id: 'product:bad_tomato',
    mapping_type: 'exact_match',
    confidence: 0.99,
    review_status: 'suggested',
  });
  assert.equal(client.state.mappings.get('ingredient:tomato|product:bad_tomato').review_status, 'rejected');
  assert.equal(client.state.mappings.get('ingredient:tomato|product:bad_tomato').mapping_type, 'rejected');

  const productsByIngredient = await listProductsByIngredient(client, 'ingredient:apple', {
    reviewStatus: 'approved',
    limit: 10,
  });
  assert.equal(productsByIngredient.length, 1);
  assert.equal(productsByIngredient[0].mapping.ingredient_id, 'ingredient:apple');
  assert.equal(productsByIngredient[0].product.product_id, 'product:apple_1kg');

  const sourceText = [
    fs.readFileSync(path.join(__dirname, '..', 'functions', 'src', 'db', 'products', 'ingredient_product_repository.js'), 'utf8'),
    fs.readFileSync(path.join(__dirname, '..', 'functions', 'src', 'db', 'products', 'ingredient_product_matching.js'), 'utf8'),
  ].join('\n');
  assert(!/INSERT INTO recipes\b/i.test(sourceText), 'DB3E must not write recipes');
  assert(!/INSERT INTO recipe_ingredients\b/i.test(sourceText), 'DB3E must not write recipe ingredients');
  assert(!/Firestore/i.test(sourceText), 'DB3E must not write Firestore');
  assert(!/\bLLM\b|OpenAI|XAI_API_KEY/i.test(sourceText), 'DB3E must not call LLM providers');
  assert(client.state.commands.every((command) => !/Firestore|recipe_|recipes|LLM|OpenAI/i.test(command.sql)), 'DB3E SQL must stay product/ingredient sidecar only');

  console.log('DB3E ingredient product equivalence tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
