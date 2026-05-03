const crypto = require('node:crypto');

const { lookupCanonicalProductPrices } = require('../phase16/price_lookup');
const {
  buildGapSignalFromWatchlist,
  persistGapSignal,
} = require('../phase18/gap_detection');
const { classifyDealForPriceItem } = require('./deals');
const {
  normalizeOwnerContext,
  resolveOwnerContextFromRequest,
} = require('./saved_lists');

const MAX_LABEL_LENGTH = 120;
const MAX_NOTES_LENGTH = 500;

async function addWatchlistItem({
  store,
  ownerContext,
  input = {},
  createdAt = new Date().toISOString(),
}) {
  requireStore(store);
  const owner = normalizeOwnerContext(ownerContext);
  const normalized = normalizeWatchlistInput(input);
  if (normalized.error) {
    return normalized.error;
  }

  const ownerItems = await loadWatchlistItemsForOwner(store, owner);
  const existing = ownerItems.find((item) => {
    return canAccessWatchlistItem(owner, item) &&
      item.canonical_product_id === normalized.value.canonical_product_id;
  });
  if (existing) {
    return {
      status: 200,
      body: {
        item: clone(existing),
        duplicate: true,
      },
    };
  }

  const timestamp = normalizeTimestamp(createdAt);
  const record = {
    watch_id: buildWatchId({
      owner,
      canonicalProductId: normalized.value.canonical_product_id,
      createdAt: timestamp,
    }),
    owner_id: owner.owner_id,
    owner_type: owner.owner_type,
    canonical_product_id: normalized.value.canonical_product_id,
    label: normalized.value.label,
    created_at: timestamp,
    updated_at: timestamp,
  };
  if (normalized.value.target_price !== undefined) {
    record.target_price = normalized.value.target_price;
  }
  if (normalized.value.notes !== undefined) {
    record.notes = normalized.value.notes;
  }

  await upsertWatchlistRecord(store, record);
  const product = await loadCanonicalProductForWatchlist(store, record.canonical_product_id);
  const enrichment = await loadCanonicalEnrichmentForWatchlist(store, record.canonical_product_id);
  await persistGapSignal(store, buildGapSignalFromWatchlist({
    input: normalized.value,
    product,
    enrichment,
    ownerContext: owner,
    timestamp,
  }));
  return {
    status: 201,
    body: {
      item: clone(record),
      duplicate: false,
    },
  };
}

async function listWatchlistItems({
  store,
  ownerContext,
}) {
  requireStore(store);
  const owner = normalizeOwnerContext(ownerContext);
  const items = (await loadWatchlistItemsForOwner(store, owner))
    .filter((item) => canAccessWatchlistItem(owner, item))
    .slice()
    .sort(compareWatchlistItems)
    .map((item) => clone(item));
  return {
    status: 200,
    body: {
      items,
      total: items.length,
    },
  };
}

async function getWatchlistItem({
  store,
  ownerContext,
  watchId,
}) {
  requireStore(store);
  const item = await loadOwnedWatchlistItem(store, watchId, ownerContext);
  if (!item) {
    return notFound();
  }
  return {
    status: 200,
    body: {
      item: clone(item),
    },
  };
}

async function updateWatchlistItem({
  store,
  ownerContext,
  watchId,
  updates = {},
  updatedAt = new Date().toISOString(),
}) {
  requireStore(store);
  const owner = normalizeOwnerContext(ownerContext);
  const normalized = normalizeWatchlistUpdates(updates);
  if (normalized.error) {
    return normalized.error;
  }

  const current = await loadOwnedWatchlistItem(store, watchId, owner);
  if (!current) {
    return notFound();
  }

  const next = {
    ...current,
    ...normalized.value,
    updated_at: normalizeTimestamp(updatedAt),
  };
  await upsertWatchlistRecord(store, next);
  return {
    status: 200,
    body: {
      item: clone(next),
    },
  };
}

async function removeWatchlistItem({
  store,
  ownerContext,
  watchId,
}) {
  requireStore(store);
  const owner = normalizeOwnerContext(ownerContext);
  const existing = await loadOwnedWatchlistItem(store, watchId, owner);
  if (!existing) {
    return notFound();
  }
  await deleteWatchlistRecord(store, existing);
  return {
    status: 200,
    body: {
      deleted: true,
      watch_id: watchId,
    },
  };
}

async function buildWatchlistPriceView({
  store,
  ownerContext,
  options = {},
}) {
  requireStore(store);
  const owner = normalizeOwnerContext(ownerContext);
  const items = (await loadWatchlistItemsForOwner(store, owner))
    .filter((item) => canAccessWatchlistItem(owner, item))
    .slice()
    .sort(compareWatchlistItems);
  const canonicalProductIds = [...new Set(items.map((item) => item.canonical_product_id))].sort();
  const priceLookup = canonicalProductIds.length > 0
    ? await lookupCanonicalProductPrices({
      store,
      canonicalProductIds,
      options: normalizePriceOptions(options),
    })
    : {
      currency: 'EUR',
      items: [],
      summary: {
        requested_count: 0,
        priced_count: 0,
        stale_count: 0,
        missing_count: 0,
      },
    };
  const priceByCanonicalId = new Map(
    priceLookup.items.map((item) => [item.canonical_product_id, item])
  );
  const productByCanonicalId = await buildProductIndexForIds(store, canonicalProductIds);

  return {
    status: 200,
    body: {
      currency: priceLookup.currency,
      total: items.length,
      items: items.map((item) => {
        const price = priceByCanonicalId.get(item.canonical_product_id) || {
          canonical_product_id: item.canonical_product_id,
          price_status: 'missing',
          best_price: null,
          price_records: [],
        };
        return {
          watch_id: item.watch_id,
          canonical_product_id: item.canonical_product_id,
          label: item.label,
          target_price: item.target_price,
          notes: item.notes,
          product: productByCanonicalId.get(item.canonical_product_id) || {
            canonical_product_id: item.canonical_product_id,
            canonical_name: null,
          },
          price,
          deal: classifyDealForPriceItem({
            priceItem: price,
            targetPrice: item.target_price,
          }),
        };
      }),
      summary: priceLookup.summary,
    },
  };
}

async function handleAddWatchlistItemRequest({
  store,
  body = {},
  req,
}) {
  return addWatchlistItem({
    store,
    ownerContext: resolveOwnerContextFromRequest(req),
    input: body,
  });
}

async function handleListWatchlistItemsRequest({
  store,
  req,
}) {
  return listWatchlistItems({
    store,
    ownerContext: resolveOwnerContextFromRequest(req),
  });
}

async function handleGetWatchlistItemRequest({
  store,
  params = {},
  req,
}) {
  return getWatchlistItem({
    store,
    ownerContext: resolveOwnerContextFromRequest(req),
    watchId: params.id,
  });
}

async function handleUpdateWatchlistItemRequest({
  store,
  params = {},
  body = {},
  req,
}) {
  return updateWatchlistItem({
    store,
    ownerContext: resolveOwnerContextFromRequest(req),
    watchId: params.id,
    updates: body,
  });
}

async function handleRemoveWatchlistItemRequest({
  store,
  params = {},
  req,
}) {
  return removeWatchlistItem({
    store,
    ownerContext: resolveOwnerContextFromRequest(req),
    watchId: params.id,
  });
}

async function handleWatchlistPriceViewRequest({
  store,
  query = {},
  body = {},
  req,
}) {
  return buildWatchlistPriceView({
    store,
    ownerContext: resolveOwnerContextFromRequest(req),
    options: Object.keys(query || {}).length > 0 ? query : body,
  });
}

function normalizeWatchlistInput(input) {
  const canonicalProductId = normalizeRequiredString(input?.canonical_product_id, 'canonical_product_id');
  if (canonicalProductId.error) {
    return canonicalProductId;
  }
  const label = normalizeOptionalString(input?.label, 'label', MAX_LABEL_LENGTH);
  if (label.error) {
    return label;
  }
  const notes = normalizeOptionalString(input?.notes, 'notes', MAX_NOTES_LENGTH);
  if (notes.error) {
    return notes;
  }
  const targetPrice = normalizeOptionalPrice(input?.target_price);
  if (targetPrice.error) {
    return targetPrice;
  }

  const value = {
    canonical_product_id: canonicalProductId.value,
    label: label.value || canonicalProductId.value,
  };
  if (targetPrice.value !== undefined) {
    value.target_price = targetPrice.value;
  }
  if (notes.value !== undefined) {
    value.notes = notes.value;
  }
  return { value };
}

function normalizeWatchlistUpdates(updates) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return badRequest('updates must be an object');
  }

  const allowed = {};
  if (Object.prototype.hasOwnProperty.call(updates, 'label')) {
    const label = normalizeOptionalString(updates.label, 'label', MAX_LABEL_LENGTH);
    if (label.error) {
      return label;
    }
    allowed.label = label.value || null;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'notes')) {
    const notes = normalizeOptionalString(updates.notes, 'notes', MAX_NOTES_LENGTH);
    if (notes.error) {
      return notes;
    }
    allowed.notes = notes.value || null;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'target_price')) {
    const targetPrice = normalizeOptionalPrice(updates.target_price);
    if (targetPrice.error) {
      return targetPrice;
    }
    allowed.target_price = targetPrice.value === undefined ? null : targetPrice.value;
  }

  if (Object.keys(allowed).length === 0) {
    return badRequest('updates must include at least one supported field');
  }
  return { value: allowed };
}

function normalizeRequiredString(value, fieldName) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    return badRequest(`${fieldName} is required`);
  }
  return { value: normalized };
}

function normalizeOptionalString(value, fieldName, maxLength) {
  if (value === undefined || value === null) {
    return { value: undefined };
  }
  if (typeof value !== 'string') {
    return badRequest(`${fieldName} must be a string`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    return badRequest(`${fieldName} exceeds max length of ${maxLength}`);
  }
  return { value: normalized || undefined };
}

function normalizeOptionalPrice(value) {
  if (value === undefined || value === null || value === '') {
    return { value: undefined };
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return badRequest('target_price must be a positive number');
  }
  return { value: parsed };
}

function normalizePriceOptions(options = {}) {
  return {
    max_age_days: options.max_age_days,
    chain_ids: normalizeArrayOption(options.chain_ids),
    store_ids: normalizeArrayOption(options.store_ids),
    include_history: options.include_history === true || options.include_history === 'true',
  };
}

function normalizeArrayOption(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
}

function findOwnedWatchlistItem(state, watchId, ownerContext) {
  if (typeof watchId !== 'string' || !watchId.trim()) {
    return null;
  }
  const owner = normalizeOwnerContext(ownerContext);
  return (state.watchlist_store || []).find((item) => {
    return item.watch_id === watchId && canAccessWatchlistItem(owner, item);
  }) || null;
}

function canAccessWatchlistItem(ownerContext, item) {
  const owner = normalizeOwnerContext(ownerContext);
  if (owner.owner_type === 'system') {
    return true;
  }
  const recordOwner = normalizeOwnerContext({
    owner_id: item?.owner_id,
    owner_type: item?.owner_type,
  });
  return recordOwner.owner_id === owner.owner_id && recordOwner.owner_type === owner.owner_type;
}

function buildProductIndex(state) {
  return new Map((state.canonical_products || []).map((product) => [
    product.canonical_product_id,
    {
      canonical_product_id: product.canonical_product_id,
      canonical_name: product.canonical_display_name || product.display_name || product.name || null,
    },
  ]));
}

async function loadWatchlistItemsForOwner(store, owner) {
  if (typeof store.queryCollection === 'function' && owner.owner_type !== 'system') {
    return store.queryCollection('watchlist_store', {
      fieldName: 'owner_id',
      value: owner.owner_id,
    });
  }
  if (typeof store.loadCollections === 'function') {
    const state = await store.loadCollections(['watchlist_store']);
    return state.watchlist_store || [];
  }
  const state = await store.load();
  return state.watchlist_store || [];
}

async function loadOwnedWatchlistItem(store, watchId, ownerContext) {
  if (typeof watchId !== 'string' || !watchId.trim()) {
    return null;
  }
  if (typeof store.queryCollection === 'function') {
    const rows = await store.queryCollection('watchlist_store', {
      fieldName: 'watch_id',
      value: watchId,
    });
    return rows.find((item) => canAccessWatchlistItem(ownerContext, item)) || null;
  }
  const state = await store.load();
  return findOwnedWatchlistItem(state, watchId, ownerContext);
}

async function upsertWatchlistRecord(store, record) {
  if (typeof store.upsertRecord === 'function') {
    await store.upsertRecord('watchlist_store', record);
    return;
  }
  const state = await store.load();
  state.watchlist_store = Array.isArray(state.watchlist_store) ? state.watchlist_store : [];
  const index = state.watchlist_store.findIndex((item) => item.watch_id === record.watch_id);
  if (index >= 0) {
    state.watchlist_store[index] = record;
  } else {
    state.watchlist_store.push(record);
  }
  await store.save(state);
}

async function deleteWatchlistRecord(store, record) {
  if (typeof store.deleteRecord === 'function') {
    await store.deleteRecord('watchlist_store', record);
    return;
  }
  const state = await store.load();
  state.watchlist_store = (state.watchlist_store || []).filter((item) => item.watch_id !== record.watch_id);
  await store.save(state);
}

async function loadCanonicalProductForWatchlist(store, canonicalProductId) {
  if (typeof store.queryCollection === 'function') {
    const rows = await store.queryCollection('canonical_products', {
      fieldName: 'canonical_product_id',
      value: canonicalProductId,
    });
    return rows[0] || null;
  }
  const state = await store.load();
  return (state.canonical_products || []).find((entry) => entry.canonical_product_id === canonicalProductId) || null;
}

async function loadCanonicalEnrichmentForWatchlist(store, canonicalProductId) {
  if (typeof store.queryCollection === 'function') {
    const rows = await store.queryCollection('canonical_enrichment_store', {
      fieldName: 'canonical_fingerprint',
      value: canonicalProductId,
    });
    return rows[0]?.enrichment || null;
  }
  const state = await store.load();
  return (state.canonical_enrichment_store || []).find(
    (entry) => entry.canonical_fingerprint === canonicalProductId
  )?.enrichment || null;
}

async function buildProductIndexForIds(store, canonicalProductIds) {
  if (canonicalProductIds.length === 0) {
    return new Map();
  }
  if (typeof store.queryCollectionByFieldValues === 'function') {
    const products = await store.queryCollectionByFieldValues('canonical_products', {
      fieldName: 'canonical_product_id',
      values: canonicalProductIds,
    });
    return buildProductIndex({ canonical_products: products });
  }
  const state = await store.load();
  return buildProductIndex(state);
}

function buildWatchId({
  owner,
  canonicalProductId,
  createdAt,
}) {
  const normalizedOwner = normalizeOwnerContext(owner);
  return `wl_${crypto
    .createHash('sha256')
    .update(`${normalizedOwner.owner_type}|${normalizedOwner.owner_id}|${canonicalProductId}|${createdAt}`)
    .digest('hex')
    .slice(0, 32)}`;
}

function compareWatchlistItems(left, right) {
  if (right.updated_at !== left.updated_at) {
    return String(right.updated_at || '').localeCompare(String(left.updated_at || ''));
  }
  return String(left.watch_id).localeCompare(String(right.watch_id));
}

function notFound() {
  return {
    status: 404,
    body: {
      error: 'watchlist item not found',
    },
  };
}

function badRequest(error) {
  return {
    error: {
      status: 400,
      body: { error },
    },
  };
}

function requireStore(store) {
  if (!store) {
    throw new Error('store is required');
  }
}

function normalizeTimestamp(value) {
  return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  addWatchlistItem,
  buildWatchId,
  buildWatchlistPriceView,
  getWatchlistItem,
  handleAddWatchlistItemRequest,
  handleGetWatchlistItemRequest,
  handleListWatchlistItemsRequest,
  handleRemoveWatchlistItemRequest,
  handleUpdateWatchlistItemRequest,
  handleWatchlistPriceViewRequest,
  listWatchlistItems,
  removeWatchlistItem,
  updateWatchlistItem,
};
