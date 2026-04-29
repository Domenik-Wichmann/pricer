const assert = require('node:assert/strict');

const {
  InMemoryDataBackboneStore,
  buildGapSignalRecord,
  buildMarketOpportunityReports,
  handleGetMarketOpportunityReportsRequest,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function signal(query, status, categoryL2, avgPrice, index, options = {}) {
  const timestamp = new Date(Date.UTC(2026, 3, 25, 0, 0, 0) + index * 60000).toISOString();
  return buildGapSignalRecord({
    query,
    normalized_query: query,
    canonical_attempt: status === 'unresolved' ? null : `cp_${query.replace(/\s+/gu, '_')}`,
    status,
    confidence: status === 'resolved' ? 0.9 : status === 'ambiguous' ? 0.5 : 0.1,
    category_l1: options.category_l1 || 'Food & Beverage',
    category_l2: categoryL2,
    locality_code: options.locality_code || null,
    chain_id: options.chain_id || null,
    chain_name: options.chain_name || null,
    store_id: options.store_id || null,
    store_name: options.store_name || null,
    price_context: avgPrice === null ? {} : { avg_price: avgPrice },
    source: options.source || 'search',
    timestamp,
  });
}

function repeated({
  query,
  categoryL2,
  statuses,
  avgPrice = null,
  start = 0,
  options = {},
}) {
  return statuses.map((status, offset) => signal(query, status, categoryL2, avgPrice, start + offset, options));
}

function createOpportunityStore(extraSignals = []) {
  return new InMemoryDataBackboneStore({
    gap_signal_store: extraSignals,
  });
}

test('missing_supply report generation is evidence based', async () => {
  const store = createOpportunityStore(repeated({
    query: 'organic chicken',
    categoryL2: 'Meat',
    statuses: ['unresolved', 'unresolved', 'unresolved', 'unresolved', 'unresolved', 'unresolved', 'unresolved', 'resolved', 'resolved', 'resolved', 'resolved', 'resolved'],
    start: 0,
    options: { locality_code: 'burgas' },
  }));

  const report = await buildMarketOpportunityReports({ store, window: 'last_7d' });
  const opportunity = report.opportunities[0];

  assert.equal(opportunity.opportunity_type, 'missing_supply');
  assert.equal(opportunity.locality_code, 'burgas');
  assert.equal(opportunity.category_l2, 'Meat');
  assert.equal(opportunity.evidence.signal_count, 12);
  assert.equal(opportunity.evidence.unresolved_rate, 0.5833);
  assert.equal(opportunity.recommended_action, 'Investigate sourcing or supplier coverage for this demand.');
  assert.equal(opportunity.limitations.some((item) => item.includes('app interactions')), true);
});

test('poor_match_quality report generation works', async () => {
  const store = createOpportunityStore(repeated({
    query: 'milk',
    categoryL2: 'Dairy',
    statuses: ['ambiguous', 'ambiguous', 'ambiguous', 'ambiguous', 'ambiguous', 'resolved', 'resolved', 'resolved', 'resolved', 'resolved', 'resolved', 'resolved'],
    start: 0,
  }));

  const report = await buildMarketOpportunityReports({ store, window: 'last_7d' });
  const opportunity = report.opportunities[0];

  assert.equal(opportunity.opportunity_type, 'poor_match_quality');
  assert.equal(opportunity.evidence.ambiguous_rate, 0.4167);
  assert.equal(opportunity.recommended_action, 'Improve catalog matching, synonyms, or enrichment for this product family.');
});

test('high_price_pressure report generation works', async () => {
  const store = createOpportunityStore([
    ...repeated({
      query: 'saffron',
      categoryL2: 'Spices',
      statuses: Array(12).fill('resolved'),
      avgPrice: 15,
      start: 0,
    }),
    ...repeated({
      query: 'pepper',
      categoryL2: 'Spices',
      statuses: Array(12).fill('resolved'),
      avgPrice: 3,
      start: 20,
    }),
  ]);

  const report = await buildMarketOpportunityReports({
    store,
    window: 'last_7d',
    min_gap_score: 0,
  });
  const opportunity = report.opportunities.find((entry) => entry.title.startsWith('Saffron'));

  assert.ok(opportunity);
  assert.equal(opportunity.opportunity_type, 'high_price_pressure');
  assert.equal(opportunity.evidence.price_pressure, true);
  assert.equal(opportunity.recommended_action, 'Review pricing, promotions, or lower-cost alternatives.');
});

test('distribution_gap is generated from uneven coverage by chain', async () => {
  const store = createOpportunityStore([
    ...repeated({
      query: 'matcha latte',
      categoryL2: 'Beverages',
      statuses: ['resolved', 'resolved', 'resolved', 'resolved'],
      avgPrice: 4,
      start: 0,
      options: { locality_code: 'burgas', chain_id: 'billa', chain_name: 'Billa' },
    }),
    ...repeated({
      query: 'matcha latte',
      categoryL2: 'Beverages',
      statuses: ['unresolved', 'unresolved', 'unresolved', 'unresolved'],
      start: 10,
      options: { locality_code: 'burgas', chain_id: 'metro', chain_name: 'Metro' },
    }),
    ...repeated({
      query: 'matcha latte',
      categoryL2: 'Beverages',
      statuses: ['resolved', 'resolved', 'unresolved', 'unresolved'],
      avgPrice: 4.5,
      start: 20,
      options: { locality_code: 'burgas', chain_id: 'kaufland', chain_name: 'Kaufland' },
    }),
  ]);

  const report = await buildMarketOpportunityReports({ store, locality_code: 'burgas', window: 'last_7d' });
  const opportunity = report.opportunities[0];

  assert.equal(opportunity.opportunity_type, 'distribution_gap');
  assert.equal(opportunity.evidence.coverage_by_chain.some((entry) => entry.chain_id === 'metro' && entry.coverage_rate === 0), true);
  assert.equal(opportunity.evidence.coverage_by_chain.some((entry) => entry.chain_id === 'billa' && entry.coverage_rate === 1), true);
  assert.equal(opportunity.recommended_action, 'Compare coverage across chains and consider targeted stocking.');
});

test('data_quality_gap is used for low sample weak evidence', async () => {
  const store = createOpportunityStore(repeated({
    query: 'rare berry',
    categoryL2: 'Produce',
    statuses: ['unresolved', 'unresolved', 'resolved'],
    start: 0,
  }));

  const report = await buildMarketOpportunityReports({ store, window: 'last_7d' });
  const opportunity = report.opportunities[0];

  assert.equal(opportunity.opportunity_type, 'data_quality_gap');
  assert.equal(opportunity.confidence, 'low');
  assert.equal(opportunity.recommended_action, 'Verify catalog data and ingestion coverage before treating this as market demand.');
});

test('emerging_interest covers high-volume normal signals', async () => {
  const store = createOpportunityStore(repeated({
    query: 'protein pudding',
    categoryL2: 'Dairy',
    statuses: Array(12).fill('resolved'),
    avgPrice: 2.5,
    start: 0,
  }));

  const report = await buildMarketOpportunityReports({ store, window: 'last_7d' });

  assert.equal(report.opportunities[0].opportunity_type, 'emerging_interest');
  assert.equal(report.opportunities[0].recommended_action, 'Monitor this demand signal as more usage data accumulates.');
});

test('confidence labels use sample size and score', async () => {
  const highSignals = repeated({
    query: 'baby formula goat',
    categoryL2: 'Baby',
    statuses: [...Array(35).fill('unresolved'), ...Array(20).fill('resolved')],
    start: 0,
  });
  const mediumSignals = repeated({
    query: 'oat milk',
    categoryL2: 'Beverages',
    statuses: [...Array(7).fill('unresolved'), ...Array(5).fill('resolved')],
    start: 60,
  });
  const lowSignals = repeated({
    query: 'rare berry',
    categoryL2: 'Produce',
    statuses: ['unresolved', 'resolved'],
    start: 80,
  });
  const report = await buildMarketOpportunityReports({
    store: createOpportunityStore([...highSignals, ...mediumSignals, ...lowSignals]),
    window: 'last_7d',
  });

  assert.equal(report.opportunities.find((entry) => entry.title.startsWith('Baby Formula Goat')).confidence, 'high');
  assert.equal(report.opportunities.find((entry) => entry.title.startsWith('Oat Milk')).confidence, 'medium');
  assert.equal(report.opportunities.find((entry) => entry.title.startsWith('Rare Berry')).confidence, 'low');
});

test('filters are preserved and applied', async () => {
  const store = createOpportunityStore([
    ...repeated({
      query: 'organic chicken',
      categoryL2: 'Meat',
      statuses: Array(12).fill('unresolved'),
      start: 0,
      options: { locality_code: 'burgas', chain_id: 'metro' },
    }),
    ...repeated({
      query: 'milk',
      categoryL2: 'Dairy',
      statuses: Array(12).fill('unresolved'),
      start: 20,
      options: { locality_code: 'sofia', chain_id: 'billa' },
    }),
  ]);

  const report = await buildMarketOpportunityReports({
    store,
    locality_code: 'Burgas',
    category_l2: 'Meat',
    chain_id: 'Metro',
    limit: 5,
    min_gap_score: 2,
  });

  assert.deepEqual(report.filters, {
    locality_code: 'burgas',
    chain_id: 'metro',
    store_id: null,
    category_l1: null,
    category_l2: 'Meat',
  });
  assert.equal(report.opportunities.length, 1);
  assert.equal(report.opportunities[0].title.startsWith('Organic Chicken'), true);
});

test('sorting is deterministic by score confidence signal count and id', async () => {
  const store = createOpportunityStore([
    ...repeated({
      query: 'alpha item',
      categoryL2: 'Pantry',
      statuses: Array(12).fill('unresolved'),
      start: 0,
    }),
    ...repeated({
      query: 'beta item',
      categoryL2: 'Pantry',
      statuses: Array(10).fill('unresolved'),
      start: 20,
    }),
    ...repeated({
      query: 'gamma item',
      categoryL2: 'Pantry',
      statuses: Array(12).fill('unresolved'),
      start: 40,
    }),
  ]);
  const first = await buildMarketOpportunityReports({ store, window: 'last_7d' });
  const second = await buildMarketOpportunityReports({ store, window: 'last_7d' });

  assert.deepEqual(second, first);
  assert.equal(first.opportunities[0].evidence.signal_count, 12);
  assert.equal(first.opportunities[1].evidence.signal_count, 12);
  assert.equal(first.opportunities[2].evidence.signal_count, 10);
});

test('empty dataset and endpoint validation are safe', async () => {
  const store = createOpportunityStore();
  const empty = await buildMarketOpportunityReports({ store, window: 'all' });
  const ok = await handleGetMarketOpportunityReportsRequest({
    store,
    query: { window: 'all', limit: '2' },
  });
  const bad = await handleGetMarketOpportunityReportsRequest({
    store,
    query: { window: 'tomorrow' },
  });

  assert.deepEqual(empty.opportunities, []);
  assert.equal(ok.status, 200);
  assert.equal(bad.status, 400);
});

test('report generation does not mutate input signals', async () => {
  const store = createOpportunityStore(repeated({
    query: 'organic chicken',
    categoryL2: 'Meat',
    statuses: Array(12).fill('unresolved'),
    start: 0,
  }));
  const before = await store.load();
  await buildMarketOpportunityReports({ store, window: 'last_7d' });
  await handleGetMarketOpportunityReportsRequest({ store, query: { window: 'last_7d' } });
  const after = await store.load();

  assert.deepEqual(after.gap_signal_store, before.gap_signal_store);
});

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

  console.log(`\nPhase 20.3 tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
