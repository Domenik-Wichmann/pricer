const DEFAULT_PRICE_MODE = 'latest';
const DEFAULT_LOOKUP_OPTIONS = Object.freeze({
  price_mode: DEFAULT_PRICE_MODE,
  max_age_days: 14,
  chain_ids: [],
  store_ids: [],
  include_history: false,
});
const ALLOWED_PRICE_MODES = Object.freeze([DEFAULT_PRICE_MODE]);
const ALLOWED_PRICE_STATUSES = Object.freeze(['priced', 'missing', 'stale']);
const DEFAULT_CURRENCY = 'EUR';
const MAX_LOOKUP_IDS = 200;

async function handleLookupCanonicalProductPricesRequest({
  store,
  body = {},
}) {
  const canonicalProductIds = normalizeCanonicalProductIds(body.canonical_product_ids);
  if (canonicalProductIds.error) {
    return canonicalProductIds.error;
  }

  const options = normalizeLookupOptions(body.options);
  if (options.error) {
    return options.error;
  }

  return {
    status: 200,
    body: await lookupCanonicalProductPrices({
      store,
      canonicalProductIds: canonicalProductIds.value,
      options: options.value,
    }),
  };
}

async function lookupCanonicalProductPrices({
  store,
  canonicalProductIds = [],
  options = {},
}) {
  const normalizedIds = normalizeCanonicalProductIds(canonicalProductIds);
  if (normalizedIds.error) {
    throw new Error(normalizedIds.error.body.error);
  }

  const normalizedOptions = normalizeLookupOptions(options);
  if (normalizedOptions.error) {
    throw new Error(normalizedOptions.error.body.error);
  }

  const state = await store.load();
  return buildCanonicalPriceLookup({
    state,
    canonicalProductIds: normalizedIds.value,
    options: normalizedOptions.value,
  });
}

function buildCanonicalPriceLookup({
  state,
  canonicalProductIds,
  options,
}) {
  const mappingIndex = buildMappingsByCanonicalId(state?.canonical_product_mappings || []);
  const sourceProductIndex = new Map(
    (state?.source_products || []).map((row) => [row.source_product_id, row])
  );
  const latestSnapshotsBySource = buildLatestSnapshotsBySourceProduct(state?.raw_price_snapshots || []);
  const historyBySource = buildHistoryBySourceProduct(state?.product_daily_prices || []);

  const items = canonicalProductIds.map((canonicalProductId) => buildCanonicalPriceItem({
    canonicalProductId,
    options,
    sourceProductIds: mappingIndex.get(canonicalProductId) || [],
    sourceProductIndex,
    latestSnapshotsBySource,
    historyBySource,
  }));
  const summary = items.reduce((accumulator, item) => {
    const next = {
      ...accumulator,
      requested_count: accumulator.requested_count + 1,
    };

    if (item.price_status === 'priced') {
      next.priced_count += 1;
    } else if (item.price_status === 'stale') {
      next.stale_count += 1;
    } else {
      next.missing_count += 1;
    }

    return next;
  }, {
    requested_count: 0,
    priced_count: 0,
    stale_count: 0,
    missing_count: 0,
  });

  return {
    price_mode: options.price_mode,
    currency: DEFAULT_CURRENCY,
    items,
    summary,
  };
}

async function lookupPricesForBasketPlan({
  store,
  basketPlan,
  options = {},
}) {
  const canonicalProductIds = collectBasketPlanCanonicalProductIds(basketPlan);
  const priceLookup = await lookupCanonicalProductPrices({
    store,
    canonicalProductIds,
    options,
  });

  return {
    basket_plan: cloneValue(basketPlan),
    price_lookup: priceLookup,
  };
}

function collectBasketPlanCanonicalProductIds(basketPlan) {
  const ids = new Set();

  (basketPlan?.ready_items || []).forEach((item) => {
    if (typeof item?.canonical_product_id === 'string' && item.canonical_product_id.trim()) {
      ids.add(item.canonical_product_id.trim());
    }
  });

  (basketPlan?.ambiguous_items || []).forEach((item) => {
    (item?.carried_candidates || []).forEach((candidate) => {
      if (typeof candidate?.canonical_product_id === 'string' && candidate.canonical_product_id.trim()) {
        ids.add(candidate.canonical_product_id.trim());
      }
    });
  });

  return [...ids].sort();
}

function buildCanonicalPriceItem({
  canonicalProductId,
  options,
  sourceProductIds,
  sourceProductIndex,
  latestSnapshotsBySource,
  historyBySource,
}) {
  const records = sourceProductIds
    .map((sourceProductId) => buildPriceRecord({
      sourceProductId,
      sourceProduct: sourceProductIndex.get(sourceProductId) || null,
      snapshot: latestSnapshotsBySource.get(sourceProductId) || null,
      maxAgeDays: options.max_age_days,
    }))
    .filter(Boolean)
    .filter((record) => matchesChainFilter(record, options.chain_ids))
    .filter((record) => matchesStoreFilter(record, options.store_ids))
    .sort(comparePriceRecords);

  const pricedRecords = records.filter((record) => !record.is_stale);
  const priceStatus = records.length === 0
    ? 'missing'
    : pricedRecords.length > 0
      ? 'priced'
      : 'stale';
  const item = {
    canonical_product_id: canonicalProductId,
    price_records: records.map(stripInternalPriceRecordFields),
    best_price: priceStatus === 'priced'
      ? buildBestPrice(pricedRecords[0])
      : null,
    price_status: priceStatus,
  };

  if (options.include_history) {
    item.history_records = sourceProductIds
      .flatMap((sourceProductId) => (historyBySource.get(sourceProductId) || []).map((row) => ({
        source_product_id: sourceProductId,
        date: row.date,
        price_avg: row.price_avg,
        price_min: row.price_min,
        price_max: row.price_max,
        store_count: row.store_count,
        snapshot_count: row.snapshot_count,
      })))
      .sort((left, right) => {
        if (left.date !== right.date) {
          return right.date.localeCompare(left.date);
        }

        return String(left.source_product_id).localeCompare(String(right.source_product_id));
      });
  }

  return item;
}

function buildPriceRecord({
  sourceProductId,
  sourceProduct,
  snapshot,
  maxAgeDays,
}) {
  if (!snapshot) {
    return null;
  }

  const chainId = normalizeIdentifier(
    sourceProduct?.source_chain_name_normalized ||
    snapshot.source_chain_name_normalized ||
    sourceProduct?.source_chain_name_raw ||
    snapshot.source_chain_name_raw ||
    snapshot.store_name_raw
  );
  const chainName =
    sourceProduct?.source_chain_name_raw ||
    snapshot.source_chain_name_raw ||
    sourceProduct?.source_chain_name_normalized ||
    snapshot.source_chain_name_normalized ||
    snapshot.store_name_raw ||
    null;
  const storeId = buildDerivedStoreId({
    localityCode: snapshot.locality_code || sourceProduct?.locality_code || null,
    storeName: snapshot.store_name_raw || sourceProduct?.store_name_raw || null,
  });
  const snapshotDate = typeof snapshot.snapshot_date === 'string' ? snapshot.snapshot_date : null;
  const isStale = computeIsStale(snapshotDate, maxAgeDays);
  const effectivePrice = computeEffectivePrice(snapshot);

  if (effectivePrice === null) {
    return null;
  }

  return {
    source_product_id: sourceProductId,
    chain_id: chainId || null,
    chain_name: chainName,
    store_id: storeId,
    store_name: snapshot.store_name_raw || null,
    price: effectivePrice,
    currency: DEFAULT_CURRENCY,
    snapshot_date: snapshotDate,
    source: snapshot.snapshot_id || sourceProductId,
    is_stale: isStale,
  };
}

function buildBestPrice(record) {
  return {
    price: record.price,
    chain_id: record.chain_id,
    currency: record.currency,
  };
}

function stripInternalPriceRecordFields(record) {
  return {
    chain_id: record.chain_id,
    chain_name: record.chain_name,
    store_id: record.store_id,
    store_name: record.store_name,
    price: record.price,
    currency: record.currency,
    snapshot_date: record.snapshot_date,
    is_stale: record.is_stale,
    source: record.source,
  };
}

function buildMappingsByCanonicalId(mappings) {
  const index = new Map();
  mappings.forEach((mapping) => {
    const entries = index.get(mapping.canonical_product_id) || [];
    entries.push(mapping.source_product_id);
    index.set(mapping.canonical_product_id, entries);
  });
  return new Map(
    [...index.entries()].map(([canonicalProductId, sourceProductIds]) => [
      canonicalProductId,
      [...new Set(sourceProductIds)].sort(),
    ])
  );
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

function buildHistoryBySourceProduct(productDailyPrices) {
  const index = new Map();

  productDailyPrices.forEach((row) => {
    const entries = index.get(row.source_product_id) || [];
    entries.push(row);
    index.set(row.source_product_id, entries);
  });

  return new Map(
    [...index.entries()].map(([sourceProductId, entries]) => [
      sourceProductId,
      [...entries].sort((left, right) => right.date.localeCompare(left.date)),
    ])
  );
}

function normalizeCanonicalProductIds(rawIds) {
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return {
      error: {
        status: 400,
        body: {
          error: 'canonical_product_ids must be a non-empty array',
        },
      },
    };
  }

  if (rawIds.length > MAX_LOOKUP_IDS) {
    return {
      error: {
        status: 400,
        body: {
          error: `canonical_product_ids exceeds max per request of ${MAX_LOOKUP_IDS}`,
        },
      },
    };
  }

  const normalized = rawIds
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);

  if (normalized.length !== rawIds.length) {
    return {
      error: {
        status: 400,
        body: {
          error: 'each canonical_product_id must be a non-empty string',
        },
      },
    };
  }

  return { value: [...new Set(normalized)].sort() };
}

function normalizeLookupOptions(rawOptions) {
  const options = rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions)
    ? rawOptions
    : {};
  const priceMode = typeof options.price_mode === 'string'
    ? options.price_mode.trim()
    : DEFAULT_LOOKUP_OPTIONS.price_mode;
  if (!ALLOWED_PRICE_MODES.includes(priceMode)) {
    return {
      error: {
        status: 400,
        body: {
          error: 'invalid price_mode',
          allowed_price_modes: ALLOWED_PRICE_MODES,
        },
      },
    };
  }

  const chainIds = normalizeFilterIds(options.chain_ids, 'chain_ids');
  if (chainIds.error) {
    return { error: chainIds.error };
  }
  const storeIds = normalizeFilterIds(options.store_ids, 'store_ids', {
    normalizer: normalizeStoreIdentifier,
  });
  if (storeIds.error) {
    return { error: storeIds.error };
  }

  return {
    value: {
      price_mode: priceMode,
      max_age_days: resolveMaxAgeDays(options.max_age_days),
      chain_ids: chainIds.value,
      store_ids: storeIds.value,
      include_history: options.include_history === true,
    },
  };
}

function normalizeFilterIds(rawValue, fieldName, options = {}) {
  const normalizer = typeof options.normalizer === 'function'
    ? options.normalizer
    : normalizeIdentifier;
  if (rawValue === undefined || rawValue === null) {
    return { value: [] };
  }
  if (!Array.isArray(rawValue)) {
    return {
      error: {
        status: 400,
        body: {
          error: `${fieldName} must be an array`,
        },
      },
    };
  }

  const normalized = rawValue
    .filter((value) => typeof value === 'string')
    .map((value) => normalizer(value))
    .filter(Boolean);

  if (normalized.length !== rawValue.length) {
    return {
      error: {
        status: 400,
        body: {
          error: `${fieldName} must contain only strings`,
        },
      },
    };
  }

  return { value: [...new Set(normalized)].sort() };
}

function resolveMaxAgeDays(rawValue) {
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LOOKUP_OPTIONS.max_age_days;
  }

  return parsed;
}

function matchesChainFilter(record, chainIds) {
  if (!Array.isArray(chainIds) || chainIds.length === 0) {
    return true;
  }

  return chainIds.includes(record.chain_id);
}

function matchesStoreFilter(record, storeIds) {
  if (!Array.isArray(storeIds) || storeIds.length === 0) {
    return true;
  }

  return record.store_id ? storeIds.includes(record.store_id) : false;
}

function comparePriceRecords(left, right) {
  if (Number(left.is_stale) !== Number(right.is_stale)) {
    return Number(left.is_stale) - Number(right.is_stale);
  }
  if (left.price !== right.price) {
    return left.price - right.price;
  }
  if ((right.snapshot_date || '') !== (left.snapshot_date || '')) {
    return String(right.snapshot_date || '').localeCompare(String(left.snapshot_date || ''));
  }

  return String(left.source_product_id).localeCompare(String(right.source_product_id));
}

function compareSnapshotRecency(left, right) {
  if (left.snapshot_date !== right.snapshot_date) {
    return String(left.snapshot_date || '').localeCompare(String(right.snapshot_date || ''));
  }

  return String(left.ingested_at || '').localeCompare(String(right.ingested_at || ''));
}

function computeEffectivePrice(snapshot) {
  const retailPrice = Number(snapshot.retail_price);
  const promoPrice = Number(snapshot.promo_price);
  if (Number.isFinite(promoPrice) && promoPrice > 0 && Number.isFinite(retailPrice) && promoPrice < retailPrice) {
    return promoPrice;
  }
  if (Number.isFinite(retailPrice) && retailPrice > 0) {
    return retailPrice;
  }

  return null;
}

function computeIsStale(snapshotDate, maxAgeDays) {
  const snapshotTime = parseDateUtc(snapshotDate);
  if (snapshotTime === null) {
    return true;
  }

  const today = parseDateUtc(new Date().toISOString().slice(0, 10));
  if (today === null) {
    return false;
  }

  const ageDays = Math.floor((today - snapshotTime) / 86400000);
  return ageDays > maxAgeDays;
}

function parseDateUtc(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return null;
  }

  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? parsed : null;
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

function normalizeStoreIdentifier(value) {
  const input = String(value || '').trim();
  if (!input) {
    return '';
  }

  const segments = input.split('::').map((segment) => normalizeIdentifier(segment)).filter(Boolean);
  if (segments.length === 0) {
    return '';
  }

  return segments.length > 1 ? `${segments[0]}::${segments.slice(1).join('-')}` : segments[0];
}

function normalizeIdentifier(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\u0400-\u04ff]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  ALLOWED_PRICE_MODES,
  ALLOWED_PRICE_STATUSES,
  DEFAULT_CURRENCY,
  DEFAULT_LOOKUP_OPTIONS,
  MAX_LOOKUP_IDS,
  handleLookupCanonicalProductPricesRequest,
  lookupCanonicalProductPrices,
  lookupPricesForBasketPlan,
};
