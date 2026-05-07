#!/usr/bin/env node
'use strict';

const {
  createRuntimeDataBackboneStore,
  resolveCollectionName,
  resolveRuntimeStoreConfig,
} = require('../functions/src');

const DIAGNOSTIC_COLLECTIONS = Object.freeze([
  'canonical_products',
  'canonical_enrichment_store',
  'semantic_term_registry',
]);

async function main() {
  const env = process.env;
  const config = resolveRuntimeStoreConfig(env);
  const store = await createRuntimeDataBackboneStore({ env });
  const resolvedCollections = Object.fromEntries(
    DIAGNOSTIC_COLLECTIONS.map((collectionName) => [
      collectionName,
      resolveCollectionName(config.firestore.collectionPrefix, collectionName),
    ])
  );
  const collectionReports = {};

  if (config.backend === 'firestore' && store?.isFirestoreBackboneStore) {
    for (const collectionName of DIAGNOSTIC_COLLECTIONS) {
      collectionReports[collectionName] = await inspectFirestoreCollection({
        store,
        collectionName,
        resolvedName: resolvedCollections[collectionName],
      });
    }
  } else {
    const state = typeof store.loadCollections === 'function'
      ? await store.loadCollections(DIAGNOSTIC_COLLECTIONS)
      : await store.load();
    for (const collectionName of DIAGNOSTIC_COLLECTIONS) {
      const rows = Array.isArray(state?.[collectionName]) ? state[collectionName] : [];
      collectionReports[collectionName] = {
        resolved_name: collectionName,
        row_count: rows.length,
      };
    }
    collectionReports.canonical_products.first_3 = firstCanonicalProducts(state.canonical_products || []);
  }

  const output = {
    selected_store_backend: config.backend,
    firestore: {
      project_id: config.firestore.projectId || null,
      database_id: config.firestore.databaseId,
      collection_prefix: config.firestore.collectionPrefix,
      app_name: config.firestore.appName,
      google_application_credentials_present: config.firestore.googleApplicationCredentialsPresent,
      emulator: {
        active: config.firestore.emulator.active,
        firestore_emulator_host: config.firestore.emulator.firestoreEmulatorHost || null,
        legacy_firestore_emulator_address: config.firestore.emulator.legacyFirestoreEmulatorHost || null,
        firebase_emulator_hub: config.firestore.emulator.firebaseEmulatorHub || null,
        gcloud_project: config.firestore.emulator.gcloudProject || null,
      },
    },
    json_state_file: config.backend === 'json' ? config.stateFile : null,
    resolved_collections: resolvedCollections,
    collections: collectionReports,
    warnings: buildWarnings(config, collectionReports),
  };

  console.log(JSON.stringify(output, null, 2));
}

async function inspectFirestoreCollection({
  store,
  collectionName,
  resolvedName,
}) {
  const collectionRef = store.firestore.collection(resolvedName);
  const report = {
    resolved_name: resolvedName,
    row_count: await countFirestoreCollection(collectionRef),
  };

  if (collectionName === 'canonical_products') {
    const snapshot = await collectionRef
      .orderBy('canonical_product_id')
      .limit(3)
      .get();
    report.first_3 = firstCanonicalProducts(snapshot.docs.map((doc) => doc.data()));
  }

  return report;
}

async function countFirestoreCollection(collectionRef) {
  if (typeof collectionRef.count === 'function') {
    const aggregate = await collectionRef.count().get();
    return aggregate.data().count;
  }
  const snapshot = await collectionRef.get();
  return snapshot.size;
}

function firstCanonicalProducts(rows) {
  return [...(rows || [])]
    .filter(Boolean)
    .sort((left, right) =>
      String(left.canonical_product_id || '').localeCompare(String(right.canonical_product_id || ''))
    )
    .slice(0, 3)
    .map((row) => ({
      canonical_product_id: row.canonical_product_id || null,
      canonical_display_name: row.canonical_display_name || null,
      source_example_name: row.source_example_name || null,
    }));
}

function buildWarnings(config, collectionReports) {
  const warnings = [];
  if (config.backend === 'firestore' && !config.firestore.collectionPrefix) {
    warnings.push(
      'PRICER_FIRESTORE_COLLECTION_PREFIX is empty; production/admin runbooks use prod, which resolves canonical_products to prod_canonical_products.'
    );
  }
  if (config.backend === 'firestore' && !config.firestore.projectId) {
    warnings.push(
      'PRICER_FIRESTORE_PROJECT_ID is not set; firebase-admin will rely on ADC/runtime project resolution.'
    );
  }
  if (config.firestore.emulator.active) {
    warnings.push('A Firestore emulator environment variable is active; reads may target local emulator data.');
  }
  if (
    config.backend === 'firestore' &&
    collectionReports.canonical_products?.row_count === 0 &&
    !config.firestore.collectionPrefix
  ) {
    warnings.push(
      'canonical_products is empty with an empty collection prefix. If the app/admin sees products, rerun with PRICER_FIRESTORE_COLLECTION_PREFIX=prod.'
    );
  }
  return warnings;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[${new Date().toISOString()}] Runtime store diagnostic failed.`);
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}
