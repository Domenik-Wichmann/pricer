const crypto = require('node:crypto');

const {
  handleOptimizeBasketSingleStoreRequest,
} = require('../phase16/basket_optimizer');

async function createSavedList({
  store,
  ownerContext,
  name,
  items,
  createdAt = new Date().toISOString(),
}) {
  requireStore(store);
  const owner = normalizeOwnerContext(ownerContext);
  const normalizedName = normalizeListName(name);
  const normalizedItems = normalizeSavedListItems(items);
  if (normalizedName.error) {
    return normalizedName.error;
  }
  if (normalizedItems.error) {
    return normalizedItems.error;
  }

  const timestamp = normalizeTimestamp(createdAt);
  const record = {
    list_id: buildSavedListId({
      owner,
      name: normalizedName.value,
      items: normalizedItems.value,
      createdAt: timestamp,
    }),
    owner_id: owner.owner_id,
    owner_type: owner.owner_type,
    name: normalizedName.value,
    items: normalizedItems.value,
    created_at: timestamp,
    updated_at: timestamp,
  };
  const state = await store.load();
  state.saved_lists_store = Array.isArray(state.saved_lists_store)
    ? state.saved_lists_store
    : [];
  state.saved_lists_store.push(record);
  await store.save(state);
  return {
    status: 201,
    body: {
      list: clone(record),
    },
  };
}

async function getSavedList({
  store,
  ownerContext,
  listId,
}) {
  requireStore(store);
  const owner = normalizeOwnerContext(ownerContext);
  const state = await store.load();
  const list = findOwnedSavedList(state, listId, owner);
  if (!list) {
    return notFound();
  }
  return {
    status: 200,
    body: {
      list: clone(list),
    },
  };
}

async function listSavedLists({
  store,
  ownerContext,
}) {
  requireStore(store);
  const owner = normalizeOwnerContext(ownerContext);
  const state = await store.load();
  const lists = (state.saved_lists_store || [])
    .filter((list) => canAccessSavedList(owner, list))
    .slice()
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
    .map((list) => clone(list));
  return {
    status: 200,
    body: {
      lists,
      total: lists.length,
    },
  };
}

async function updateSavedList({
  store,
  ownerContext,
  listId,
  updates = {},
  updatedAt = new Date().toISOString(),
}) {
  requireStore(store);
  const owner = normalizeOwnerContext(ownerContext);
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return {
      status: 400,
      body: {
        error: 'updates must be an object',
      },
    };
  }

  const state = await store.load();
  state.saved_lists_store = Array.isArray(state.saved_lists_store)
    ? state.saved_lists_store
    : [];
  const index = state.saved_lists_store.findIndex(
    (list) => list.list_id === listId && canAccessSavedList(owner, list)
  );
  if (index < 0) {
    return notFound();
  }

  const current = state.saved_lists_store[index];
  const next = {
    ...current,
  };
  if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
    const normalizedName = normalizeListName(updates.name);
    if (normalizedName.error) {
      return normalizedName.error;
    }
    next.name = normalizedName.value;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'items')) {
    const normalizedItems = normalizeSavedListItems(updates.items);
    if (normalizedItems.error) {
      return normalizedItems.error;
    }
    next.items = normalizedItems.value;
  }
  next.updated_at = normalizeTimestamp(updatedAt);
  state.saved_lists_store[index] = next;
  await store.save(state);
  return {
    status: 200,
    body: {
      list: clone(next),
    },
  };
}

async function deleteSavedList({
  store,
  ownerContext,
  listId,
}) {
  requireStore(store);
  const owner = normalizeOwnerContext(ownerContext);
  const state = await store.load();
  state.saved_lists_store = Array.isArray(state.saved_lists_store)
    ? state.saved_lists_store
    : [];
  const existing = findOwnedSavedList(state, listId, owner);
  if (!existing) {
    return notFound();
  }
  state.saved_lists_store = state.saved_lists_store.filter((list) => {
    return !(list.list_id === listId && canAccessSavedList(owner, list));
  });
  await store.save(state);
  return {
    status: 200,
    body: {
      deleted: true,
      list_id: listId,
    },
  };
}

async function optimizeSavedList({
  store,
  ownerContext,
  listId,
  body = {},
}) {
  requireStore(store);
  const owner = normalizeOwnerContext(ownerContext);
  const state = await store.load();
  const list = findOwnedSavedList(state, listId, owner);
  if (!list) {
    return notFound();
  }
  const optimizerOptions = body.optimizer_options || {};
  const response = await handleOptimizeBasketSingleStoreRequest({
    store,
    body: {
      items: list.items,
      layer_mode: body.layer_mode,
      planner_options: body.planner_options,
      price_options: body.price_options,
      optimizer_options: optimizerOptions,
      user_context: body.user_context || {},
      convenience_options: body.convenience_options || {},
    },
  });
  if (response.status !== 200) {
    return response;
  }
  return {
    status: 200,
    body: {
      list: clone(list),
      ...response.body,
    },
  };
}

async function handleCreateSavedListRequest({
  store,
  body = {},
  req,
}) {
  return createSavedList({
    store,
    ownerContext: resolveOwnerContextFromRequest(req),
    name: body.name,
    items: body.items,
  });
}

async function handleListSavedListsRequest({
  store,
  req,
}) {
  return listSavedLists({
    store,
    ownerContext: resolveOwnerContextFromRequest(req),
  });
}

async function handleGetSavedListRequest({
  store,
  params = {},
  req,
}) {
  return getSavedList({
    store,
    ownerContext: resolveOwnerContextFromRequest(req),
    listId: params.id,
  });
}

async function handleUpdateSavedListRequest({
  store,
  params = {},
  body = {},
  req,
}) {
  return updateSavedList({
    store,
    ownerContext: resolveOwnerContextFromRequest(req),
    listId: params.id,
    updates: body,
  });
}

async function handleDeleteSavedListRequest({
  store,
  params = {},
  req,
}) {
  return deleteSavedList({
    store,
    ownerContext: resolveOwnerContextFromRequest(req),
    listId: params.id,
  });
}

async function handleOptimizeSavedListRequest({
  store,
  params = {},
  body = {},
  req,
}) {
  return optimizeSavedList({
    store,
    ownerContext: resolveOwnerContextFromRequest(req),
    listId: params.id,
    body,
  });
}

function normalizeSavedListItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      error: {
        status: 400,
        body: {
          error: 'items must be a non-empty array',
        },
      },
    };
  }
  const normalized = [];
  for (const item of items) {
    const text = typeof item === 'string'
      ? item.trim()
      : typeof item?.text === 'string'
        ? item.text.trim()
        : '';
    if (!text) {
      return {
        error: {
          status: 400,
          body: {
            error: 'each item must include non-empty text',
          },
        },
      };
    }
    normalized.push({ text });
  }
  return {
    value: normalized,
  };
}

function normalizeListName(name) {
  const value = typeof name === 'string' ? name.trim() : '';
  if (!value) {
    return {
      error: {
        status: 400,
        body: {
          error: 'name is required',
        },
      },
    };
  }
  return { value };
}

function buildSavedListId({
  owner,
  name,
  items,
  createdAt,
}) {
  const normalizedOwner = normalizeOwnerContext(owner);
  return `sl_${crypto
    .createHash('sha256')
    .update(`${normalizedOwner.owner_type}|${normalizedOwner.owner_id}|${name}|${JSON.stringify(items)}|${createdAt}`)
    .digest('hex')
    .slice(0, 32)}`;
}

function findSavedList(state, listId) {
  if (typeof listId !== 'string' || !listId.trim()) {
    return null;
  }
  return (state.saved_lists_store || []).find((list) => list.list_id === listId) || null;
}

function findOwnedSavedList(state, listId, ownerContext) {
  const list = findSavedList(state, listId);
  if (!list || !canAccessSavedList(ownerContext, list)) {
    return null;
  }
  return list;
}

function canAccessSavedList(ownerContext, list) {
  const owner = normalizeOwnerContext(ownerContext);
  if (owner.owner_type === 'system') {
    return true;
  }
  const recordOwner = normalizeRecordOwner(list);
  return recordOwner.owner_id === owner.owner_id && recordOwner.owner_type === owner.owner_type;
}

function normalizeRecordOwner(list) {
  return normalizeOwnerContext({
    owner_id: list?.owner_id,
    owner_type: list?.owner_type,
  });
}

function normalizeOwnerContext(ownerContext = {}) {
  const context = ownerContext || {};
  const rawOwnerId = typeof context.owner_id === 'string'
    ? context.owner_id
    : typeof context.ownerId === 'string'
      ? context.ownerId
      : '';
  const rawOwnerType = typeof context.owner_type === 'string'
    ? context.owner_type
    : typeof context.ownerType === 'string'
      ? context.ownerType
      : '';
  const ownerId = rawOwnerId.trim() || 'anonymous';
  const ownerType = normalizeOwnerType(rawOwnerType);
  const localityCode = normalizeOptionalLocalityCode(
    context.locality_code ||
    context.localityCode
  );
  const chainId = normalizeOptionalIdentifier(
    context.chain_id ||
    context.chainId
  );
  const chainName = normalizeOptionalString(
    context.chain_name ||
    context.chainName
  );
  const storeId = normalizeOptionalStoreIdentifier(
    context.store_id ||
    context.storeId
  );
  const storeName = normalizeOptionalString(
    context.store_name ||
    context.storeName
  );

  if (ownerType === 'anonymous') {
    return {
      owner_id: ownerId || 'anonymous',
      owner_type: 'anonymous',
      locality_code: localityCode,
      chain_id: chainId,
      chain_name: chainName,
      store_id: storeId,
      store_name: storeName,
    };
  }

  return {
    owner_id: ownerId,
    owner_type: ownerType,
    locality_code: localityCode,
    chain_id: chainId,
    chain_name: chainName,
    store_id: storeId,
    store_name: storeName,
  };
}

function normalizeOwnerType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['anonymous', 'user', 'system'].includes(normalized)) {
    return normalized;
  }
  return 'anonymous';
}

function resolveOwnerContextFromRequest(req) {
  if (!req) {
    return normalizeOwnerContext();
  }
  const ownerId = getRequestHeader(req, 'x-pricer-owner-id');
  const ownerType = getRequestHeader(req, 'x-pricer-owner-type');
  const localityCode = getRequestHeader(req, 'x-pricer-locality-code');
  const chainId = getRequestHeader(req, 'x-pricer-chain-id');
  const chainName = getRequestHeader(req, 'x-pricer-chain-name');
  const storeId = getRequestHeader(req, 'x-pricer-store-id');
  const storeName = getRequestHeader(req, 'x-pricer-store-name');
  return normalizeOwnerContext({
    owner_id: ownerId,
    owner_type: ownerType,
    locality_code: localityCode,
    chain_id: chainId,
    chain_name: chainName,
    store_id: storeId,
    store_name: storeName,
  });
}

function normalizeOptionalLocalityCode(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return String(value).trim().toLowerCase().replace(/\s+/gu, '_') || null;
}

function normalizeOptionalIdentifier(value) {
  const input = String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\u0400-\u04ff]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  return input || null;
}

function normalizeOptionalStoreIdentifier(value) {
  const input = String(value || '').trim();
  if (!input) {
    return null;
  }
  const segments = input.split('::').map((segment) => normalizeOptionalIdentifier(segment)).filter(Boolean);
  if (segments.length === 0) {
    return null;
  }
  return segments.length > 1 ? `${segments[0]}::${segments.slice(1).join('-')}` : segments[0];
}

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getRequestHeader(req, name) {
  if (typeof req.get === 'function') {
    return req.get(name);
  }
  if (typeof req.header === 'function') {
    return req.header(name);
  }
  const headers = req.headers || {};
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
}

function notFound() {
  return {
    status: 404,
    body: {
      error: 'saved list not found',
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
  buildSavedListId,
  createSavedList,
  deleteSavedList,
  getSavedList,
  handleCreateSavedListRequest,
  handleDeleteSavedListRequest,
  handleGetSavedListRequest,
  handleListSavedListsRequest,
  handleOptimizeSavedListRequest,
  handleUpdateSavedListRequest,
  listSavedLists,
  normalizeOwnerContext,
  normalizeSavedListItems,
  optimizeSavedList,
  resolveOwnerContextFromRequest,
  updateSavedList,
};
