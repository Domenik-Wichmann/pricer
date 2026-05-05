const {
  createRuntimeDataBackboneStore,
  handleGetCanonicalProductRequest,
} = require('../app/functions/src');

const DEFAULT_API_BASE_URL = 'https://europe-west1-pricer-ee440.cloudfunctions.net/api';

async function main() {
  const options = parseArgs(process.argv.slice(2), process.env);
  if (!options.canonicalProductIds.length) {
    throw new Error('Provide one or more canonical_product_id values.');
  }

  const results = [];
  for (const canonicalProductId of options.canonicalProductIds) {
    results.push(await debugCanonicalProductSummary({
      canonicalProductId,
      apiBaseUrl: options.apiBaseUrl,
      inspectStore: options.inspectStore,
      env: process.env,
    }));
  }

  process.stdout.write(`${JSON.stringify({
    api_base_url: options.apiBaseUrl,
    inspected_store: options.inspectStore,
    results,
  }, null, 2)}\n`);
}

async function debugCanonicalProductSummary({
  canonicalProductId,
  apiBaseUrl = DEFAULT_API_BASE_URL,
  inspectStore = false,
  env = process.env,
}) {
  const apiDetail = await fetchProductDetailFromApi({
    apiBaseUrl,
    canonicalProductId,
  });
  const result = {
    canonical_product_id: canonicalProductId,
    api_detail: summarizeProductDetail(apiDetail),
  };

  if (inspectStore) {
    const store = await createRuntimeDataBackboneStore({ env });
    result.store_detail = await summarizeProductFromStore({
      store,
      canonicalProductId,
    });
  }

  return result;
}

async function fetchProductDetailFromApi({
  apiBaseUrl,
  canonicalProductId,
}) {
  const url = `${apiBaseUrl.replace(/\/+$/u, '')}/products/${encodeURIComponent(canonicalProductId)}`;
  const response = await fetch(url);
  const text = await response.text();
  let body = text;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch (_error) {
      body = text;
    }
  }
  return {
    status: response.status,
    ok: response.ok,
    body,
  };
}

function summarizeProductDetail(response) {
  const body = response && typeof response.body === 'object' && !Array.isArray(response.body)
    ? response.body
    : {};
  const summary = body.current_offer_summary && typeof body.current_offer_summary === 'object'
    ? body.current_offer_summary
    : null;
  const provenance = body.provenance && typeof body.provenance === 'object'
    ? body.provenance
    : {};
  const currentOffers = Array.isArray(body.current_offers) ? body.current_offers : [];
  const sourceProductIds = Array.isArray(provenance.source_product_ids)
    ? provenance.source_product_ids
    : [];

  return {
    status: response.status,
    ok: response.ok,
    canonical_product_id: body.canonical_product_id || null,
    canonical_name: body.canonical_name || null,
    current_offer_summary: summary,
    summary_counts: pickSummaryCounts(summary),
    current_offers_count: currentOffers.length,
    canonical_mappings_count: normalizeCount(provenance.canonical_mappings_count, sourceProductIds.length),
    source_product_ids_count: sourceProductIds.length,
    source_product_ids_sample: sourceProductIds.slice(0, 10),
    source_product_ids_truncated: provenance.source_product_ids_truncated === true,
  };
}

async function summarizeProductFromStore({
  store,
  canonicalProductId,
}) {
  const handlerResponse = await handleGetCanonicalProductRequest({
    store,
    params: { id: canonicalProductId },
  });
  const mappings = await queryByValues(store, 'canonical_product_mappings', 'canonical_product_id', [canonicalProductId]);
  const sourceProductIds = [...new Set(mappings
    .map((mapping) => mapping && mapping.source_product_id)
    .filter((value) => typeof value === 'string' && value.trim()))].sort();
  const [sourceProducts, currentOffers, currentSummaries] = await Promise.all([
    queryByValues(store, 'source_products', 'source_product_id', sourceProductIds),
    queryByValues(store, 'current_product_offers', 'canonical_product_id', [canonicalProductId]),
    queryByValues(store, 'canonical_current_offer_summary', 'canonical_product_id', [canonicalProductId]),
  ]);

  return {
    handler_status: handlerResponse.status,
    handler_current_offer_summary: handlerResponse.body?.current_offer_summary || null,
    handler_summary_counts: pickSummaryCounts(handlerResponse.body?.current_offer_summary || null),
    mappings_count: mappings.length,
    source_product_ids_count: sourceProductIds.length,
    source_products_count: sourceProducts.length,
    current_product_offers_count: currentOffers.length,
    canonical_current_offer_summary_count: currentSummaries.length,
    source_product_ids_sample: sourceProductIds.slice(0, 10),
    last_seen_at: maxTextValue(sourceProducts.flatMap((sourceProduct) => [
      sourceProduct.last_seen_at,
      sourceProduct.last_seen_date,
      sourceProduct.updated_at,
    ])),
    retailer_count: countRetailers(sourceProducts),
  };
}

async function queryByValues(store, collectionName, fieldName, values) {
  const normalizedValues = [...new Set((values || [])
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean))].sort();
  if (!normalizedValues.length) {
    return [];
  }
  if (typeof store.queryCollectionByFieldValues === 'function') {
    return store.queryCollectionByFieldValues(collectionName, {
      fieldName,
      values: normalizedValues,
    });
  }
  const state = await store.load();
  const valueSet = new Set(normalizedValues);
  return (state[collectionName] || []).filter((row) => valueSet.has(row && row[fieldName]));
}

function pickSummaryCounts(summary) {
  if (!summary || typeof summary !== 'object') {
    return null;
  }
  return {
    offer_count: summary.offer_count ?? null,
    current_offer_count: summary.current_offer_count ?? null,
    historical_offer_count: summary.historical_offer_count ?? null,
    source_row_count: summary.source_row_count ?? null,
    retailer_count: summary.retailer_count ?? null,
    historical_retailer_count: summary.historical_retailer_count ?? null,
    last_seen_at: summary.last_seen_at ?? null,
    min_current_price: summary.min_current_price ?? null,
    max_current_price: summary.max_current_price ?? null,
    avg_current_price: summary.avg_current_price ?? null,
  };
}

function countRetailers(sourceProducts) {
  return new Set((sourceProducts || [])
    .map((sourceProduct) =>
      sourceProduct.source_chain_name_normalized ||
      sourceProduct.source_chain_name_raw ||
      sourceProduct.store_name_raw
    )
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)).size;
}

function maxTextValue(values) {
  return (values || [])
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim())
    .sort()
    .at(-1) || null;
}

function normalizeCount(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallback;
}

function parseArgs(args, env = process.env) {
  const options = {
    apiBaseUrl: env.PRICER_DEBUG_API_BASE_URL || DEFAULT_API_BASE_URL,
    inspectStore: false,
    canonicalProductIds: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--api-base-url') {
      options.apiBaseUrl = args[index + 1] || '';
      index += 1;
      continue;
    }
    if (arg === '--store') {
      options.inspectStore = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    options.canonicalProductIds.push(arg);
  }

  options.apiBaseUrl = options.apiBaseUrl.trim() || DEFAULT_API_BASE_URL;
  return options;
}

function printHelp() {
  process.stdout.write(`Usage:
  node scripts/debug_canonical_product_summary.js [--api-base-url URL] [--store] <canonical_product_id...>

Options:
  --api-base-url URL  API base URL to query. Defaults to deployed Functions API.
  --store             Also inspect the configured runtime store via PRICER_STORE_BACKEND.

Examples:
  node scripts/debug_canonical_product_summary.js 065...
  $env:PRICER_STORE_BACKEND='firestore'; $env:PRICER_FIRESTORE_COLLECTION_PREFIX='prod'; node scripts/debug_canonical_product_summary.js --store 065...
`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  debugCanonicalProductSummary,
  summarizeProductDetail,
  summarizeProductFromStore,
};
