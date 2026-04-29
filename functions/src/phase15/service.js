const {
  ENRICHMENT_FILTER_FIELDS,
  LAYER_SELECTIONS,
  buildCanonicalEnrichmentAnalytics,
  getCanonicalProductViewById,
  listCanonicalProductViews,
  searchCanonicalProductViews,
} = require('./readers');
const {
  buildGapSignalFromSearch,
  normalizeLocalityCode,
  persistGapSignal,
} = require('../phase18/gap_detection');

const DEFAULT_PRODUCT_LAYER_MODE = LAYER_SELECTIONS.CANONICAL_WITH_ENRICHMENT;
const DEFAULT_SEARCH_LIMIT = 25;
const MAX_SEARCH_LIMIT = 100;
const DEFAULT_ANALYTICS_LIMIT = 200;
const FACET_FIELDS = Object.freeze([
  'category_l1',
  'category_l2',
  'category_l3',
  'brand',
  'base_product',
  'flavor',
  'attributes',
]);
const MARKER_KEYS = Object.freeze([
  'volume_marker',
  'count_marker',
  'age_band_marker',
  'reserve_marker',
]);

async function handleGetCanonicalProductRequest({
  store,
  params = {},
  query = {},
}) {
  const canonicalProductId = typeof params.id === 'string' ? params.id.trim() : '';
  if (!canonicalProductId) {
    return {
      status: 400,
      body: {
        error: 'product id is required',
      },
    };
  }

  const layerMode = resolveRequestedLayerMode(query.layer_mode);
  if (!layerMode.ok) {
    return layerMode.response;
  }

  const state = await store.load();
  const view = getCanonicalProductViewById({
    state,
    canonicalProductId,
    layerSelection: layerMode.layerMode,
  });
  if (!view) {
    return {
      status: 404,
      body: {
        error: 'product not found',
        canonical_product_id: canonicalProductId,
        layer_mode: layerMode.layerMode,
      },
    };
  }

  return {
    status: 200,
    body: buildProductDetailResponse(view),
  };
}

async function handleSearchCanonicalProductsRequest({
  store,
  body,
  req,
}) {
  if (!body || typeof body.query !== 'string') {
    return {
      status: 400,
      body: {
        error: 'query is required',
      },
    };
  }

  const layerMode = resolveRequestedLayerMode(body.layer_mode);
  if (!layerMode.ok) {
    return layerMode.response;
  }

  const limit = resolveLimit(body.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
  const offset = resolveOffset(body.offset);
  const filters = resolveFilterObject(body.filters);
  if (filters.error) {
    return filters.error;
  }

  const state = await store.load();
  let responseBody;
  try {
    responseBody = searchCanonicalProductCatalog({
      state,
      queryText: body.query,
      layerMode: layerMode.layerMode,
      filters: filters.value,
      limit,
      offset,
    });
  } catch (error) {
    return buildLayerFilterError(error);
  }

  const response = {
    status: 200,
    body: responseBody,
  };
  await persistGapSignal(store, buildGapSignalFromSearch({
    query: body.query,
    results: responseBody.results,
    locality_code: normalizeLocalityCode(
      body.locality_code ||
      req?.query?.locality_code ||
      req?.headers?.['x-pricer-locality-code']
    ),
    chain_id:
      body.chain_id ||
      req?.query?.chain_id ||
      req?.headers?.['x-pricer-chain-id'],
    chain_name:
      body.chain_name ||
      req?.query?.chain_name ||
      req?.headers?.['x-pricer-chain-name'],
    store_id:
      body.store_id ||
      req?.query?.store_id ||
      req?.headers?.['x-pricer-store-id'],
    store_name:
      body.store_name ||
      req?.query?.store_name ||
      req?.headers?.['x-pricer-store-name'],
  }));
  return response;
}

async function handleCanonicalProductFilterFacetsRequest({
  store,
  body,
}) {
  const layerMode = resolveRequestedLayerMode(body?.layer_mode);
  if (!layerMode.ok) {
    return layerMode.response;
  }

  const filters = resolveFilterObject(body?.filters);
  if (filters.error) {
    return filters.error;
  }

  const state = await store.load();
  let views;
  try {
    views = typeof body?.query === 'string' && body.query.trim()
      ? searchCanonicalProductViews({
        state,
        queryText: body.query,
        layerSelection: layerMode.layerMode,
        filters: filters.value,
        limit: MAX_SEARCH_LIMIT,
      })
      : listCanonicalProductViews({
        state,
        layerSelection: layerMode.layerMode,
        filters: filters.value,
        limit: MAX_SEARCH_LIMIT,
      });
  } catch (error) {
    return buildLayerFilterError(error);
  }

  return {
    status: 200,
    body: {
      layer_mode: layerMode.layerMode,
      total: views.length,
      facets: buildFacetBuckets(views),
      applied_filters: filters.value,
    },
  };
}

async function handleGetEnrichmentAnalyticsSummaryRequest({
  store,
  query = {},
}) {
  const layerMode = resolveRequestedLayerMode(query.layer_mode);
  if (!layerMode.ok) {
    return layerMode.response;
  }

  const filters = resolveFilterObject(query.filters);
  if (filters.error) {
    return filters.error;
  }

  const state = await store.load();
  let analytics;
  try {
    analytics = buildCanonicalEnrichmentAnalytics({
      state,
      layerSelection: layerMode.layerMode,
      filters: filters.value,
      limit: DEFAULT_ANALYTICS_LIMIT,
    });
  } catch (error) {
    return buildLayerFilterError(error);
  }

  return {
    status: 200,
    body: {
      layer_mode: layerMode.layerMode,
      enrichment_coverage: analytics.enrichment_coverage,
      counts_by_category_l1: analytics.counts_by_category_l1,
      counts_by_category_l2: analytics.counts_by_category_l2,
      counts_by_category_l3: analytics.counts_by_category_l3,
      counts_by_brand: analytics.counts_by_brand,
      counts_by_base_product: analytics.counts_by_base_product,
      counts_by_flavor: analytics.counts_by_flavor,
      ingest_enrichment_run_summary: analytics.ingest_enrichment_run_summary,
    },
  };
}

function buildProductDetailResponse(view) {
  const item = buildProductListItem(view);
  return {
    layer_mode: view.layer_selection,
    ...item,
    provenance: {
      source_product_count: view.canonical_truth.source_product_count,
      canonical_mappings_count: view.canonical_mappings.length,
      enrichment_provenance: view.enrichment_provenance,
      applied_view: view.applied_view,
    },
  };
}

function buildProductListItem(view) {
  return {
    canonical_product_id: view.canonical_product_id,
    canonical_name: view.canonical_truth.canonical_display_name || null,
    markers: extractCanonicalMarkers(view.canonical_truth),
    enrichment: view.enrichment,
  };
}

function searchCanonicalProductCatalog({
  state,
  queryText,
  layerMode = DEFAULT_PRODUCT_LAYER_MODE,
  filters = {},
  limit = DEFAULT_SEARCH_LIMIT,
  offset = 0,
}) {
  const boundedLimit = resolveLimit(limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
  const boundedOffset = resolveOffset(offset);
  const results = searchCanonicalProductViews({
    state,
    queryText,
    layerSelection: layerMode,
    filters,
    limit: MAX_SEARCH_LIMIT,
  });

  return {
    layer_mode: layerMode,
    total: results.length,
    limit: boundedLimit,
    offset: boundedOffset,
    results: results
      .slice(boundedOffset, boundedOffset + boundedLimit)
      .map((view) => buildProductListItem(view)),
  };
}

function extractCanonicalMarkers(canonicalTruth) {
  const parsed = parseCanonicalAttributes(canonicalTruth?.canonical_attributes_json);
  return Object.fromEntries(MARKER_KEYS.map((key) => [key, parsed[key] || null]));
}

function parseCanonicalAttributes(value) {
  if (!value || typeof value !== 'string') {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function buildFacetBuckets(views) {
  return {
    category_l1: buildFacetCount(views, (view) => [view.enrichment?.category_l1]),
    category_l2: buildFacetCount(views, (view) => [view.enrichment?.category_l2]),
    category_l3: buildFacetCount(views, (view) => [view.enrichment?.category_l3]),
    brand: buildFacetCount(views, (view) => [view.enrichment?.brand]),
    base_product: buildFacetCount(views, (view) => [view.enrichment?.base_product]),
    flavor: buildFacetCount(views, (view) => view.enrichment?.flavor || []),
    attributes: buildFacetCount(views, (view) => view.enrichment?.attributes || []),
  };
}

function buildFacetCount(views, selector) {
  const counts = new Map();
  views.forEach((view) => {
    selector(view)
      .map((value) => normalizeFacetValue(value))
      .filter(Boolean)
      .forEach((value) => {
        counts.set(value, (counts.get(value) || 0) + 1);
      });
  });

  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.value.localeCompare(right.value);
    });
}

function resolveRequestedLayerMode(rawLayerMode) {
  const candidate = typeof rawLayerMode === 'string' && rawLayerMode.trim()
    ? rawLayerMode.trim()
    : DEFAULT_PRODUCT_LAYER_MODE;
  if (!Object.values(LAYER_SELECTIONS).includes(candidate)) {
    return {
      ok: false,
      response: {
        status: 400,
        body: {
          error: 'invalid layer_mode',
          allowed_layer_modes: Object.values(LAYER_SELECTIONS),
        },
      },
    };
  }

  return {
    ok: true,
    layerMode: candidate,
  };
}

function resolveFilterObject(filters) {
  if (filters === undefined || filters === null) {
    return { value: {} };
  }
  if (typeof filters !== 'object' || Array.isArray(filters)) {
    return {
      error: {
        status: 400,
        body: {
          error: 'filters must be an object',
        },
      },
    };
  }

  const normalized = {};
  Object.entries(filters).forEach(([key, value]) => {
    if (ENRICHMENT_FILTER_FIELDS.includes(key)) {
      normalized[key] = value;
    }
  });
  return { value: normalized };
}

function resolveLimit(rawLimit, fallback, max) {
  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function resolveOffset(rawOffset) {
  const parsed = Number.parseInt(rawOffset, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function buildLayerFilterError(error) {
  if (/does not include enrichment filters/u.test(String(error?.message || ''))) {
    return {
      status: 400,
      body: {
        error: error.message,
      },
    };
  }

  throw error;
}

function normalizeFacetValue(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

module.exports = {
  DEFAULT_PRODUCT_LAYER_MODE,
  FACET_FIELDS,
  buildProductListItem,
  handleCanonicalProductFilterFacetsRequest,
  handleGetCanonicalProductRequest,
  handleGetEnrichmentAnalyticsSummaryRequest,
  handleSearchCanonicalProductsRequest,
  resolveRequestedLayerMode,
  searchCanonicalProductCatalog,
};
