const CURRENT_OFFERS_RULES_VERSION = 'current_offers_v1';
const DEFAULT_CURRENT_OFFER_CURRENCY = 'EUR';
const {
  isRuntimeSafeCanonicalProduct,
  isRuntimeSafeCurrentOffer,
  isRuntimeSafeSourceProduct,
} = require('../phase6/product_validation');
const { inferPriceNormalization } = require('../phase15/price_normalization');

function buildCurrentOfferReadModel({
  state,
  generatedAt = new Date().toISOString(),
} = {}) {
  const latestSnapshotsBySource = buildLatestSnapshotsBySourceProduct(state?.raw_price_snapshots || []);
  const sourceProductsById = new Map((state?.source_products || []).map((row) => [row.source_product_id, row]));
  const canonicalProductsById = new Map((state?.canonical_products || []).map((row) => [row.canonical_product_id, row]));
  const mappingsBySourceId = new Map((state?.canonical_product_mappings || []).map((row) => [row.source_product_id, row]));

  const currentProductOffers = [...latestSnapshotsBySource.entries()]
    .map(([sourceProductId, snapshot]) => buildCurrentProductOffer({
      sourceProductId,
      snapshot,
      sourceProduct: sourceProductsById.get(sourceProductId) || null,
      mapping: mappingsBySourceId.get(sourceProductId) || null,
      canonicalProduct: canonicalProductsById.get(mappingsBySourceId.get(sourceProductId)?.canonical_product_id) || null,
      generatedAt,
    }))
    .filter(Boolean)
    .filter(isRuntimeSafeCurrentOffer)
    .sort(compareCurrentOffers);

  const canonicalCurrentOfferSummary = buildCanonicalCurrentOfferSummaries({
    offers: currentProductOffers,
    generatedAt,
  });

  return {
    current_product_offers: currentProductOffers,
    canonical_current_offer_summary: canonicalCurrentOfferSummary,
  };
}

function buildCurrentProductOffer({
  sourceProductId,
  snapshot,
  sourceProduct,
  mapping,
  canonicalProduct,
  generatedAt,
}) {
  if (!sourceProductId || !mapping?.canonical_product_id || !snapshot) {
    return null;
  }
  if ((sourceProduct && !isRuntimeSafeSourceProduct(sourceProduct)) ||
    (canonicalProduct && !isRuntimeSafeCanonicalProduct(canonicalProduct))) {
    return null;
  }
  const currentPrice = computeEffectivePrice(snapshot);
  if (currentPrice === null) {
    return null;
  }

  const chainId = normalizeIdentifier(
    sourceProduct?.source_chain_name_normalized ||
    snapshot.source_chain_name_normalized ||
    sourceProduct?.source_chain_name_raw ||
    snapshot.source_chain_name_raw ||
    snapshot.store_name_raw
  );
  const storeId = buildDerivedStoreId({
    localityCode: snapshot.locality_code || sourceProduct?.locality_code || null,
    storeName: snapshot.store_name_raw || sourceProduct?.store_name_raw || null,
  });
  const retailPrice = normalizePrice(snapshot.retail_price);
  const promoPrice = normalizePrice(snapshot.promo_price);
  const priceNormalization = inferPriceNormalization({
    canonicalProduct,
    currentPrice,
  });

  return {
    offer_id: buildCurrentOfferId(sourceProductId),
    canonical_product_id: mapping.canonical_product_id,
    source_product_id: sourceProductId,
    source_name: sourceProduct?.source_chain_name_raw || snapshot.source_chain_name_raw || null,
    source_product_name_raw: sourceProduct?.latest_product_name_raw || snapshot.product_name_raw || null,
    canonical_name: canonicalProduct?.canonical_display_name || canonicalProduct?.source_example_name || null,
    chain_id: chainId || null,
    chain_name: sourceProduct?.source_chain_name_raw ||
      snapshot.source_chain_name_raw ||
      sourceProduct?.source_chain_name_normalized ||
      snapshot.source_chain_name_normalized ||
      snapshot.store_name_raw ||
      null,
    retailer: sourceProduct?.source_chain_name_raw ||
      snapshot.source_chain_name_raw ||
      sourceProduct?.source_chain_name_normalized ||
      snapshot.source_chain_name_normalized ||
      null,
    store_id: storeId,
    store_name: snapshot.store_name_raw || sourceProduct?.store_name_raw || null,
    locality_code: snapshot.locality_code || sourceProduct?.locality_code || null,
    region: snapshot.locality_code || sourceProduct?.locality_code || null,
    current_price: currentPrice,
    currency: DEFAULT_CURRENT_OFFER_CURRENCY,
    retail_price: retailPrice,
    promo_price: promoPrice,
    unit_price: null,
    price_normalization: priceNormalization,
    comparison_basis: priceNormalization.comparison_basis,
    price_per_comparison_basis: priceNormalization.price_per_comparison_basis,
    is_sale: promoPrice !== null && retailPrice !== null && promoPrice > 0 && promoPrice < retailPrice,
    is_promotion: promoPrice !== null && retailPrice !== null && promoPrice > 0 && promoPrice < retailPrice,
    observed_at: snapshot.ingested_at || null,
    snapshot_date: typeof snapshot.snapshot_date === 'string' ? snapshot.snapshot_date : null,
    snapshot_id: snapshot.snapshot_id || null,
    category_code: snapshot.category_code || sourceProduct?.category_code || canonicalProduct?.canonical_category_code || null,
    canonical_product_type: canonicalProduct?.canonical_product_type || null,
    canonical_brand: canonicalProduct?.canonical_brand || null,
    source_file_name: snapshot.source_file_name || null,
    source_file_name_raw: snapshot.source_file_name_raw || sourceProduct?.source_file_name_raw || null,
    source_file_stem: snapshot.source_file_stem || sourceProduct?.source_file_stem || null,
    source_chain_name_normalized: snapshot.source_chain_name_normalized || sourceProduct?.source_chain_name_normalized || null,
    volume_marker: parseCanonicalAttributes(canonicalProduct?.canonical_attributes_json).volume_marker || null,
    count_marker: parseCanonicalAttributes(canonicalProduct?.canonical_attributes_json).count_marker || null,
    provenance: {
      source: 'phase16_current_offer_read_model',
      rules_version: CURRENT_OFFERS_RULES_VERSION,
      snapshot_id: snapshot.snapshot_id || null,
      source_product_id: sourceProductId,
      canonical_mapping_method: mapping.mapping_method || null,
      canonical_mapping_confidence: mapping.mapping_confidence || null,
    },
    updated_at: generatedAt,
    rules_version: CURRENT_OFFERS_RULES_VERSION,
  };
}

function buildCanonicalCurrentOfferSummaries({
  offers,
  generatedAt = new Date().toISOString(),
}) {
  const grouped = new Map();
  offers.forEach((offer) => {
    const entries = grouped.get(offer.canonical_product_id) || [];
    entries.push(offer);
    grouped.set(offer.canonical_product_id, entries);
  });

  return [...grouped.entries()]
    .map(([canonicalProductId, entries]) => buildCanonicalCurrentOfferSummary({
      canonicalProductId,
      offers: entries,
      generatedAt,
    }))
    .sort((left, right) => left.canonical_product_id.localeCompare(right.canonical_product_id));
}

function buildCanonicalCurrentOfferSummary({
  canonicalProductId,
  offers,
  generatedAt,
}) {
  const sortedOffers = [...offers].sort(compareCurrentOffers);
  const prices = sortedOffers.map((offer) => Number(offer.current_price)).filter((value) => Number.isFinite(value));
  const chains = [...new Set(sortedOffers.map((offer) => offer.chain_id || offer.chain_name).filter(Boolean))].sort();
  const cheapest = sortedOffers[0] || null;
  const cheapestPriceNormalization = cheapest?.price_normalization || null;

  return {
    canonical_product_id: canonicalProductId,
    canonical_name: cheapest?.canonical_name || null,
    min_current_price: prices.length ? roundMoney(Math.min(...prices)) : null,
    max_current_price: prices.length ? roundMoney(Math.max(...prices)) : null,
    avg_current_price: prices.length ? roundMoney(prices.reduce((sum, value) => sum + value, 0) / prices.length) : null,
    offer_count: sortedOffers.length,
    chain_count: chains.length,
    retailer_count: chains.length,
    cheapest_offer_id: cheapest?.offer_id || null,
    cheapest_source_product_id: cheapest?.source_product_id || null,
    cheapest_chain_id: cheapest?.chain_id || null,
    cheapest_chain: cheapest?.chain_name || cheapest?.retailer || null,
    cheapest_retailer: cheapest?.retailer || cheapest?.chain_name || null,
    cheapest_price: cheapest?.current_price ?? null,
    price_normalization: cheapestPriceNormalization,
    comparison_basis: cheapestPriceNormalization?.comparison_basis || 'unknown',
    price_per_comparison_basis: cheapestPriceNormalization?.price_per_comparison_basis ?? null,
    currency: cheapest?.currency || DEFAULT_CURRENT_OFFER_CURRENCY,
    snapshot_date: sortedOffers.map((offer) => offer.snapshot_date).filter(Boolean).sort().at(-1) || null,
    updated_at: generatedAt,
    available_chains: chains,
    rules_version: CURRENT_OFFERS_RULES_VERSION,
  };
}

async function loadCurrentOffersByCanonicalProductIds({
  store,
  canonicalProductIds = [],
}) {
  const ids = normalizeIdList(canonicalProductIds);
  if (ids.length === 0) {
    return [];
  }
  if (typeof store?.queryCollectionByFieldValues === 'function') {
    const offers = await store.queryCollectionByFieldValues('current_product_offers', {
      fieldName: 'canonical_product_id',
      values: ids,
    });
    return offers.filter(isRuntimeSafeCurrentOffer);
  }
  const state = await store.load();
  return (state.current_product_offers || [])
    .filter((offer) => ids.includes(offer.canonical_product_id))
    .filter(isRuntimeSafeCurrentOffer);
}

async function loadCurrentOffersBySourceProductIds({
  store,
  sourceProductIds = [],
}) {
  const ids = normalizeIdList(sourceProductIds);
  if (ids.length === 0) {
    return [];
  }
  if (typeof store?.queryCollectionByFieldValues === 'function') {
    const offers = await store.queryCollectionByFieldValues('current_product_offers', {
      fieldName: 'source_product_id',
      values: ids,
    });
    return offers.filter(isRuntimeSafeCurrentOffer);
  }
  const state = await store.load();
  return (state.current_product_offers || [])
    .filter((offer) => ids.includes(offer.source_product_id))
    .filter(isRuntimeSafeCurrentOffer);
}

async function loadCanonicalCurrentOfferSummaries({
  store,
  canonicalProductIds = [],
}) {
  const ids = normalizeIdList(canonicalProductIds);
  if (ids.length === 0) {
    return [];
  }
  if (typeof store?.queryCollectionByFieldValues === 'function') {
    return store.queryCollectionByFieldValues('canonical_current_offer_summary', {
      fieldName: 'canonical_product_id',
      values: ids,
    });
  }
  const state = await store.load();
  return (state.canonical_current_offer_summary || []).filter((summary) => ids.includes(summary.canonical_product_id));
}

function buildCurrentOfferId(sourceProductId) {
  return `offer_${sourceProductId}`;
}

function buildLatestSnapshotsBySourceProduct(rawPriceSnapshots) {
  const index = new Map();
  rawPriceSnapshots.forEach((row) => {
    const existing = index.get(row.source_product_id);
    if (!existing || compareSnapshotRecency(row, existing) > 0) {
      index.set(row.source_product_id, row);
    }
  });
  return index;
}

function computeEffectivePrice(snapshot) {
  const retailPrice = normalizePrice(snapshot.retail_price);
  const promoPrice = normalizePrice(snapshot.promo_price);
  if (promoPrice !== null && retailPrice !== null && promoPrice > 0 && promoPrice < retailPrice) {
    return promoPrice;
  }
  return retailPrice !== null && retailPrice > 0 ? retailPrice : null;
}

function normalizePrice(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function compareCurrentOffers(left, right) {
  if (Number(left.current_price) !== Number(right.current_price)) {
    return Number(left.current_price) - Number(right.current_price);
  }
  if (String(right.snapshot_date || '') !== String(left.snapshot_date || '')) {
    return String(right.snapshot_date || '').localeCompare(String(left.snapshot_date || ''));
  }
  return String(left.offer_id || '').localeCompare(String(right.offer_id || ''));
}

function compareSnapshotRecency(left, right) {
  if (left.snapshot_date !== right.snapshot_date) {
    return String(left.snapshot_date || '').localeCompare(String(right.snapshot_date || ''));
  }
  return String(left.ingested_at || '').localeCompare(String(right.ingested_at || ''));
}

function buildDerivedStoreId({
  localityCode,
  storeName,
}) {
  const normalizedStore = normalizeIdentifier(storeName);
  const normalizedLocality = normalizeIdentifier(localityCode);
  if (!normalizedStore) {
    return null;
  }
  return normalizedLocality ? `${normalizedLocality}::${normalizedStore}` : normalizedStore;
}

function normalizeIdentifier(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\u0400-\u04ff]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
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

function normalizeIdList(values) {
  return [...new Set((values || []).filter((value) => typeof value === 'string').map((value) => value.trim()).filter(Boolean))].sort();
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

module.exports = {
  CURRENT_OFFERS_RULES_VERSION,
  DEFAULT_CURRENT_OFFER_CURRENCY,
  buildCurrentOfferId,
  buildCurrentOfferReadModel,
  buildCanonicalCurrentOfferSummaries,
  loadCanonicalCurrentOfferSummaries,
  loadCurrentOffersByCanonicalProductIds,
  loadCurrentOffersBySourceProductIds,
};
