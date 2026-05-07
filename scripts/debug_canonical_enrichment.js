#!/usr/bin/env node
'use strict';

const {
  createRuntimeDataBackboneStore,
} = require('../functions/src');

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const store = await createRuntimeDataBackboneStore({ env: process.env });
  const result = await debugCanonicalEnrichment({
    store,
    canonicalProductIds: options.canonicalProductIds,
    latest: options.latest,
    version: options.version,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function debugCanonicalEnrichment({
  store,
  canonicalProductIds = [],
  latest = null,
  version = null,
} = {}) {
  if (!store) {
    throw new Error('debugCanonicalEnrichment requires a store');
  }

  const ids = normalizeIds(canonicalProductIds);
  const normalizedVersion = normalizeOptionalText(version);
  if (ids.length === 0 && !latest) {
    throw new Error('Provide one or more canonical_product_id values, or use --latest N.');
  }

  const records = latest
    ? await loadLatestEnrichmentRecords({ store, limit: latest, version: normalizedVersion })
    : await loadEnrichmentRecordsByIds({ store, canonicalProductIds: ids, version: normalizedVersion });
  const productIds = normalizeIds(records.map((record) =>
    record.canonical_product_id || record.canonical_fingerprint
  ));
  const products = await loadCanonicalProductsByIds({ store, canonicalProductIds: productIds });
  const productById = new Map(products.map((product) => [product.canonical_product_id, product]));

  return {
    mode: latest ? 'latest' : 'by_id',
    latest: latest || null,
    version: normalizedVersion,
    requested_canonical_product_ids: ids,
    result_count: records.length,
    results: records.map((record) => formatEnrichmentInspectionRecord({
      record,
      product: productById.get(record.canonical_product_id || record.canonical_fingerprint) || null,
    })),
  };
}

async function loadEnrichmentRecordsByIds({
  store,
  canonicalProductIds,
  version = null,
}) {
  if (typeof store.queryCollectionByFieldValues === 'function') {
    const byProductId = await store.queryCollectionByFieldValues('canonical_enrichment_store', {
      fieldName: 'canonical_product_id',
      values: canonicalProductIds,
    });
    const foundFingerprints = new Set(byProductId.map((record) => record?.canonical_fingerprint).filter(Boolean));
    const missingIds = canonicalProductIds.filter((id) => !foundFingerprints.has(id));
    const byFingerprint = missingIds.length
      ? await store.queryCollectionByFieldValues('canonical_enrichment_store', {
        fieldName: 'canonical_fingerprint',
        values: missingIds,
      })
      : [];
    return sortForRequestedIds(
      filterByVersion(dedupeEnrichmentRecords([...byProductId, ...byFingerprint]), version),
      canonicalProductIds
    );
  }

  const state = await store.loadCollections(['canonical_enrichment_store']);
  const idSet = new Set(canonicalProductIds);
  return sortForRequestedIds(
    filterByVersion((state.canonical_enrichment_store || []).filter((record) =>
      idSet.has(record?.canonical_product_id) || idSet.has(record?.canonical_fingerprint)
    ), version),
    canonicalProductIds
  );
}

async function loadLatestEnrichmentRecords({
  store,
  limit,
  version = null,
}) {
  const state = await store.loadCollections(['canonical_enrichment_store']);
  return filterByVersion(state.canonical_enrichment_store || [], version)
    .sort(compareEnrichmentUpdatedDesc)
    .slice(0, Math.max(0, limit));
}

async function loadCanonicalProductsByIds({
  store,
  canonicalProductIds,
}) {
  if (canonicalProductIds.length === 0) {
    return [];
  }
  if (typeof store.queryCollectionByFieldValues === 'function') {
    return store.queryCollectionByFieldValues('canonical_products', {
      fieldName: 'canonical_product_id',
      values: canonicalProductIds,
    });
  }
  const state = await store.loadCollections(['canonical_products']);
  const idSet = new Set(canonicalProductIds);
  return (state.canonical_products || []).filter((product) => idSet.has(product?.canonical_product_id));
}

function formatEnrichmentInspectionRecord({
  record,
  product = null,
}) {
  const enrichment = record?.enrichment && typeof record.enrichment === 'object'
    ? record.enrichment
    : {};
  const identity = enrichment.product_identity && typeof enrichment.product_identity === 'object'
    ? enrichment.product_identity
    : {};

  return {
    canonical_product_id: record?.canonical_product_id || record?.canonical_fingerprint || identity.canonical_product_id || null,
    canonical_name: product?.canonical_display_name ||
      product?.source_example_name ||
      identity.observed_name ||
      enrichment.normalized_display_name_bg ||
      enrichment.normalized_display_name_en ||
      enrichment.base_product ||
      null,
    enrichment_version: getEnrichmentVersion(record),
    canonical_name_hash: record?.canonical_name_hash ||
      enrichment.canonical_name_hash ||
      identity.canonical_name_hash ||
      null,
    model_name: record?.model_name || null,
    updated_at: record?.updated_at || record?.created_at || null,
    enrichment_repair_status: record?.enrichment_repair_status || 'clean',
    repair_warnings: Array.isArray(record?.repair_warnings) ? record.repair_warnings : [],
    discarded_fields: Array.isArray(record?.discarded_fields) ? record.discarded_fields : [],
    taxonomy: summarizeTaxonomyClassification(enrichment.taxonomy_classification),
    category_summary: summarizeCategory(enrichment),
    packaging: summarizeSemanticObject(enrichment.packaging),
    product_form: summarizeSemanticObject(enrichment.product_form),
    semantic_usage_profile: summarizeSemanticUsageProfile(enrichment.semantic_usage_profile),
    semantic_embedding_summary: summarizeSemanticEmbeddingSummary(enrichment.semantic_embedding_summary),
    dairy_attributes: summarizeDairyAttributes(enrichment),
    personal_care_attributes: summarizePersonalCareAttributes(enrichment),
    quantity_storage_attributes: summarizeQuantityStorageAttributes(enrichment),
    registry_actions: Array.isArray(enrichment.registry_actions) ? enrichment.registry_actions : [],
    warnings: Array.isArray(enrichment.warnings)
      ? enrichment.warnings
      : Array.isArray(enrichment.llm_uncertainty_reasons)
        ? enrichment.llm_uncertainty_reasons
        : [],
    needs_human_review: typeof enrichment.needs_human_review === 'boolean'
      ? enrichment.needs_human_review
      : null,
    confidence_overall: numberOrNull(enrichment.confidence_overall ?? enrichment.confidence),
  };
}

function summarizeTaxonomyClassification(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      taxonomy_path_labels: [],
      primary_taxonomy: null,
      registry_matches: [],
      proposed_terms: [],
      confidence: null,
      needs_review: null,
      evidence: [],
    };
  }
  return {
    taxonomy_path_labels: normalizeArray(value.taxonomy_path_labels),
    taxonomy_path_term_ids: Array.isArray(value.taxonomy_path_term_ids) ? value.taxonomy_path_term_ids : [],
    primary_taxonomy: value.primary_taxonomy_label || null,
    primary_taxonomy_term_id: value.primary_taxonomy_term_id || null,
    raw_category_terms: normalizeArray(value.raw_category_terms),
    registry_matches: Array.isArray(value.registry_matches) ? value.registry_matches : [],
    proposed_terms: Array.isArray(value.proposed_terms) ? value.proposed_terms : [],
    confidence: numberOrNull(value.confidence),
    needs_review: typeof value.needs_review === 'boolean' ? value.needs_review : null,
    evidence: normalizeArray(value.evidence),
  };
}

function summarizeCategory(enrichment) {
  const category = enrichment.category && typeof enrichment.category === 'object'
    ? enrichment.category
    : null;
  if (category) {
    return {
      raw_terms: normalizeArray(category.raw_terms),
      category_path_raw: normalizeArray(category.category_path_raw),
      category_path: normalizeCategoryPath(category.category_path_raw),
      registry_matches: Array.isArray(category.registry_matches) ? category.registry_matches : [],
      proposed_terms: Array.isArray(category.proposed_terms) ? category.proposed_terms : [],
      search_buckets: normalizeArray(category.search_buckets),
      needs_review: typeof category.needs_review === 'boolean' ? category.needs_review : null,
    };
  }

  return {
    category_l1: enrichment.category_l1 || null,
    category_l2: enrichment.category_l2 || null,
    category_l3: enrichment.category_l3 || null,
    category_l4: enrichment.category_l4 || null,
    category_path: normalizeCategoryPath([
      enrichment.category_l1,
      enrichment.category_l2,
      enrichment.category_l3,
      enrichment.category_l4,
    ]),
    category: typeof enrichment.category === 'string' ? enrichment.category : null,
    subcategory: enrichment.subcategory || null,
    product_family: enrichment.product_family || null,
    product_type: enrichment.product_type || null,
    search_buckets: normalizeArray([
      enrichment.category,
      enrichment.subcategory,
      enrichment.product_family,
      enrichment.product_type,
    ]),
  };
}

function summarizePersonalCareAttributes(enrichment) {
  const attributes = enrichment.attributes && typeof enrichment.attributes === 'object' && !Array.isArray(enrichment.attributes)
    ? enrichment.attributes
    : {};
  const personalCare = attributes.personal_care && typeof attributes.personal_care === 'object'
    ? attributes.personal_care
    : {};

  return {
    ...personalCare,
    target_hair_type: personalCare.target_hair_type ?? null,
    target_skin_type: personalCare.target_skin_type ?? null,
    scent: personalCare.scent ?? null,
    active_claims: normalizeArray(personalCare.active_claims),
    use_area: personalCare.use_area ?? null,
  };
}

function normalizeCategoryPath(values) {
  return normalizeArray(values)
    .map((value) => typeof value === 'string' ? value.trim() : value)
    .filter((value) => value !== null && value !== undefined && value !== '');
}

function summarizeSemanticObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return {
      raw_terms: normalizeArray(value.raw_terms),
      description: value.description || null,
      registry_match: value.registry_match || null,
      proposed_aliases: normalizeArray(value.proposed_aliases),
      proposed_new_term: value.proposed_new_term || null,
      search_bucket: value.search_bucket || null,
      confidence: numberOrNull(value.confidence),
      needs_review: typeof value.needs_review === 'boolean' ? value.needs_review : null,
      evidence: normalizeArray(value.evidence),
    };
  }

  return {
    raw_terms: normalizeArray(value ? [value] : []),
    description: null,
    registry_match: typeof value === 'string' ? value : null,
    proposed_aliases: [],
    proposed_new_term: null,
    search_bucket: typeof value === 'string' ? value : null,
    confidence: null,
    needs_review: null,
    evidence: [],
  };
}

function summarizeDairyAttributes(enrichment) {
  const attributes = enrichment.attributes && typeof enrichment.attributes === 'object' && !Array.isArray(enrichment.attributes)
    ? enrichment.attributes
    : {};
  const dairy = attributes.dairy && typeof attributes.dairy === 'object'
    ? attributes.dairy
    : {};

  return {
    ...dairy,
    dairy_type: dairy.dairy_type ?? enrichment.dairy_type ?? null,
    milk_source: dairy.milk_source ?? enrichment.milk_source ?? null,
    fat_percent: dairy.fat_percent ?? enrichment.fat_percent ?? null,
    uht_or_fresh: dairy.uht_or_fresh ?? enrichment.uht_or_fresh ?? null,
    lactose_free: dairy.lactose_free ?? enrichment.lactose_free ?? null,
    plain_or_flavored: dairy.plain_or_flavored ?? enrichment.plain_or_flavored ?? null,
    likely_dairy: enrichment.likely_dairy ?? null,
  };
}

function summarizeSemanticUsageProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      cuisine_contexts: [],
      flavor_profile: {
        primary_tastes: [],
        descriptors: [],
        intensity: null,
      },
      culinary_roles: [],
      dish_roles: [],
      meal_contexts: [],
      common_uses: [],
      preparation_contexts: [],
      pairing_suggestions: [],
      substitute_terms: [],
      consumer_search_intents: [],
      not_for: [],
      confidence: null,
      evidence: [],
      needs_review: null,
    };
  }

  const flavorProfile = value.flavor_profile && typeof value.flavor_profile === 'object' && !Array.isArray(value.flavor_profile)
    ? value.flavor_profile
    : {};
  return {
    cuisine_contexts: normalizeArray(value.cuisine_contexts),
    flavor_profile: {
      primary_tastes: normalizeArray(flavorProfile.primary_tastes),
      descriptors: normalizeArray(flavorProfile.descriptors),
      intensity: flavorProfile.intensity || null,
    },
    culinary_roles: normalizeArray(value.culinary_roles),
    dish_roles: normalizeArray(value.dish_roles),
    meal_contexts: normalizeArray(value.meal_contexts),
    common_uses: normalizeArray(value.common_uses),
    preparation_contexts: normalizeArray(value.preparation_contexts),
    pairing_suggestions: normalizeArray(value.pairing_suggestions),
    substitute_terms: normalizeArray(value.substitute_terms),
    consumer_search_intents: normalizeArray(value.consumer_search_intents),
    not_for: normalizeArray(value.not_for),
    confidence: numberOrNull(value.confidence),
    evidence: normalizeArray(value.evidence),
    needs_review: typeof value.needs_review === 'boolean' ? value.needs_review : null,
  };
}

function summarizeSemanticEmbeddingSummary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      summary: '',
      summary_language: 'unknown',
      included_aspects: [],
      evidence: [],
      confidence: null,
      needs_review: null,
    };
  }
  return {
    summary: typeof value.summary === 'string' ? value.summary : '',
    summary_language: value.summary_language || 'unknown',
    included_aspects: normalizeArray(value.included_aspects),
    evidence: normalizeArray(value.evidence),
    confidence: numberOrNull(value.confidence),
    needs_review: typeof value.needs_review === 'boolean' ? value.needs_review : null,
  };
}

function summarizeQuantityStorageAttributes(enrichment) {
  const attributes = enrichment.attributes && typeof enrichment.attributes === 'object' && !Array.isArray(enrichment.attributes)
    ? enrichment.attributes
    : {};
  const quantity = attributes.quantity && typeof attributes.quantity === 'object'
    ? attributes.quantity
    : {};
  const storage = attributes.storage && typeof attributes.storage === 'object'
    ? attributes.storage
    : {};

  return {
    quantity: {
      ...quantity,
      size_marker: quantity.size_marker ?? enrichment.size_marker ?? null,
      package_quantity: quantity.package_quantity ?? enrichment.package_quantity ?? null,
      package_unit: quantity.package_unit ?? enrichment.package_unit ?? null,
      total_quantity: quantity.total_quantity ?? enrichment.total_quantity ?? null,
      total_unit: quantity.total_unit ?? enrichment.total_unit ?? null,
      multipack_count: quantity.multipack_count ?? enrichment.multipack_count ?? null,
      unit_quantity: quantity.unit_quantity ?? enrichment.unit_quantity ?? null,
      unit_quantity_unit: quantity.unit_quantity_unit ?? enrichment.unit_quantity_unit ?? null,
    },
    storage: {
      ...storage,
      storage_type: storage.storage_type ?? enrichment.storage_type ?? null,
    },
  };
}

function getEnrichmentVersion(record) {
  return record?.enrichment_version ||
    record?.enrichment?.enrichment_version ||
    record?.enrichment?.schema_version ||
    null;
}

function filterByVersion(records, version = null) {
  if (!version) {
    return records;
  }
  return records.filter((record) => getEnrichmentVersion(record) === version);
}

function dedupeEnrichmentRecords(records) {
  const byKey = new Map();
  for (const record of records) {
    const key = record?.canonical_fingerprint || record?.canonical_product_id;
    if (key && !byKey.has(key)) {
      byKey.set(key, record);
    }
  }
  return [...byKey.values()];
}

function sortForRequestedIds(records, canonicalProductIds) {
  const positionById = new Map(canonicalProductIds.map((id, index) => [id, index]));
  return [...records].sort((left, right) => {
    const leftIndex = positionById.get(left?.canonical_product_id) ?? positionById.get(left?.canonical_fingerprint) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = positionById.get(right?.canonical_product_id) ?? positionById.get(right?.canonical_fingerprint) ?? Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }
    return compareEnrichmentUpdatedDesc(left, right);
  });
}

function compareEnrichmentUpdatedDesc(left, right) {
  const leftTime = String(left?.updated_at || left?.created_at || '');
  const rightTime = String(right?.updated_at || right?.created_at || '');
  if (leftTime !== rightTime) {
    return rightTime.localeCompare(leftTime);
  }
  return String(left?.canonical_product_id || left?.canonical_fingerprint || '')
    .localeCompare(String(right?.canonical_product_id || right?.canonical_fingerprint || ''));
}

function parseArgs(args) {
  const options = {
    canonicalProductIds: [],
    latest: null,
    version: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--latest') {
      const value = Number.parseInt(args[index + 1] || '', 10);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error('--latest requires a positive integer.');
      }
      options.latest = value;
      index += 1;
      continue;
    }
    if (arg === '--version') {
      options.version = normalizeOptionalText(args[index + 1]);
      if (!options.version) {
        throw new Error('--version requires a value.');
      }
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    }
    options.canonicalProductIds.push(arg);
  }

  if (options.latest && options.canonicalProductIds.length > 0) {
    throw new Error('Use either canonical_product_id values or --latest, not both.');
  }
  return options;
}

function printHelp() {
  process.stdout.write(`Usage:
  node scripts/debug_canonical_enrichment.js <canonical_product_id...>
  node scripts/debug_canonical_enrichment.js --latest 10 --version canonical_semantic_v3

Options:
  --latest N       Print the latest N enrichment records by updated_at.
  --version VALUE  Restrict records to one enrichment_version.
`);
}

function normalizeIds(values) {
  return [...new Set((values || [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
}

function normalizeOptionalText(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeArray(value) {
  const input = Array.isArray(value) ? value : [value];
  return input
    .map((entry) => typeof entry === 'string' ? entry.trim() : entry)
    .filter((entry) => entry !== null && entry !== undefined && entry !== '');
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  debugCanonicalEnrichment,
  formatEnrichmentInspectionRecord,
  parseArgs,
};
