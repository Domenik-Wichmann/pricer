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
const { buildGroceryQueryExpansion } = require('./search_synonyms');
const {
  loadCanonicalCurrentOfferSummaries,
  loadCurrentOffersByCanonicalProductIds,
} = require('../phase16/current_offers');

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
  'size_marker',
]);
const PRODUCT_CATALOG_BASE_COLLECTIONS = Object.freeze([
  'canonical_products',
  'canonical_enrichment_store',
]);
const PRODUCT_CATALOG_APPLIED_VIEW_COLLECTIONS = Object.freeze([
  'canonical_disambiguation_queue',
  'canonical_disambiguation_decisions',
]);
const PRODUCT_DETAIL_MAPPING_LIMIT = 200;

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

  const state = await loadProductDetailState({
    store,
    canonicalProductId,
    layerMode: layerMode.layerMode,
  });
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
    body: await buildProductDetailResponse({
      store,
      view,
    }),
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

  let responseBody;
  try {
    responseBody = await searchCanonicalProductCatalogForRequest({
      store,
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

  const state = await loadProductCatalogState(store, layerMode.layerMode);
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

  const state = await loadProductCatalogState(store, layerMode.layerMode, {
    extraCollections: ['ingest_runs'],
  });
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

async function buildProductDetailResponse({
  store,
  view,
}) {
  const item = buildProductListItem(view);
  const canonicalMappings = buildBoundedDetailMappings(view.canonical_mappings);
  const currentOffers = await loadBoundedCurrentOffersForDetail({
    store,
    canonicalProductId: view.canonical_product_id,
  });
  return {
    layer_mode: view.layer_selection,
    ...item,
    current_offers: currentOffers.current_offers,
    current_offer_summary: currentOffers.current_offer_summary,
    provenance: {
      source_product_count: view.canonical_truth.source_product_count,
      canonical_mappings_count: view.canonical_mappings.length,
      source_product_ids: canonicalMappings.map((mapping) => mapping.source_product_id),
      source_product_ids_truncated: view.canonical_mappings.length > canonicalMappings.length,
      canonical_mappings: canonicalMappings,
      enrichment_provenance: view.enrichment_provenance,
      applied_view: view.applied_view,
    },
  };
}

async function loadBoundedCurrentOffersForDetail({
  store,
  canonicalProductId,
}) {
  try {
    const [offers, summaries] = await Promise.all([
      loadCurrentOffersByCanonicalProductIds({
        store,
        canonicalProductIds: [canonicalProductId],
      }),
      loadCanonicalCurrentOfferSummaries({
        store,
        canonicalProductIds: [canonicalProductId],
      }),
    ]);
    const sortedOffers = offers
      .map(buildProductDetailOffer)
      .sort((left, right) => {
        if (Number(left.current_price) !== Number(right.current_price)) {
          return Number(left.current_price) - Number(right.current_price);
        }
        return String(left.offer_id || '').localeCompare(String(right.offer_id || ''));
      })
      .slice(0, 25);
    return {
      current_offers: sortedOffers,
      current_offer_summary: summaries[0] || null,
    };
  } catch (error) {
    if (/Unknown data backbone collection/u.test(String(error?.message || ''))) {
      return {
        current_offers: [],
        current_offer_summary: null,
      };
    }
    throw error;
  }
}

function buildProductDetailOffer(offer) {
  return {
    offer_id: offer.offer_id || null,
    canonical_product_id: offer.canonical_product_id || null,
    source_product_id: offer.source_product_id || null,
    source_product_name_raw: offer.source_product_name_raw || null,
    retailer: offer.retailer || offer.chain_name || null,
    chain_id: offer.chain_id || null,
    chain_name: offer.chain_name || null,
    store_id: offer.store_id || null,
    store_name: offer.store_name || null,
    locality_code: offer.locality_code || null,
    current_price: offer.current_price ?? null,
    currency: offer.currency || 'EUR',
    unit_price: offer.unit_price ?? null,
    is_sale: offer.is_sale === true,
    is_promotion: offer.is_promotion === true,
    snapshot_date: offer.snapshot_date || null,
    observed_at: offer.observed_at || null,
    source: offer.snapshot_id || offer.offer_id || null,
  };
}

function buildProductListItem(view) {
  const item = {
    canonical_product_id: view.canonical_product_id,
    canonical_name: view.canonical_truth.canonical_display_name || null,
    canonical_brand: view.canonical_truth.canonical_brand || null,
    canonical_product_type: view.canonical_truth.canonical_product_type || null,
    canonical_category_code: view.canonical_truth.canonical_category_code || null,
    source_example_name: view.canonical_truth.source_example_name || null,
    markers: extractCanonicalMarkers(view.canonical_truth),
    enrichment: view.enrichment,
    current_offer_summary: buildCompactCurrentOfferSummary(view.current_offer_summary),
  };
  if (view.search_debug) {
    item.search_debug = view.search_debug;
  }
  return item;
}

function buildCompactCurrentOfferSummary(summary) {
  if (!summary || typeof summary !== 'object') {
    return null;
  }

  return {
    min_current_price: summary.min_current_price ?? null,
    max_current_price: summary.max_current_price ?? null,
    avg_current_price: summary.avg_current_price ?? null,
    offer_count: summary.offer_count ?? null,
    chain_count: summary.chain_count ?? null,
    retailer_count: summary.retailer_count ?? null,
    cheapest_offer_id: summary.cheapest_offer_id || null,
    cheapest_source_product_id: summary.cheapest_source_product_id || null,
    cheapest_chain_id: summary.cheapest_chain_id || null,
    cheapest_chain: summary.cheapest_chain || null,
    cheapest_retailer: summary.cheapest_retailer || null,
    cheapest_price: summary.cheapest_price ?? summary.min_current_price ?? null,
    currency: summary.currency || null,
    snapshot_date: summary.snapshot_date || null,
    updated_at: summary.updated_at || null,
  };
}

function buildBoundedDetailMappings(canonicalMappings = []) {
  return canonicalMappings.slice(0, PRODUCT_DETAIL_MAPPING_LIMIT).map((mapping) => ({
    source_product_id: mapping.source_product_id || null,
    canonical_product_id: mapping.canonical_product_id || null,
    mapped_at: mapping.mapped_at || null,
    mapping_version: mapping.mapping_version || null,
  }));
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

async function loadProductCatalogState(store, layerMode = DEFAULT_PRODUCT_LAYER_MODE, {
  extraCollections = [],
} = {}) {
  const collectionNames = productCatalogCollectionNames(layerMode, {
    extraCollections,
  });
  if (typeof store.loadCollections === 'function') {
    return store.loadCollections(collectionNames);
  }
  return store.load();
}

async function loadProductDetailState({
  store,
  canonicalProductId,
  layerMode = DEFAULT_PRODUCT_LAYER_MODE,
}) {
  if (store?.prefersScopedProductSearch && typeof store.queryCollection === 'function') {
    const [canonicalProducts, canonicalProductMappings, canonicalEnrichmentStore, appliedState] = await Promise.all([
      store.queryCollection('canonical_products', {
        fieldName: 'canonical_product_id',
        value: canonicalProductId,
      }),
      loadCanonicalProductMappingsForDetail({
        store,
        canonicalProductId,
      }),
      store.queryCollection('canonical_enrichment_store', {
        fieldName: 'canonical_fingerprint',
        value: canonicalProductId,
      }),
      loadAppliedViewStateIfNeeded(store, layerMode),
    ]);

    return {
      canonical_products: canonicalProducts,
      canonical_product_mappings: canonicalProductMappings,
      canonical_enrichment_store: canonicalEnrichmentStore,
      ...appliedState,
    };
  }

  const state = await loadProductCatalogState(store, layerMode);
  state.canonical_product_mappings = await loadCanonicalProductMappingsForDetail({
    store,
    canonicalProductId,
  });
  return state;
}

async function searchCanonicalProductCatalogForRequest({
  store,
  queryText,
  layerMode = DEFAULT_PRODUCT_LAYER_MODE,
  filters = {},
  limit = DEFAULT_SEARCH_LIMIT,
  offset = 0,
}) {
  const state = await loadProductSearchState({
    store,
    queryText,
    layerMode,
  });
  const boundedLimit = resolveLimit(limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
  const boundedOffset = resolveOffset(offset);
  const views = searchCanonicalProductViews({
    state,
    queryText,
    layerSelection: layerMode,
    filters,
    limit: MAX_SEARCH_LIMIT,
  });

  return buildProductSearchResponseWithCurrentOfferSummaries({
    store,
    views,
    layerMode,
    limit: boundedLimit,
    offset: boundedOffset,
  });
}

async function buildProductSearchResponseWithCurrentOfferSummaries({
  store,
  views,
  layerMode,
  limit,
  offset,
}) {
  const canonicalProductIds = [...new Set((views || [])
    .map((view) => view.canonical_product_id)
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim()))].sort();

  const summariesById = await loadCurrentOfferSummariesByCanonicalId({
    store,
    canonicalProductIds,
  });
  const entries = (views || []).map((view, index) => {
    const currentOfferSummary = summariesById.get(view.canonical_product_id) || null;
    return {
      index,
      has_current_offer_summary: Boolean(currentOfferSummary),
      item: buildProductListItem({
        ...view,
        current_offer_summary: currentOfferSummary,
      }),
    };
  }).sort((left, right) => {
    if (left.has_current_offer_summary !== right.has_current_offer_summary) {
      return Number(right.has_current_offer_summary) - Number(left.has_current_offer_summary);
    }
    return left.index - right.index;
  });

  return {
    layer_mode: layerMode,
    total: entries.length,
    limit,
    offset,
    results: entries
      .slice(offset, offset + limit)
      .map((entry) => entry.item),
  };
}

async function loadCurrentOfferSummariesByCanonicalId({
  store,
  canonicalProductIds,
}) {
  if (!canonicalProductIds.length) {
    return new Map();
  }

  let summaries = [];
  try {
    summaries = await loadCanonicalCurrentOfferSummaries({
      store,
      canonicalProductIds,
    });
  } catch (error) {
    if (!/Unknown data backbone collection/u.test(String(error?.message || ''))) {
      throw error;
    }
  }

  return new Map((summaries || [])
    .filter((summary) => summary?.canonical_product_id)
    .map((summary) => [summary.canonical_product_id, summary]));
}

async function loadProductSearchState({
  store,
  queryText,
  layerMode = DEFAULT_PRODUCT_LAYER_MODE,
}) {
  if (!store?.prefersScopedProductSearch || typeof store.queryCollectionPrefix !== 'function') {
    return loadProductCatalogState(store, layerMode);
  }

  const expansion = buildGroceryQueryExpansion(queryText);
  const prefixes = [
    ...searchTokens(queryText),
    ...expansion.expanded_tokens,
    ...expansion.expanded_terms.flatMap((term) => searchTokens(term)),
  ].filter((token) => token.length >= 2).slice(0, 8);
  if (prefixes.length === 0) {
    return {
      canonical_products: [],
      canonical_enrichment_store: [],
      ...await loadAppliedViewStateIfNeeded(store, layerMode),
    };
  }

  const prefixLimit = MAX_SEARCH_LIMIT * 2;
  const candidateGroups = await Promise.all(prefixes.flatMap((prefix) =>
    searchPrefixVariants(prefix).flatMap((prefixVariant) => [
      store.queryCollectionPrefix('canonical_products', {
        fieldName: 'canonical_display_name',
        prefix: prefixVariant,
        limit: prefixLimit,
      }),
      store.queryCollectionPrefix('canonical_products', {
        fieldName: 'source_example_name',
        prefix: prefixVariant,
        limit: prefixLimit,
      }),
      store.queryCollectionPrefix('canonical_products', {
        fieldName: 'canonical_product_type',
        prefix: prefixVariant,
        limit: prefixLimit,
      }),
      store.queryCollectionPrefix('canonical_products', {
        fieldName: 'canonical_brand',
        prefix: prefixVariant,
        limit: prefixLimit,
      }),
    ])
  ));
  const canonicalProducts = dedupeCanonicalProducts(candidateGroups.flat());
  if (canonicalProducts.length === 0) {
    return loadProductCatalogState(store, layerMode);
  }

  const canonicalIds = canonicalProducts
    .map((product) => product.canonical_product_id)
    .filter(Boolean);
  const [canonicalEnrichmentStore, appliedState] = await Promise.all([
    canonicalIds.length > 0 && typeof store.queryCollectionByFieldValues === 'function'
      ? store.queryCollectionByFieldValues('canonical_enrichment_store', {
        fieldName: 'canonical_fingerprint',
        values: canonicalIds,
      })
      : Promise.resolve([]),
    loadAppliedViewStateIfNeeded(store, layerMode),
  ]);

  return {
    canonical_products: canonicalProducts,
    canonical_product_mappings: [],
    canonical_enrichment_store: canonicalEnrichmentStore,
    ...appliedState,
  };
}

async function loadAppliedViewStateIfNeeded(store, layerMode) {
  if (
    layerMode !== LAYER_SELECTIONS.CANONICAL_WITH_APPLIED_VIEW &&
    layerMode !== LAYER_SELECTIONS.CANONICAL_WITH_APPLIED_VIEW_AND_ENRICHMENT
  ) {
    return {
      canonical_disambiguation_queue: [],
      canonical_disambiguation_decisions: [],
    };
  }
  if (typeof store.loadCollections === 'function') {
    const state = await store.loadCollections(PRODUCT_CATALOG_APPLIED_VIEW_COLLECTIONS);
    return {
      canonical_disambiguation_queue: state.canonical_disambiguation_queue || [],
      canonical_disambiguation_decisions: state.canonical_disambiguation_decisions || [],
    };
  }
  const state = await store.load();
  return {
    canonical_disambiguation_queue: state.canonical_disambiguation_queue || [],
    canonical_disambiguation_decisions: state.canonical_disambiguation_decisions || [],
  };
}

async function loadCanonicalProductMappingsForDetail({
  store,
  canonicalProductId,
}) {
  if (typeof store.queryCollection === 'function') {
    return store.queryCollection('canonical_product_mappings', {
      fieldName: 'canonical_product_id',
      value: canonicalProductId,
    });
  }

  const state = await store.load();
  return (state.canonical_product_mappings || []).filter(
    (mapping) => mapping.canonical_product_id === canonicalProductId
  );
}

function productCatalogCollectionNames(layerMode = DEFAULT_PRODUCT_LAYER_MODE, {
  extraCollections = [],
} = {}) {
  const collections = [...PRODUCT_CATALOG_BASE_COLLECTIONS];
  if (
    layerMode === LAYER_SELECTIONS.CANONICAL_WITH_APPLIED_VIEW ||
    layerMode === LAYER_SELECTIONS.CANONICAL_WITH_APPLIED_VIEW_AND_ENRICHMENT
  ) {
    collections.push(...PRODUCT_CATALOG_APPLIED_VIEW_COLLECTIONS);
  }
  collections.push(...extraCollections);
  return [...new Set(collections)];
}

function searchTokens(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9\u00c0-\u024f\u0400-\u04ff%]+/u)
    .filter(Boolean);
}

function searchPrefixVariants(prefix) {
  const value = String(prefix || '').trim();
  if (!value) {
    return [];
  }
  return [...new Set([
    value,
    value.toLocaleLowerCase('bg'),
    value.toLocaleUpperCase('bg'),
    `${value.charAt(0).toLocaleUpperCase('bg')}${value.slice(1).toLocaleLowerCase('bg')}`,
  ])];
}

function dedupeCanonicalProducts(products) {
  const byId = new Map();
  (products || []).forEach((product) => {
    if (product?.canonical_product_id && !byId.has(product.canonical_product_id)) {
      byId.set(product.canonical_product_id, product);
    }
  });
  return [...byId.values()].sort(
    (left, right) => String(left.canonical_product_id).localeCompare(String(right.canonical_product_id))
  );
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
  buildCompactCurrentOfferSummary,
  buildProductSearchResponseWithCurrentOfferSummaries,
  buildProductDetailResponse,
  handleCanonicalProductFilterFacetsRequest,
  handleGetCanonicalProductRequest,
  handleGetEnrichmentAnalyticsSummaryRequest,
  handleSearchCanonicalProductsRequest,
  loadCurrentOfferSummariesByCanonicalId,
  loadProductCatalogState,
  loadCanonicalProductMappingsForDetail,
  loadProductDetailState,
  loadProductSearchState,
  productCatalogCollectionNames,
  resolveRequestedLayerMode,
  searchCanonicalProductCatalog,
  searchCanonicalProductCatalogForRequest,
};
