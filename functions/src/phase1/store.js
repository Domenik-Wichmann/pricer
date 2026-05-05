const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');

const runtimeReadContext = new AsyncLocalStorage();
const LARGE_COLLECTION_NAMES = Object.freeze([
  'raw_price_snapshots',
  'canonical_product_mappings',
  'source_products',
  'product_daily_prices',
  'current_product_offers',
  'current_offer_fingerprints',
]);

function createEmptyDataBackbone() {
  return {
    raw_price_snapshots: [],
    source_products: [],
    source_product_enrichment: [],
    semantic_profiles: [],
    embedding_records: [],
    feedback_events: [],
    product_daily_prices: [],
    current_product_offers: [],
    current_offer_fingerprints: [],
    offer_change_events: [],
    snapshot_manifests: [],
    canonical_current_offer_summary: [],
    category_daily_aggregates: [],
    sql_products: [],
    sql_product_prices_daily: [],
    sql_category_aggregates: [],
    vector_index_records: [],
    canonical_products: [],
    canonical_product_mappings: [],
    canonical_enrichment_store: [],
    canonical_enrichment_failed_responses: [],
    semantic_term_registry: [],
    semantic_term_registry_proposals: [],
    retailer_locations: [],
    retailer_location_geocodes: [],
    manual_location_geocodes: [],
    location_review_candidates: [],
    reviewed_location_coordinates: [],
    ingredient_families: [],
    ingredient_categories: [],
    ingredients: [],
    product_ingredient_mappings: [],
    units: [],
    unit_conversions: [],
    ingredient_unit_rules: [],
    canonical_disambiguation_queue: [],
    canonical_disambiguation_decisions: [],
    ingest_runs: [],
    admin_ingest_jobs: [],
    pipeline_logs: [],
    analytics_events: [],
    basket_analytics_store: [],
    gap_signal_store: [],
    saved_lists_store: [],
    watchlist_store: [],
    user_product_family_preferences: [],
    saved_user_locations: [],
    watchlist_alert_events: [],
    notification_events: [],
    watchlist_profiles: [],
    watchlist_recurring_patterns: [],
    watchlist_insight_events: [],
    watchlist_daily_summaries: [],
    demand_logs: [],
    demand_aggregates: [],
    demand_embeddings: [],
    demand_clusters: [],
    canonical_terms: [],
    synonym_map: [],
    user_tiers: [],
    revenuecat_events: [],
  };
}

const DATA_BACKBONE_COLLECTIONS = Object.freeze(Object.keys(createEmptyDataBackbone()));

const COLLECTION_DOCUMENT_IDS = Object.freeze({
  raw_price_snapshots: ['snapshot_id'],
  source_products: ['source_product_id'],
  source_product_enrichment: ['source_product_id'],
  semantic_profiles: ['source_product_id'],
  embedding_records: ['source_product_id', 'embedding_model'],
  feedback_events: ['feedback_id'],
  product_daily_prices: ['source_product_id', 'date'],
  current_product_offers: ['offer_id'],
  current_offer_fingerprints: ['source_product_id'],
  offer_change_events: ['event_id'],
  snapshot_manifests: ['manifest_id'],
  canonical_current_offer_summary: ['canonical_product_id'],
  category_daily_aggregates: ['category_code', 'date'],
  sql_products: ['source_product_id'],
  sql_product_prices_daily: ['source_product_id', 'date'],
  sql_category_aggregates: ['category_code', 'date'],
  vector_index_records: ['source_product_id', 'embedding_model'],
  canonical_products: ['canonical_product_id'],
  canonical_product_mappings: ['source_product_id'],
  canonical_enrichment_store: ['canonical_fingerprint'],
  canonical_enrichment_failed_responses: ['failed_response_id'],
  semantic_term_registry: ['term_id'],
  semantic_term_registry_proposals: ['proposal_id'],
  retailer_locations: ['location_id'],
  retailer_location_geocodes: ['geocode_id'],
  manual_location_geocodes: ['geocode_id'],
  location_review_candidates: ['candidate_id'],
  reviewed_location_coordinates: ['reviewed_coordinate_id'],
  ingredient_families: ['ingredient_family_id'],
  ingredient_categories: ['ingredient_category_id'],
  ingredients: ['ingredient_id'],
  product_ingredient_mappings: ['mapping_id'],
  units: ['unit_id'],
  unit_conversions: ['conversion_id'],
  ingredient_unit_rules: ['ingredient_rule_id'],
  canonical_disambiguation_queue: ['warning_id'],
  canonical_disambiguation_decisions: ['decision_id'],
  ingest_runs: ['ingest_run_id'],
  admin_ingest_jobs: ['job_id'],
  pipeline_logs: ['log_id'],
  analytics_events: ['analytics_event_id'],
  basket_analytics_store: ['analytics_id'],
  gap_signal_store: ['signal_id'],
  saved_lists_store: ['list_id'],
  watchlist_store: ['watch_id'],
  user_product_family_preferences: ['preference_id'],
  saved_user_locations: ['location_id'],
  watchlist_alert_events: ['alert_id'],
  notification_events: ['notification_id'],
  watchlist_profiles: ['watchlist_key'],
  watchlist_recurring_patterns: ['recurrence_id'],
  watchlist_insight_events: ['insight_id'],
  watchlist_daily_summaries: ['summary_id'],
  demand_logs: ['demand_log_id'],
  demand_aggregates: ['demand_key'],
  demand_embeddings: ['demand_key', 'embedding_model'],
  demand_clusters: ['cluster_id'],
  canonical_terms: ['term_id'],
  synonym_map: ['synonym_id'],
  user_tiers: ['user_id'],
  revenuecat_events: ['revenuecat_event_id'],
});

class InMemoryDataBackboneStore {
  constructor(initialState = createEmptyDataBackbone()) {
    this.state = cloneState(normalizeState(initialState));
  }

  async load() {
    return cloneState(this.state);
  }

  async loadCollections(collectionNames) {
    return normalizeState(
      Object.fromEntries(resolveCollectionNames(collectionNames).map((collectionName) => [
        collectionName,
        cloneState(this.state[collectionName] || []),
      ]))
    );
  }

  async queryCollection(collectionName, {
    fieldName,
    value,
  } = {}) {
    validateCollectionName(collectionName);
    if (!fieldName) {
      throw new Error('fieldName is required for scoped collection queries.');
    }
    return cloneState((this.state[collectionName] || []).filter((row) => row?.[fieldName] === value));
  }

  async queryCollectionByFieldValues(collectionName, {
    fieldName,
    values,
  } = {}) {
    validateCollectionName(collectionName);
    if (!fieldName) {
      throw new Error('fieldName is required for scoped collection queries.');
    }
    const valueSet = new Set(normalizeQueryValues(values));
    if (valueSet.size === 0) {
      return [];
    }
    return cloneState((this.state[collectionName] || []).filter((row) => valueSet.has(row?.[fieldName])));
  }

  async queryCollectionPrefix(collectionName, {
    fieldName,
    prefix,
    limit = 50,
  } = {}) {
    validateCollectionName(collectionName);
    if (!fieldName) {
      throw new Error('fieldName is required for scoped prefix collection queries.');
    }
    const normalizedPrefix = String(prefix || '');
    const boundedLimit = resolveQueryLimit(limit);
    if (!normalizedPrefix) {
      return [];
    }
    return cloneState((this.state[collectionName] || [])
      .filter((row) => String(row?.[fieldName] || '').startsWith(normalizedPrefix))
      .slice(0, boundedLimit));
  }

  async upsertRecord(collectionName, record) {
    validateCollectionName(collectionName);
    const documentId = buildDocumentId(collectionName, record);
    const nextRecords = this.state[collectionName] || [];
    const existingIndex = nextRecords.findIndex((entry) => buildDocumentId(collectionName, entry) === documentId);
    if (existingIndex >= 0) {
      nextRecords[existingIndex] = cloneState(record);
    } else {
      nextRecords.push(cloneState(record));
    }
    this.state[collectionName] = sortCollectionRecords(collectionName, nextRecords);
    return cloneState(record);
  }

  async deleteRecord(collectionName, recordOrId) {
    validateCollectionName(collectionName);
    const documentId = typeof recordOrId === 'string'
      ? recordOrId
      : buildDocumentId(collectionName, recordOrId);
    this.state[collectionName] = (this.state[collectionName] || [])
      .filter((entry) => buildDocumentId(collectionName, entry) !== documentId);
    return { deleted: true };
  }

  async save(nextState) {
    this.state = cloneState(normalizeState(nextState));
  }
}

class JsonFileDataBackboneStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async load() {
    if (!fs.existsSync(this.filePath)) {
      return createEmptyDataBackbone();
    }

    return normalizeState(JSON.parse(fs.readFileSync(this.filePath, 'utf8')));
  }

  async loadCollections(collectionNames) {
    const state = await this.load();
    return normalizeState(
      Object.fromEntries(resolveCollectionNames(collectionNames).map((collectionName) => [
        collectionName,
        state[collectionName] || [],
      ]))
    );
  }

  async queryCollection(collectionName, {
    fieldName,
    value,
  } = {}) {
    validateCollectionName(collectionName);
    if (!fieldName) {
      throw new Error('fieldName is required for scoped collection queries.');
    }
    const state = await this.loadCollections([collectionName]);
    return (state[collectionName] || []).filter((row) => row?.[fieldName] === value);
  }

  async queryCollectionByFieldValues(collectionName, {
    fieldName,
    values,
  } = {}) {
    validateCollectionName(collectionName);
    if (!fieldName) {
      throw new Error('fieldName is required for scoped collection queries.');
    }
    const valueSet = new Set(normalizeQueryValues(values));
    if (valueSet.size === 0) {
      return [];
    }
    const state = await this.loadCollections([collectionName]);
    return (state[collectionName] || []).filter((row) => valueSet.has(row?.[fieldName]));
  }

  async queryCollectionPrefix(collectionName, {
    fieldName,
    prefix,
    limit = 50,
  } = {}) {
    validateCollectionName(collectionName);
    if (!fieldName) {
      throw new Error('fieldName is required for scoped prefix collection queries.');
    }
    const normalizedPrefix = String(prefix || '');
    const boundedLimit = resolveQueryLimit(limit);
    if (!normalizedPrefix) {
      return [];
    }
    const state = await this.loadCollections([collectionName]);
    return (state[collectionName] || [])
      .filter((row) => String(row?.[fieldName] || '').startsWith(normalizedPrefix))
      .slice(0, boundedLimit);
  }

  async upsertRecord(collectionName, record) {
    validateCollectionName(collectionName);
    const state = await this.load();
    const documentId = buildDocumentId(collectionName, record);
    const records = state[collectionName] || [];
    const existingIndex = records.findIndex((entry) => buildDocumentId(collectionName, entry) === documentId);
    if (existingIndex >= 0) {
      records[existingIndex] = record;
    } else {
      records.push(record);
    }
    state[collectionName] = sortCollectionRecords(collectionName, records);
    await this.save(state);
    return cloneState(record);
  }

  async deleteRecord(collectionName, recordOrId) {
    validateCollectionName(collectionName);
    const state = await this.load();
    const documentId = typeof recordOrId === 'string'
      ? recordOrId
      : buildDocumentId(collectionName, recordOrId);
    state[collectionName] = (state[collectionName] || [])
      .filter((entry) => buildDocumentId(collectionName, entry) !== documentId);
    await this.save(state);
    return { deleted: true };
  }

  async save(nextState) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(normalizeState(nextState), null, 2));
  }
}

class FirestoreDataBackboneStore {
  constructor({
    firestore,
    collectionPrefix = '',
    allowFullLoad = true,
    allowFullSave = true,
  }) {
    if (!firestore) {
      throw new Error('FirestoreDataBackboneStore requires a firestore instance.');
    }

    this.firestore = firestore;
    this.collectionPrefix = collectionPrefix;
    this.allowFullLoad = allowFullLoad;
    this.allowFullSave = allowFullSave;
    this.prefersScopedProductSearch = true;
    this.isFirestoreBackboneStore = true;
  }

  async load() {
    logRuntimeReadEvent('warn', {
      operation: 'full_load_attempt',
      collection: '*',
      message: 'Full Firestore runtime load was attempted.',
    });
    if (!this.allowFullLoad) {
      throw buildUnsafeFirestoreOperationError('Full Firestore runtime load is disabled in production.');
    }
    return this.loadCollections(DATA_BACKBONE_COLLECTIONS);
  }

  async loadCollections(collectionNames) {
    const collections = await Promise.all(
      resolveCollectionNames(collectionNames).map(async (collectionName) => {
        const startedAt = Date.now();
        const rows = await this.loadCollectionRows(collectionName);
        logRuntimeReadEvent('info', {
          operation: 'loadCollections',
          collection: collectionName,
          row_count: rows.length,
          duration_ms: Date.now() - startedAt,
        });
        return [collectionName, rows];
      })
    );

    return normalizeState(Object.fromEntries(collections), {
      cloneCollections: false,
    });
  }

  async queryCollection(collectionName, {
    fieldName,
    value,
  } = {}) {
    validateCollectionName(collectionName);
    if (!fieldName) {
      throw new Error('fieldName is required for scoped collection queries.');
    }
    const snapshot = await this.firestore
      .collection(resolveCollectionName(this.collectionPrefix, collectionName))
      .where(fieldName, '==', value)
      .get();
    const rows = sortCollectionRecords(collectionName, snapshot.docs.map((doc) => sanitizeLoadedRecord(doc.data())));
    logRuntimeReadEvent('info', {
      operation: 'queryCollection',
      collection: collectionName,
      field: fieldName,
      row_count: rows.length,
    });
    return rows;
  }

  async queryCollectionByFieldValues(collectionName, {
    fieldName,
    values,
  } = {}) {
    validateCollectionName(collectionName);
    if (!fieldName) {
      throw new Error('fieldName is required for scoped collection queries.');
    }
    const normalizedValues = normalizeQueryValues(values);
    if (normalizedValues.length === 0) {
      return [];
    }

    const rows = [];
    for (let index = 0; index < normalizedValues.length; index += 30) {
      const chunk = normalizedValues.slice(index, index + 30);
      const snapshot = await this.firestore
        .collection(resolveCollectionName(this.collectionPrefix, collectionName))
        .where(fieldName, 'in', chunk)
        .get();
      rows.push(...snapshot.docs.map((doc) => sanitizeLoadedRecord(doc.data())));
    }

    const sortedRows = sortCollectionRecords(collectionName, rows);
    logRuntimeReadEvent('info', {
      operation: 'queryCollectionByFieldValues',
      collection: collectionName,
      field: fieldName,
      value_count: normalizedValues.length,
      row_count: sortedRows.length,
    });
    return sortedRows;
  }

  async queryCollectionPrefix(collectionName, {
    fieldName,
    prefix,
    limit = 50,
  } = {}) {
    validateCollectionName(collectionName);
    if (!fieldName) {
      throw new Error('fieldName is required for scoped prefix collection queries.');
    }
    const normalizedPrefix = String(prefix || '');
    const boundedLimit = resolveQueryLimit(limit);
    if (!normalizedPrefix) {
      return [];
    }

    const startedAt = Date.now();
    const snapshot = await this.firestore
      .collection(resolveCollectionName(this.collectionPrefix, collectionName))
      .where(fieldName, '>=', normalizedPrefix)
      .where(fieldName, '<=', `${normalizedPrefix}\uf8ff`)
      .limit(boundedLimit)
      .get();
    const rows = sortCollectionRecords(collectionName, snapshot.docs.map((doc) => sanitizeLoadedRecord(doc.data())));
    logRuntimeReadEvent('info', {
      operation: 'queryCollectionPrefix',
      collection: collectionName,
      field: fieldName,
      prefix_length: normalizedPrefix.length,
      limit: boundedLimit,
      row_count: rows.length,
      duration_ms: Date.now() - startedAt,
    });
    return rows;
  }

  async upsertRecord(collectionName, record) {
    validateCollectionName(collectionName);
    await this.firestore
      .collection(resolveCollectionName(this.collectionPrefix, collectionName))
      .doc(buildDocumentId(collectionName, record))
      .set(sanitizeStoredRecord(record));
    return sanitizeLoadedRecord(record);
  }

  async deleteRecord(collectionName, recordOrId) {
    validateCollectionName(collectionName);
    const documentId = typeof recordOrId === 'string'
      ? recordOrId
      : buildDocumentId(collectionName, recordOrId);
    await this.firestore
      .collection(resolveCollectionName(this.collectionPrefix, collectionName))
      .doc(documentId)
      .delete();
    logRuntimeReadEvent('info', {
      operation: 'deleteRecord',
      collection: collectionName,
      row_count: 1,
    });
    return { deleted: true };
  }

  async loadCollectionRows(collectionName) {
    validateCollectionName(collectionName);
    const snapshot = await this.firestore
      .collection(resolveCollectionName(this.collectionPrefix, collectionName))
      .get();
    return sortCollectionRecords(collectionName, snapshot.docs.map((doc) => sanitizeLoadedRecord(doc.data())));
  }

  async save(nextState) {
    logRuntimeReadEvent('warn', {
      operation: 'full_save_attempt',
      collection: '*',
      message: 'Full Firestore runtime save was attempted.',
    });
    if (!this.allowFullSave) {
      throw buildUnsafeFirestoreOperationError('Full Firestore runtime save is disabled in production.');
    }
    const state = normalizeState(nextState, {
      cloneCollections: false,
    });

    for (const collectionName of DATA_BACKBONE_COLLECTIONS) {
      const collectionRef = this.firestore.collection(
        resolveCollectionName(this.collectionPrefix, collectionName)
      );
      const snapshot = await collectionRef.get();
      const existingIds = new Set(snapshot.docs.map((doc) => doc.id));
      const nextRecords = state[collectionName];
      const nextIds = new Set();
      let operations = [];
      const commitPendingOperations = async () => {
        if (operations.length === 0) {
          return;
        }

        const pending = operations;
        operations = [];
        await commitFirestoreOperations(this.firestore, pending);
      };

      for (const record of nextRecords) {
        const documentId = buildDocumentId(collectionName, record);
        nextIds.add(documentId);
        operations.push({
          type: 'set',
          ref: collectionRef.doc(documentId),
          data: sanitizeStoredRecord(record),
        });
        if (operations.length >= 400) {
          await commitPendingOperations();
        }
      }

      for (const documentId of existingIds) {
        if (!nextIds.has(documentId)) {
          operations.push({
            type: 'delete',
            ref: collectionRef.doc(documentId),
          });
          if (operations.length >= 400) {
            await commitPendingOperations();
          }
        }
      }

      await commitPendingOperations();
    }
  }
}

async function createRuntimeDataBackboneStore({
  env = process.env,
  firestore = null,
} = {}) {
  const backend = resolveStoreBackend(env);

  if (backend === 'memory') {
    return new InMemoryDataBackboneStore();
  }

  if (backend === 'json') {
    const stateFile = env.PRICER_STATE_FILE
      ? path.resolve(env.PRICER_STATE_FILE)
      : path.resolve(process.cwd(), 'runtime_data', 'state.json');
    return new JsonFileDataBackboneStore(stateFile);
  }

  if (backend === 'firestore') {
    return new FirestoreDataBackboneStore({
      firestore: firestore || createFirestoreClientFromEnv(env),
      collectionPrefix: env.PRICER_FIRESTORE_COLLECTION_PREFIX || '',
      allowFullLoad: env.PRICER_ALLOW_FIRESTORE_FULL_LOAD === 'true',
      allowFullSave: env.PRICER_ALLOW_FIRESTORE_FULL_SAVE === 'true',
    });
  }

  throw new Error(`Unsupported PRICER_STORE_BACKEND value "${backend}".`);
}

function resolveStoreBackend(env = process.env) {
  const explicit = (env.PRICER_STORE_BACKEND || '').trim().toLowerCase();
  if (explicit) {
    return explicit;
  }

  if ((env.NODE_ENV || '').trim().toLowerCase() === 'test') {
    return 'memory';
  }

  if ((env.NODE_ENV || '').trim().toLowerCase() === 'production') {
    return 'firestore';
  }

  return env.PRICER_STATE_FILE ? 'json' : 'json';
}

function createFirestoreClientFromEnv(env = process.env) {
  // Load firebase-admin lazily so test and local JSON flows do not require it.
  // Production can rely on ADC, GOOGLE_APPLICATION_CREDENTIALS, or the runtime's
  // attached service account.
  // eslint-disable-next-line global-require
  const admin = require('firebase-admin/app');
  // eslint-disable-next-line global-require
  const { getFirestore } = require('firebase-admin/firestore');
  const appName = env.PRICER_FIRESTORE_APP_NAME || 'pricer-backend-store';
  const projectId = env.PRICER_FIRESTORE_PROJECT_ID || undefined;
  const databaseId = env.PRICER_FIRESTORE_DATABASE_ID || undefined;

  let app;
  try {
    app = admin.getApp(appName);
  } catch (error) {
    app = admin.initializeApp({
      credential: admin.applicationDefault(),
      projectId,
    }, appName);
  }

  return databaseId ? getFirestore(app, databaseId) : getFirestore(app);
}

function resolveCollectionName(prefix, collectionName) {
  return prefix ? `${prefix}_${collectionName}` : collectionName;
}

function validateCollectionName(collectionName) {
  if (!DATA_BACKBONE_COLLECTIONS.includes(collectionName)) {
    throw new Error(`Unknown data backbone collection "${collectionName}".`);
  }
}

function resolveCollectionNames(collectionNames) {
  const names = Array.isArray(collectionNames) ? collectionNames : [];
  const uniqueNames = [...new Set(names)];
  uniqueNames.forEach(validateCollectionName);
  return uniqueNames;
}

function buildDocumentId(collectionName, record) {
  const fields = COLLECTION_DOCUMENT_IDS[collectionName];
  if (!fields) {
    throw new Error(`No document id mapping is configured for collection "${collectionName}".`);
  }

  const values = fields.map((field) => {
    const value = record[field];
    if (value === undefined || value === null || value === '') {
      throw new Error(`Collection "${collectionName}" requires field "${field}" for Firestore document ids.`);
    }
    return String(value);
  });

  return values.join('__');
}

async function commitFirestoreOperations(firestore, operations) {
  const batchSize = 400;

  for (let index = 0; index < operations.length; index += batchSize) {
    const chunk = operations.slice(index, index + batchSize);

    if (typeof firestore.batch === 'function') {
      const batch = firestore.batch();
      chunk.forEach((operation) => {
        if (operation.type === 'set') {
          batch.set(operation.ref, operation.data);
        } else {
          batch.delete(operation.ref);
        }
      });
      await batch.commit();
      continue;
    }

    await Promise.all(chunk.map(async (operation) => {
      if (operation.type === 'set') {
        await operation.ref.set(operation.data);
      } else {
        await operation.ref.delete();
      }
    }));
  }
}

function sortCollectionRecords(collectionName, rows) {
  return [...rows].sort((left, right) => {
    const leftId = buildDocumentId(collectionName, left);
    const rightId = buildDocumentId(collectionName, right);
    return leftId.localeCompare(rightId);
  });
}

function normalizeQueryValues(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ''))];
}

function resolveQueryLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }
  return Math.min(parsed, 500);
}

function withRuntimeReadContext(context, callback) {
  return runtimeReadContext.run(context || {}, callback);
}

function getRuntimeReadContext() {
  return runtimeReadContext.getStore() || {};
}

function buildUnsafeFirestoreOperationError(message) {
  const error = new Error(message);
  error.code = 'UNSAFE_FIRESTORE_FULL_STORE_OPERATION';
  error.status = 503;
  return error;
}

function logRuntimeReadEvent(level, payload) {
  const context = getRuntimeReadContext();
  const entry = {
    route: context.route || 'unknown',
    method: context.method || null,
    path: context.path || null,
    backend: 'FirestoreDataBackboneStore',
    ...payload,
  };
  if (LARGE_COLLECTION_NAMES.includes(payload.collection)) {
    entry.large_collection = true;
  }

  const logger = getRuntimeLogger();
  const method = typeof logger[level] === 'function' ? level : 'log';
  logger[method]('Firestore runtime read', entry);
}

function getRuntimeLogger() {
  try {
    // eslint-disable-next-line global-require
    return require('firebase-functions/logger');
  } catch (_error) {
    return console;
  }
}

function normalizeState(state = {}, {
  cloneCollections = true,
} = {}) {
  const empty = createEmptyDataBackbone();
  const nextState = {};

  DATA_BACKBONE_COLLECTIONS.forEach((collectionName) => {
    const value = state[collectionName];
    if (Array.isArray(value)) {
      nextState[collectionName] = cloneCollections ? cloneState(value) : value;
      return;
    }

    nextState[collectionName] = cloneCollections ? cloneState(empty[collectionName]) : [];
  });

  return nextState;
}

function sanitizeStoredRecord(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeStoredRecord(entry));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, sanitizeStoredRecord(entry)])
    );
  }

  return value;
}

function sanitizeLoadedRecord(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeLoadedRecord(entry));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeLoadedRecord(entry)])
    );
  }

  return value;
}

function cloneState(state) {
  if (typeof structuredClone === 'function') {
    return structuredClone(state);
  }

  return JSON.parse(JSON.stringify(state));
}

function getEnrichmentByFingerprint(state, canonicalFingerprint) {
  if (!state || !canonicalFingerprint) {
    return null;
  }

  return (state.canonical_enrichment_store || []).find(
    (record) => record.canonical_fingerprint === canonicalFingerprint
  ) || null;
}

function storeEnrichment(state, canonicalFingerprint, enrichment, {
  modelName = null,
  promptVersion = null,
  createdAt = new Date().toISOString(),
  explicitClaimEvidence = [],
} = {}) {
  if (!state) {
    throw new Error('state is required to store canonical enrichment');
  }
  if (!canonicalFingerprint) {
    throw new Error('canonical_fingerprint is required to store canonical enrichment');
  }

  state.canonical_enrichment_store = state.canonical_enrichment_store || [];
  const record = {
    canonical_fingerprint: canonicalFingerprint,
    enrichment,
    explicit_claim_evidence: Array.isArray(explicitClaimEvidence) ? explicitClaimEvidence : [],
    model_name: modelName,
    prompt_version: promptVersion,
    created_at: createdAt,
  };
  const existingIndex = state.canonical_enrichment_store.findIndex(
    (entry) => entry.canonical_fingerprint === canonicalFingerprint
  );

  if (existingIndex >= 0) {
    state.canonical_enrichment_store[existingIndex] = record;
  } else {
    state.canonical_enrichment_store.push(record);
  }

  state.canonical_enrichment_store = state.canonical_enrichment_store.sort(
    (left, right) => String(left.canonical_fingerprint).localeCompare(String(right.canonical_fingerprint))
  );
  return record;
}

module.exports = {
  COLLECTION_DOCUMENT_IDS,
  DATA_BACKBONE_COLLECTIONS,
  FirestoreDataBackboneStore,
  COLLECTION_DOCUMENT_IDS,
  DATA_BACKBONE_COLLECTIONS,
  JsonFileDataBackboneStore,
  InMemoryDataBackboneStore,
  buildDocumentId,
  createEmptyDataBackbone,
  createRuntimeDataBackboneStore,
  getEnrichmentByFingerprint,
  resolveCollectionName,
  resolveStoreBackend,
  storeEnrichment,
  withRuntimeReadContext,
};
