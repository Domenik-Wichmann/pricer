const assert = require('node:assert/strict');

const {
  buildUsdaClusterCandidateInspectionReport,
  normalizeClusterReportOptions,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test('DB2.5C normalizes report options deterministically', () => {
  const options = normalizeClusterReportOptions({
    limit: 0,
    minConfidence: 2,
    candidateKey: ' apple__state_raw ',
    coreFood: ' apple ',
  });
  assert.equal(options.limit, 100);
  assert.equal(options.minConfidence, 1);
  assert.equal(options.candidateKey, 'apple__state_raw');
  assert.equal(options.coreFood, 'apple');
});

test('DB2.5C builds summary, collision, confidence, and review-target reports', async () => {
  const client = new FakeClusterReportClient();
  const report = await buildUsdaClusterCandidateInspectionReport({
    client,
    limit: 10,
    minConfidence: 0.75,
  });

  assert.equal(report.total_candidates, 8);
  assert.equal(report.distinct_candidate_key_count, 7);
  assert.deepEqual(report.summary_by_source_data_type[0], { key: 'foundation_food', count: 6 });
  assert.equal(report.summary_by_review_status.find((row) => row.key === 'needs_review').count, 4);
  assert.equal(report.candidate_key_collision_report[0].candidate_key, 'apple__state_raw');
  assert.equal(report.hard_boundary_signature_collision_report.length > 0, true);
  assert.equal(report.low_confidence_candidates.some((row) => row.candidate_id === 'candidate:applesauce'), true);
  assert.equal(report.candidates_missing_expected_parsed_qualifiers[0].candidate_id, 'candidate:bad');
  assert.equal(report.representative_score_distribution.buckets.high_gte_75, 3);
  assert.equal(report.top_ambiguous_core_food_normalized_values[0].core_food_normalized, 'apple');
  assert.equal(report.recommended_next_review_targets.some((target) => target.reason === 'candidate_key_collisions'), true);
});

test('DB2.5C candidate-key filter scopes all report sections', async () => {
  const client = new FakeClusterReportClient();
  const report = await buildUsdaClusterCandidateInspectionReport({
    client,
    candidateKey: 'rice__grain_state_cooked',
    limit: 10,
  });

  assert.equal(report.total_candidates, 1);
  assert.equal(report.distinct_candidate_key_count, 1);
  assert.equal(report.candidate_key_collision_report.length, 0);
  assert.equal(report.summary_by_source_data_type[0].key, 'sr_legacy_food');
});

test('DB2.5C core-food filter finds normalized or display core names', async () => {
  const client = new FakeClusterReportClient();
  const report = await buildUsdaClusterCandidateInspectionReport({
    client,
    coreFood: 'milk',
    limit: 10,
  });

  assert.equal(report.total_candidates, 1);
  assert.equal(report.summary_by_source_data_type[0].count, 1);
  assert.equal(report.low_confidence_candidates[0].core_food_normalized, 'milk_whole_3_25');
});

class FakeClusterReportClient {
  constructor() {
    this.rows = [
      row('candidate:apple-1', 'apple__state_raw', 'apple', 'Apple', 100, 'Apples, raw', 'foundation_food', 'state:raw', 88, 'high', 'candidate', { hard_boundary_tokens: ['state:raw'], state: 'raw' }),
      row('candidate:apple-2', 'apple__state_raw', 'apple', 'Apple', 101, 'Apples, with skin, raw', 'sr_legacy_food', 'state:raw', 76, 'high', 'candidate', { hard_boundary_tokens: ['state:raw'], state: 'raw' }),
      row('candidate:apple-juice', 'apple_juice__form_juice', 'apple', 'Apple juice', 102, 'Apple juice', 'foundation_food', 'form:juice', 70, 'medium', 'needs_review', { hard_boundary_tokens: ['form:juice'], form: 'juice' }),
      row('candidate:applesauce', 'applesauce__form_sauce', 'apple', 'Applesauce', 103, 'Applesauce, sweetened', 'foundation_food', 'form:sauce|sweet:sweetened', 48, 'low', 'needs_review', { hard_boundary_tokens: ['form:sauce', 'sweet:sweetened'], form: 'sauce' }),
      row('candidate:rice-cooked', 'rice__grain_state_cooked', 'rice', 'Rice', 200, 'Rice, cooked', 'sr_legacy_food', 'grain_state:cooked', 63, 'medium', 'candidate', { hard_boundary_tokens: ['grain_state:cooked'], grain_state: 'cooked' }),
      row('candidate:milk', 'milk_whole_3_25__milk_fat_whole_3_25', 'milk_whole_3_25', 'Milk whole 3.25', 300, 'Milk, whole', 'foundation_food', 'milk_fat:whole_3_25', 52, 'low', 'needs_review', { hard_boundary_tokens: ['milk_fat:whole_3_25'], milk_fat_level: 'whole_3_25' }),
      row('candidate:beans', 'beans_black__drained_drained_rinsed', 'beans_black', 'Beans black', 400, 'Beans, black, drained', 'foundation_food', 'drained:drained_rinsed', 78, 'high', 'candidate', { hard_boundary_tokens: ['drained:drained_rinsed'], drained_status: 'drained_rinsed' }),
      row('candidate:bad', 'bad_food__generic', 'bad_food', 'Bad food', 500, 'Bad food', 'foundation_food', 'generic', 40, 'low', 'needs_review', {}),
    ];
  }

  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim();
    const rows = this.applyFilter(normalized, params);

    if (normalized.startsWith('SELECT COUNT(*)::bigint AS total_candidates')) {
      return {
        rows: [{
          total_candidates: rows.length,
          distinct_candidate_key_count: new Set(rows.map((candidate) => candidate.candidate_key)).size,
        }],
      };
    }
    if (normalized.startsWith('SELECT source_data_type AS key')) {
      return { rows: groupCount(rows, 'source_data_type') };
    }
    if (normalized.startsWith('SELECT review_status AS key')) {
      return { rows: groupCount(rows, 'review_status') };
    }
    if (normalized.startsWith('SELECT candidate_key, COUNT(*)')) {
      return { rows: candidateKeyCollisions(rows, lastParam(params)) };
    }
    if (normalized.startsWith('SELECT hard_boundary_signature, COUNT(*)')) {
      return { rows: hardBoundaryCollisions(rows, lastParam(params)) };
    }
    if (normalized.includes('parsed_qualifiers_json IS NULL')) {
      return { rows: rows.filter((candidate) => !Array.isArray(candidate.parsed_qualifiers_json.hard_boundary_tokens)).slice(0, lastParam(params)) };
    }
    if (normalized.startsWith('SELECT candidate_id, candidate_key') && normalized.includes('representative_score <')) {
      const threshold = findNumberParam(params, 75);
      return {
        rows: rows
          .filter((candidate) => candidate.representative_score < threshold || candidate.confidence === 'low' || candidate.review_status === 'needs_review')
          .sort((left, right) => left.representative_score - right.representative_score)
          .slice(0, lastParam(params)),
      };
    }
    if (normalized.startsWith('SELECT MIN(representative_score)::numeric')) {
      return { rows: [scoreStats(rows)] };
    }
    if (normalized.startsWith('SELECT core_food_normalized, MIN(core_food_name)')) {
      const threshold = findNumberParam(params, 75);
      return { rows: ambiguousCoreFoods(rows, threshold, lastParam(params)) };
    }

    throw new Error(`Unexpected fake query: ${normalized.slice(0, 160)}`);
  }

  applyFilter(sql, params) {
    let rows = [...this.rows];
    if (sql.includes('candidate_key =')) {
      const candidateKey = params.find((param) => String(param).includes('__'));
      rows = rows.filter((candidate) => candidate.candidate_key === candidateKey);
    }
    if (sql.includes('core_food_normalized ILIKE')) {
      const pattern = params.find((param) => String(param).startsWith('%') && String(param).endsWith('%'));
      const term = String(pattern || '').replace(/%/g, '').toLowerCase();
      rows = rows.filter((candidate) => (
        candidate.core_food_normalized.toLowerCase().includes(term)
        || candidate.core_food_name.toLowerCase().includes(term)
      ));
    }
    return rows;
  }
}

function row(candidateId, candidateKey, coreFoodNormalized, coreFoodName, fdcId, description, dataType, hardBoundary, score, confidence, reviewStatus, qualifiers) {
  return {
    candidate_id: candidateId,
    candidate_key: candidateKey,
    core_food_name: coreFoodName,
    core_food_normalized: coreFoodNormalized,
    source_fdc_id: fdcId,
    source_description: description,
    source_data_type: dataType,
    hard_boundary_signature: hardBoundary,
    representative_score: score,
    representative_score_json: { score, has_macro_data: true },
    confidence,
    review_status: reviewStatus,
    parsed_qualifiers_json: qualifiers,
  };
}

function groupCount(rows, field) {
  const counts = new Map();
  rows.forEach((candidate) => counts.set(candidate[field], (counts.get(candidate[field]) || 0) + 1));
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || String(left.key).localeCompare(String(right.key)));
}

function candidateKeyCollisions(rows, limit) {
  return groupRows(rows, 'candidate_key')
    .filter((group) => group.rows.length > 1)
    .map((group) => ({
      candidate_key: group.key,
      candidate_count: group.rows.length,
      distinct_hard_boundary_count: new Set(group.rows.map((candidate) => candidate.hard_boundary_signature)).size,
      example_fdc_ids: group.rows.slice(0, 5).map((candidate) => candidate.source_fdc_id),
      example_descriptions: group.rows.slice(0, 5).map((candidate) => candidate.source_description),
    }))
    .slice(0, limit);
}

function hardBoundaryCollisions(rows, limit) {
  return groupRows(rows, 'hard_boundary_signature')
    .filter((group) => group.rows.length > 1)
    .map((group) => ({
      hard_boundary_signature: group.key,
      candidate_count: group.rows.length,
      distinct_candidate_key_count: new Set(group.rows.map((candidate) => candidate.candidate_key)).size,
      example_core_foods: [...new Set(group.rows.map((candidate) => candidate.core_food_normalized))].slice(0, 5),
    }))
    .sort((left, right) => right.distinct_candidate_key_count - left.distinct_candidate_key_count || right.candidate_count - left.candidate_count)
    .slice(0, limit);
}

function scoreStats(rows) {
  const scores = rows.map((candidate) => Number(candidate.representative_score));
  return {
    min_score: scores.length ? Math.min(...scores) : null,
    max_score: scores.length ? Math.max(...scores) : null,
    average_score: scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null,
    low_bucket_count: scores.filter((score) => score < 55).length,
    medium_bucket_count: scores.filter((score) => score >= 55 && score < 75).length,
    high_bucket_count: scores.filter((score) => score >= 75).length,
  };
}

function ambiguousCoreFoods(rows, threshold, limit) {
  return groupRows(rows, 'core_food_normalized')
    .map((group) => ({
      core_food_normalized: group.key,
      core_food_name: group.rows[0].core_food_name,
      candidate_count: group.rows.length,
      distinct_candidate_key_count: new Set(group.rows.map((candidate) => candidate.candidate_key)).size,
      low_confidence_count: group.rows.filter((candidate) => candidate.representative_score < threshold || candidate.confidence === 'low').length,
      needs_review_count: group.rows.filter((candidate) => candidate.review_status === 'needs_review').length,
      example_candidate_keys: [...new Set(group.rows.map((candidate) => candidate.candidate_key))].slice(0, 5),
    }))
    .filter((group) => group.distinct_candidate_key_count > 1 || group.needs_review_count > 0)
    .sort((left, right) => right.distinct_candidate_key_count - left.distinct_candidate_key_count || right.needs_review_count - left.needs_review_count)
    .slice(0, limit);
}

function groupRows(rows, field) {
  const groups = new Map();
  rows.forEach((candidate) => {
    const key = candidate[field];
    groups.set(key, [...(groups.get(key) || []), candidate]);
  });
  return [...groups.entries()].map(([key, groupedRows]) => ({ key, rows: groupedRows }));
}

function lastParam(params) {
  return Number(params[params.length - 1]) || 100;
}

function findNumberParam(params, fallback) {
  return params.find((param) => typeof param === 'number' && param !== lastParam(params)) || fallback;
}

async function run() {
  let failed = 0;

  for (const entry of tests) {
    try {
      await entry.fn();
      console.log(`PASS ${entry.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${entry.name}`);
      console.error(error.stack);
    }
  }

  console.log(`\nDB2.5 USDA cluster report tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
