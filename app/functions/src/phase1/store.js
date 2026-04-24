const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');

function createEmptyDataBackbone() {
  return {
    raw_price_snapshots: [],
    source_products: [],
    source_product_enrichment: [],
    semantic_profiles: [],
    embedding_records: [],
    feedback_events: [],
    product_daily_prices: [],
    category_daily_aggregates: [],
    sql_products: [],
    sql_product_prices_daily: [],
    sql_category_aggregates: [],
    vector_index_records: [],
    canonical_products: [],
    canonical_product_mappings: [],
    canonical_enrichment_store: [],
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
    pipeline_logs: [],
    analytics_events: [],
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
  category_daily_aggregates: ['category_code', 'date'],
  sql_products: ['source_product_id'],
  sql_product_prices_daily: ['source_product_id', 'date'],
  sql_category_aggregates: ['category_code', 'date'],
  vector_index_records: ['source_product_id', 'embedding_model'],
  canonical_products: ['canonical_product_id'],
  canonical_product_mappings: ['source_product_id'],
  canonical_enrichment_store: ['canonical_fingerprint'],
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
  pipeline_logs: ['log_id'],
  analytics_events: ['analytics_event_id'],
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

  async save(nextState) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(normalizeState(nextState), null, 2));
  }
}

class FirestoreDataBackboneStore {
  constructor({
    firestore,
    collectionPrefix = '',
  }) {
    if (!firestore) {
      throw new Error('FirestoreDataBackboneStore requires a firestore instance.');
    }

    this.firestore = firestore;
    this.collectionPrefix = collectionPrefix;
  }

  async load() {
    const collections = await Promise.all(
      DATA_BACKBONE_COLLECTIONS.map(async (collectionName) => {
        const snapshot = await this.firestore
          .collection(resolveCollectionName(this.collectionPrefix, collectionName))
          .get();
        const rows = snapshot.docs
          .map((doc) => sanitizeLoadedRecord(doc.data()))
          .sort((left, right) => {
            const leftId = buildDocumentId(collectionName, left);
            const rightId = buildDocumentId(collectionName, right);
            return leftId.localeCompare(rightId);
          });
        return [collectionName, rows];
      })
    );

    return normalizeState(Object.fromEntries(collections));
  }

  async save(nextState) {
    const state = normalizeState(nextState);
    const operations = [];

    for (const collectionName of DATA_BACKBONE_COLLECTIONS) {
      const collectionRef = this.firestore.collection(
        resolveCollectionName(this.collectionPrefix, collectionName)
      );
      const snapshot = await collectionRef.get();
      const existingIds = new Set(snapshot.docs.map((doc) => doc.id));
      const nextRecords = state[collectionName];
      const nextIds = new Set();

      nextRecords.forEach((record) => {
        const documentId = buildDocumentId(collectionName, record);
        nextIds.add(documentId);
        operations.push({
          type: 'set',
          ref: collectionRef.doc(documentId),
          data: sanitizeStoredRecord(record),
        });
      });

      existingIds.forEach((documentId) => {
        if (!nextIds.has(documentId)) {
          operations.push({
            type: 'delete',
            ref: collectionRef.doc(documentId),
          });
        }
      });
    }

    await commitFirestoreOperations(this.firestore, operations);
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

function normalizeState(state = {}) {
  const empty = createEmptyDataBackbone();
  const nextState = {};

  DATA_BACKBONE_COLLECTIONS.forEach((collectionName) => {
    const value = state[collectionName];
    nextState[collectionName] = Array.isArray(value) ? cloneState(value) : empty[collectionName];
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
  JsonFileDataBackboneStore,
  InMemoryDataBackboneStore,
  createEmptyDataBackbone,
  createRuntimeDataBackboneStore,
  getEnrichmentByFingerprint,
  resolveStoreBackend,
  storeEnrichment,
};
