const crypto = require('node:crypto');

const INCREMENTAL_INGEST_RULES_VERSION = 'phase6_incremental_ingest_v1';
const INCREMENTAL_EVENT_POLICIES = new Set([
  'all_changes',
  'price_promo_availability',
  'none',
]);
const DEFAULT_INCREMENTAL_EVENT_POLICY = 'price_promo_availability';
const DEFAULT_INCREMENTAL_HIGH_WRITE_THRESHOLD = 100000;
const DIFF_SAMPLE_LIMIT = 3;

function buildCurrentOfferFingerprint(offer, {
  generatedAt = new Date().toISOString(),
  firstSeenSnapshotDate = null,
  lastSeenSnapshotDate = null,
} = {}) {
  if (!offer?.source_product_id) {
    throw new Error('source_product_id is required to build a current offer fingerprint.');
  }

  const payload = normalizeFingerprintPayload(offer);
  const snapshotDate = normalizeString(offer.snapshot_date) || null;
  return {
    source_product_id: offer.source_product_id,
    canonical_product_id: offer.canonical_product_id || null,
    offer_id: offer.offer_id || `offer_${offer.source_product_id}`,
    snapshot_date: snapshotDate,
    current_price: payload.current_price,
    retail_price: payload.retail_price,
    promo_price: payload.promo_price,
    unit_price: payload.unit_price,
    is_sale: payload.is_sale,
    is_promotion: payload.is_promotion,
    is_available: true,
    chain_id: payload.chain_id,
    chain_name: payload.chain_name,
    retailer: payload.retailer,
    store_id: payload.store_id,
    store_name: payload.store_name,
    locality_code: payload.locality_code,
    source_file_name: payload.source_file_name,
    source_file_name_raw: payload.source_file_name_raw,
    source_file_stem: payload.source_file_stem,
    source_chain_name_normalized: payload.source_chain_name_normalized,
    fingerprint_payload: payload,
    fingerprint_hash: hashStableValue(payload),
    first_seen_snapshot_date: firstSeenSnapshotDate || snapshotDate,
    last_seen_snapshot_date: lastSeenSnapshotDate || snapshotDate,
    updated_at: generatedAt,
    rules_version: INCREMENTAL_INGEST_RULES_VERSION,
  };
}

function buildCurrentOfferFingerprints(offers, options = {}) {
  return (offers || [])
    .map((offer) => buildCurrentOfferFingerprint(offer, options))
    .sort((left, right) => left.source_product_id.localeCompare(right.source_product_id));
}

function buildCompactCurrentOfferBaselineRecord(offer, options = {}) {
  const fingerprint = buildCurrentOfferFingerprint(offer, options);
  return {
    source_product_id: fingerprint.source_product_id,
    canonical_product_id: fingerprint.canonical_product_id,
    offer_fingerprint: fingerprint.fingerprint_hash,
    price: fingerprint.current_price,
    current_price: fingerprint.current_price,
    retail_price: fingerprint.retail_price,
    promo_price: fingerprint.promo_price,
    unit_price: fingerprint.unit_price,
    is_sale: fingerprint.is_sale,
    is_promotion: fingerprint.is_promotion,
    snapshot_date: fingerprint.snapshot_date,
    first_seen_snapshot_date: fingerprint.first_seen_snapshot_date,
    last_seen_snapshot_date: fingerprint.last_seen_snapshot_date,
    updated_at: fingerprint.updated_at,
    rules_version: fingerprint.rules_version,
  };
}

function buildCompactCurrentOfferBaselineRecords(offers, options = {}) {
  return (offers || [])
    .map((offer) => buildCompactCurrentOfferBaselineRecord(offer, options))
    .sort((left, right) => left.source_product_id.localeCompare(right.source_product_id));
}

function buildRichCurrentOfferBaselineRecord(offer, options = {}) {
  const compact = buildCompactCurrentOfferBaselineRecord(offer, options);
  return {
    ...compact,
    baseline_mode: 'rich',
    offer_id: offer.offer_id || `offer_${offer.source_product_id}`,
    source_product_name_raw: offer.source_product_name_raw || offer.product_name_raw || offer.source_name || null,
    source_product_name: offer.source_product_name || offer.source_product_name_raw || offer.product_name_raw || offer.source_name || null,
    source_name: offer.source_name || null,
    canonical_name: offer.canonical_name || offer.canonical_display_name || null,
    category_code: offer.category_code || offer.canonical_category_code || null,
    canonical_category_code: offer.canonical_category_code || null,
    chain_id: offer.chain_id || null,
    chain_name: offer.chain_name || null,
    retailer: offer.retailer || offer.chain_name || offer.source_chain_name_normalized || offer.source_name || null,
    store_id: offer.store_id || null,
    store_name: offer.store_name || null,
    locality_code: offer.locality_code || null,
    region: offer.region || offer.locality_code || null,
    product_code: offer.product_code || offer.source_product_code || null,
    source_file_name: offer.source_file_name || null,
    source_file_name_raw: offer.source_file_name_raw || null,
    source_file_stem: offer.source_file_stem || null,
    source_chain_name_normalized: offer.source_chain_name_normalized || null,
  };
}

function buildRichCurrentOfferBaselineRecords(offers, options = {}) {
  return (offers || [])
    .map((offer) => buildRichCurrentOfferBaselineRecord(offer, options))
    .sort((left, right) => left.source_product_id.localeCompare(right.source_product_id));
}

function diffCurrentOffers({
  nextOffers = [],
  existingFingerprints = [],
  generatedAt = new Date().toISOString(),
  eventPolicy = DEFAULT_INCREMENTAL_EVENT_POLICY,
} = {}) {
  const normalizedEventPolicy = normalizeIncrementalEventPolicy(eventPolicy);
  const nextFingerprints = buildCurrentOfferFingerprints(nextOffers, { generatedAt });
  const nextBySourceId = new Map(nextFingerprints.map((row) => [row.source_product_id, row]));
  const existingBySourceId = new Map((existingFingerprints || []).map((row) => [row.source_product_id, normalizeExistingFingerprint(row)]));
  const categories = {
    unchanged: [],
    new_offers: [],
    price_changed: [],
    promo_changed: [],
    availability_changed: [],
    metadata_changed_only: [],
    canonical_mapping_changed: [],
    other_changed: [],
    missing_removed: [],
  };
  const affectedCanonicalProductIds = new Set();

  for (const next of nextFingerprints) {
    const existing = existingBySourceId.get(next.source_product_id);
    if (!existing) {
      categories.new_offers.push({
        ...next,
        change_reasons: ['new_offer'],
      });
      addAffectedCanonicalProductIds(affectedCanonicalProductIds, next);
      continue;
    }

    if (existing.fingerprint_hash === next.fingerprint_hash) {
      categories.unchanged.push(next);
      continue;
    }

    const classification = classifyFingerprintChange(existing, next);
    categories[classification].push({
      ...next,
      previous_fingerprint_hash: existing.fingerprint_hash || null,
      previous_snapshot_date: existing.snapshot_date || null,
      previous_canonical_product_id: existing.canonical_product_id || null,
      change_reasons: buildChangeReasons(existing, next),
    });
    addAffectedCanonicalProductIds(affectedCanonicalProductIds, existing, next);
  }

  for (const existing of existingBySourceId.values()) {
    if (nextBySourceId.has(existing.source_product_id)) {
      continue;
    }
    categories.missing_removed.push({
      ...existing,
      is_available: false,
      missing_as_of: generatedAt,
    });
    addAffectedCanonicalProductIds(affectedCanonicalProductIds, existing);
  }

  const counts = Object.fromEntries(
    Object.entries(categories).map(([name, rows]) => [name, rows.length])
  );
  counts.new = counts.new_offers;
  counts.metadata_changed = counts.availability_changed +
    counts.metadata_changed_only +
    counts.canonical_mapping_changed +
    counts.other_changed;
  const changedOfferCount = countChangedOfferWrites(counts);
  const affectedCanonicalIds = [...affectedCanonicalProductIds].sort();
  const writePolicy = buildIncrementalWritePolicy({
    counts,
    summariesToUpdate: affectedCanonicalIds.length,
    eventPolicy: normalizedEventPolicy,
  });

  return {
    rules_version: INCREMENTAL_INGEST_RULES_VERSION,
    event_policy: normalizedEventPolicy,
    counts,
    scanned_next_offers: nextFingerprints.length,
    scanned_existing_fingerprints: existingFingerprints.length,
    affected_canonical_product_ids: affectedCanonicalIds,
    summaries_to_update: affectedCanonicalIds.length,
    change_category_report: buildChangeCategoryReport(categories),
    estimated_writes: writePolicy.selected,
    estimated_write_policy_variants: writePolicy.variants,
    recommended_event_policy: DEFAULT_INCREMENTAL_EVENT_POLICY,
    categories,
  };
}

function buildSnapshotManifest({
  snapshotDate,
  snapshotUrl = null,
  collectionPrefix = null,
  source = {},
  diff,
  generatedAt = new Date().toISOString(),
  mode = 'daily_incremental_dry_run',
  comparisonMode = 'fingerprint_manifest',
} = {}) {
  if (!snapshotDate) {
    throw new Error('snapshotDate is required to build a snapshot manifest.');
  }
  const counts = diff?.counts || {};
  return {
    manifest_id: buildSnapshotManifestId({ snapshotDate, mode, collectionPrefix }),
    snapshot_date: snapshotDate,
    snapshot_url: snapshotUrl,
    mode,
    comparison_mode: comparisonMode,
    collection_prefix: collectionPrefix,
    scanned_rows: source.imported_rows || 0,
    unique_rows: source.unique_rows || 0,
    new_offers: counts.new_offers || counts.new || 0,
    changed_offers: countChangedOfferWrites(counts) - (counts.new_offers || counts.new || 0),
    unchanged_offers: counts.unchanged || 0,
    removed_missing_offers: counts.missing_removed || 0,
    affected_canonical_product_ids: diff?.affected_canonical_product_ids || [],
    summaries_to_update: diff?.summaries_to_update || 0,
    estimated_writes: diff?.estimated_writes || {},
    actual_writes: diff?.actual_writes || null,
    failed_writes: diff?.failed_writes || null,
    event_policy: diff?.event_policy || DEFAULT_INCREMENTAL_EVENT_POLICY,
    high_write_catchup_acknowledged: diff?.high_write_catchup_acknowledged === true,
    destructive_deletes: false,
    created_at: generatedAt,
    updated_at: generatedAt,
    rules_version: INCREMENTAL_INGEST_RULES_VERSION,
  };
}

function buildIncrementalWriterPlan({
  diff,
  dryRun = true,
  allowHighWriteCatchup = false,
  highWriteThreshold = DEFAULT_INCREMENTAL_HIGH_WRITE_THRESHOLD,
  markMissingUnavailable = false,
} = {}) {
  if (!diff) {
    throw new Error('diff is required to build an incremental writer plan.');
  }
  const threshold = normalizePositiveInteger(
    highWriteThreshold,
    DEFAULT_INCREMENTAL_HIGH_WRITE_THRESHOLD
  );
  const estimatedWrites = diff.estimated_writes || {};
  const estimatedTotal = Number(estimatedWrites.total_without_removed_mark_unavailable || 0);
  const highWrite = estimatedTotal > threshold;
  const changedRows = changedRowsForWriter(diff);
  const eventRows = buildOfferChangeEvents({
    diff,
    snapshotDate: changedRows[0]?.snapshot_date || null,
    eventPolicy: diff.event_policy,
  });
  return {
    dry_run: dryRun === true,
    can_write: dryRun !== true && (!highWrite || allowHighWriteCatchup === true),
    refusal_reason: dryRun === true
      ? null
      : highWrite && allowHighWriteCatchup !== true
        ? `Estimated writes (${estimatedTotal}) exceed PRICER_INCREMENTAL_HIGH_WRITE_THRESHOLD (${threshold}); set PRICER_INCREMENTAL_ALLOW_HIGH_WRITE_CATCHUP=true after operator review.`
        : null,
    high_write: highWrite,
    high_write_threshold: threshold,
    high_write_catchup_acknowledged: allowHighWriteCatchup === true,
    mark_missing_unavailable: markMissingUnavailable === true,
    changed_current_offer_source_product_ids: changedRows.map((row) => row.source_product_id).sort(),
    changed_current_offer_count: changedRows.length,
    offer_change_event_count: eventRows.length,
    missing_removed_count: diff.counts?.missing_removed || 0,
    missing_removed_action: markMissingUnavailable === true ? 'mark_unavailable' : 'report_only',
    target_collections: [
      'current_product_offers',
      'current_offer_fingerprints',
      'offer_change_events',
      'canonical_current_offer_summary',
      'snapshot_manifests',
    ],
  };
}

function changedRowsForWriter(diff = {}) {
  const categories = diff.categories || {};
  return [
    ...(categories.new_offers || []),
    ...(categories.price_changed || []),
    ...(categories.promo_changed || []),
    ...(categories.availability_changed || []),
    ...(categories.metadata_changed_only || []),
    ...(categories.canonical_mapping_changed || []),
    ...(categories.other_changed || []),
  ].sort((left, right) => String(left.source_product_id || '').localeCompare(String(right.source_product_id || '')));
}

function buildOfferChangeEvents({
  diff,
  snapshotDate,
  generatedAt = new Date().toISOString(),
  eventPolicy = diff?.event_policy || DEFAULT_INCREMENTAL_EVENT_POLICY,
} = {}) {
  const normalizedEventPolicy = normalizeIncrementalEventPolicy(eventPolicy);
  const eventRows = [];
  const pushRows = (eventType, rows) => {
    (rows || []).forEach((row) => {
      eventRows.push({
        event_id: buildOfferChangeEventId({
          sourceProductId: row.source_product_id,
          snapshotDate,
          eventType,
          fingerprintHash: row.fingerprint_hash || row.previous_fingerprint_hash || 'missing',
        }),
        event_type: eventType,
        source_product_id: row.source_product_id,
        canonical_product_id: row.canonical_product_id || null,
        offer_id: row.offer_id || null,
        snapshot_date: snapshotDate || row.snapshot_date || null,
        current_price: row.current_price ?? null,
        retail_price: row.retail_price ?? null,
        promo_price: row.promo_price ?? null,
        unit_price: row.unit_price ?? null,
        is_sale: row.is_sale === true,
        is_promotion: row.is_promotion === true,
        fingerprint_hash: row.fingerprint_hash || null,
        previous_fingerprint_hash: row.previous_fingerprint_hash || null,
        previous_snapshot_date: row.previous_snapshot_date || null,
        created_at: generatedAt,
        rules_version: INCREMENTAL_INGEST_RULES_VERSION,
      });
    });
  };

  const categories = eventCategoriesForPolicy(normalizedEventPolicy);
  categories.forEach((categoryName) => {
    pushRows(eventTypeForChangeCategory(categoryName), diff?.categories?.[categoryName]);
  });
  return eventRows.sort((left, right) => left.event_id.localeCompare(right.event_id));
}

function normalizeFingerprintPayload(offer) {
  return {
    source_product_id: normalizeString(offer.source_product_id),
    canonical_product_id: normalizeString(offer.canonical_product_id),
    current_price: normalizeMoney(offer.current_price),
    retail_price: normalizeMoney(offer.retail_price),
    promo_price: normalizeMoney(offer.promo_price),
    unit_price: normalizeNullableNumber(offer.unit_price),
    is_sale: offer.is_sale === true,
    is_promotion: offer.is_promotion === true,
    is_available: true,
    chain_id: normalizeString(offer.chain_id),
    chain_name: normalizeString(offer.chain_name),
    retailer: normalizeString(offer.retailer),
    store_id: normalizeString(offer.store_id),
    store_name: normalizeString(offer.store_name),
    locality_code: normalizeString(offer.locality_code),
    source_file_name: normalizeString(offer.source_file_name),
    source_file_name_raw: normalizeString(offer.source_file_name_raw),
    source_file_stem: normalizeString(offer.source_file_stem),
    source_chain_name_normalized: normalizeString(offer.source_chain_name_normalized),
  };
}

function normalizeExistingFingerprint(row) {
  if (row?.fingerprint_payload && typeof row.fingerprint_payload === 'object') {
    return {
      ...row,
      fingerprint_hash: row.fingerprint_hash || hashStableValue(row.fingerprint_payload),
    };
  }
  const existingHash = row?.fingerprint_hash || row?.offer_fingerprint || null;
  if (existingHash) {
    return {
      ...row,
      fingerprint_hash: existingHash,
      current_price: row.current_price ?? row.price ?? null,
      is_sale: row.is_sale === true,
      is_promotion: row.is_promotion === true || row.is_sale === true,
      is_available: row.is_available !== false,
    };
  }
  return buildCurrentOfferFingerprint(row, {
    generatedAt: row?.updated_at || new Date().toISOString(),
    firstSeenSnapshotDate: row?.first_seen_snapshot_date || row?.snapshot_date || null,
    lastSeenSnapshotDate: row?.last_seen_snapshot_date || row?.snapshot_date || null,
  });
}

function classifyFingerprintChange(existing, next) {
  if (
    normalizeMoney(existing.current_price) !== next.current_price ||
    normalizeMoney(existing.retail_price) !== next.retail_price ||
    normalizeMoney(existing.promo_price) !== next.promo_price ||
    normalizeNullableNumber(existing.unit_price) !== next.unit_price
  ) {
    return 'price_changed';
  }

  if (
    Boolean(existing.is_sale) !== next.is_sale ||
    Boolean(existing.is_promotion) !== next.is_promotion
  ) {
    return 'promo_changed';
  }

  if (Boolean(existing.is_available !== false) !== Boolean(next.is_available !== false)) {
    return 'availability_changed';
  }

  if (normalizeString(existing.canonical_product_id) !== normalizeString(next.canonical_product_id)) {
    return 'canonical_mapping_changed';
  }

  if (
    buildChangeReasons(existing, next).some((reason) => reason.startsWith('metadata.')) ||
    existingFingerprintHasOldDetailGap(existing)
  ) {
    return 'metadata_changed_only';
  }

  return 'other_changed';
}

function buildChangeReasons(existing, next) {
  const reasons = [];
  const comparisons = [
    ['price.current_price', normalizeMoney(existing.current_price), next.current_price],
    ['price.retail_price', normalizeMoney(existing.retail_price), next.retail_price],
    ['price.promo_price', normalizeMoney(existing.promo_price), next.promo_price],
    ['price.unit_price', normalizeNullableNumber(existing.unit_price), next.unit_price],
    ['promo.is_sale', Boolean(existing.is_sale), next.is_sale],
    ['promo.is_promotion', Boolean(existing.is_promotion), next.is_promotion],
    ['availability.is_available', existing.is_available !== false, next.is_available !== false],
    ['canonical.canonical_product_id', normalizeString(existing.canonical_product_id), normalizeString(next.canonical_product_id)],
  ];
  if (hasComparableExistingMetadata(existing)) {
    comparisons.push(
      ['metadata.chain_id', normalizeString(existing.chain_id), normalizeString(next.chain_id)],
      ['metadata.chain_name', normalizeString(existing.chain_name), normalizeString(next.chain_name)],
      ['metadata.retailer', normalizeString(existing.retailer), normalizeString(next.retailer)],
      ['metadata.store_id', normalizeString(existing.store_id), normalizeString(next.store_id)],
      ['metadata.store_name', normalizeString(existing.store_name), normalizeString(next.store_name)],
      ['metadata.locality_code', normalizeString(existing.locality_code), normalizeString(next.locality_code)],
      ['metadata.source_file_name', normalizeString(existing.source_file_name), normalizeString(next.source_file_name)],
      ['metadata.source_file_name_raw', normalizeString(existing.source_file_name_raw), normalizeString(next.source_file_name_raw)],
      ['metadata.source_file_stem', normalizeString(existing.source_file_stem), normalizeString(next.source_file_stem)],
      ['metadata.source_chain_name_normalized', normalizeString(existing.source_chain_name_normalized), normalizeString(next.source_chain_name_normalized)]
    );
  }

  comparisons.forEach(([name, previousValue, nextValue]) => {
    if (previousValue !== nextValue) {
      reasons.push(name);
    }
  });
  if (reasons.length > 0) {
    return reasons;
  }
  if (existingFingerprintHasOldDetailGap(existing)) {
    return ['metadata_or_other.fingerprint_changed_old_detail_unavailable'];
  }
  return ['fingerprint_changed_without_field_delta'];
}

function existingFingerprintHasOldDetailGap(existing) {
  return Boolean(existing?.fingerprint_hash) && !hasComparableExistingMetadata(existing);
}

function hasComparableExistingMetadata(existing = {}) {
  return [
    'chain_id',
    'chain_name',
    'retailer',
    'store_id',
    'store_name',
    'locality_code',
    'source_file_name',
    'source_file_name_raw',
    'source_file_stem',
    'source_chain_name_normalized',
  ].some((fieldName) => Object.prototype.hasOwnProperty.call(existing, fieldName));
}

function buildChangeCategoryReport(categories) {
  return Object.fromEntries(
    CHANGE_REPORT_CATEGORY_ORDER.map((categoryName) => {
      const rows = categories[categoryName] || [];
      return [categoryName, {
        count: rows.length,
        sample_examples: rows.slice(0, DIFF_SAMPLE_LIMIT).map(buildChangeSample),
        requires_current_product_offers_write: categoryRequiresCurrentOfferWrite(categoryName),
        requires_current_offer_fingerprints_write: categoryRequiresFingerprintWrite(categoryName),
        requires_offer_change_events_write: categoryRequiresDefaultEventWrite(categoryName),
        affects_canonical_current_offer_summary: categoryAffectsCanonicalSummary(categoryName),
      }];
    })
  );
}

const CHANGE_REPORT_CATEGORY_ORDER = [
  'new_offers',
  'price_changed',
  'promo_changed',
  'availability_changed',
  'metadata_changed_only',
  'canonical_mapping_changed',
  'other_changed',
  'missing_removed',
];

function buildChangeSample(row) {
  return {
    source_product_id: row.source_product_id || null,
    offer_id: row.offer_id || null,
    canonical_product_id: row.canonical_product_id || null,
    previous_canonical_product_id: row.previous_canonical_product_id || null,
    current_price: row.current_price ?? null,
    retail_price: row.retail_price ?? null,
    promo_price: row.promo_price ?? null,
    is_sale: row.is_sale === true,
    is_promotion: row.is_promotion === true,
    snapshot_date: row.snapshot_date || null,
    previous_snapshot_date: row.previous_snapshot_date || null,
    change_reasons: row.change_reasons || [],
  };
}

function buildIncrementalWritePolicy({
  counts,
  summariesToUpdate,
  eventPolicy,
}) {
  const changedOfferCount = countChangedOfferWrites(counts);
  const baseWrites = {
    current_product_offers: changedOfferCount,
    current_offer_fingerprints: changedOfferCount,
    canonical_current_offer_summary: summariesToUpdate,
    snapshot_manifests: 1,
    deletes: 0,
  };
  const variants = {
    full_audit_policy: buildEstimatedWritesForEventCount({
      ...baseWrites,
      offerChangeEvents: countEventWritesForPolicy(counts, 'all_changes'),
    }),
    price_event_policy: buildEstimatedWritesForEventCount({
      ...baseWrites,
      offerChangeEvents: countEventWritesForPolicy(counts, 'price_promo_availability'),
    }),
    current_state_only_policy: buildEstimatedWritesForEventCount({
      ...baseWrites,
      offerChangeEvents: 0,
    }),
  };
  const selectedVariantName = eventPolicy === 'all_changes'
    ? 'full_audit_policy'
    : eventPolicy === 'none'
      ? 'current_state_only_policy'
      : 'price_event_policy';
  return {
    selected: {
      ...variants[selectedVariantName],
      selected_event_policy: eventPolicy,
      selected_policy_variant: selectedVariantName,
      metadata_only_events_suppressed: eventPolicy !== 'all_changes',
    },
    variants,
  };
}

function buildEstimatedWritesForEventCount({
  current_product_offers: currentProductOffers,
  current_offer_fingerprints: currentOfferFingerprints,
  canonical_current_offer_summary: canonicalCurrentOfferSummary,
  snapshot_manifests: snapshotManifests,
  deletes,
  offerChangeEvents,
}) {
  return {
    current_product_offers: currentProductOffers,
    current_offer_fingerprints: currentOfferFingerprints,
    canonical_current_offer_summary: canonicalCurrentOfferSummary,
    offer_change_events: offerChangeEvents,
    snapshot_manifests: snapshotManifests,
    deletes,
    total_without_removed_mark_unavailable: currentProductOffers +
      currentOfferFingerprints +
      canonicalCurrentOfferSummary +
      offerChangeEvents +
      snapshotManifests +
      deletes,
  };
}

function countChangedOfferWrites(counts = {}) {
  return (counts.new_offers || counts.new || 0) +
    (counts.price_changed || 0) +
    (counts.promo_changed || 0) +
    (counts.availability_changed || 0) +
    (counts.metadata_changed_only || counts.metadata_changed || 0) +
    (counts.canonical_mapping_changed || 0) +
    (counts.other_changed || 0);
}

function countEventWritesForPolicy(counts, eventPolicy) {
  return eventCategoriesForPolicy(eventPolicy)
    .reduce((total, categoryName) => total + (counts?.[categoryName] || 0), 0);
}

function eventCategoriesForPolicy(eventPolicy) {
  if (eventPolicy === 'none') {
    return [];
  }
  if (eventPolicy === 'all_changes') {
    return [
      'new_offers',
      'price_changed',
      'promo_changed',
      'availability_changed',
      'metadata_changed_only',
      'canonical_mapping_changed',
      'other_changed',
    ];
  }
  return [
    'new_offers',
    'price_changed',
    'promo_changed',
    'availability_changed',
  ];
}

function eventTypeForChangeCategory(categoryName) {
  return categoryName === 'new_offers' ? 'new_offer' : categoryName;
}

function categoryRequiresCurrentOfferWrite(categoryName) {
  return categoryName !== 'missing_removed';
}

function categoryRequiresFingerprintWrite(categoryName) {
  return categoryName !== 'missing_removed';
}

function categoryRequiresDefaultEventWrite(categoryName) {
  return eventCategoriesForPolicy(DEFAULT_INCREMENTAL_EVENT_POLICY).includes(categoryName);
}

function categoryAffectsCanonicalSummary(categoryName) {
  return categoryName !== 'unchanged';
}

function normalizeIncrementalEventPolicy(value) {
  const normalized = normalizeString(value) || DEFAULT_INCREMENTAL_EVENT_POLICY;
  if (!INCREMENTAL_EVENT_POLICIES.has(normalized)) {
    throw new Error(`PRICER_INCREMENTAL_EVENT_POLICY must be one of: ${[...INCREMENTAL_EVENT_POLICIES].join(', ')}.`);
  }
  return normalized;
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function addAffectedCanonicalProductIds(target, ...rows) {
  rows.forEach((row) => {
    if (row?.canonical_product_id) {
      target.add(row.canonical_product_id);
    }
  });
}

function buildSnapshotManifestId({ snapshotDate, mode, collectionPrefix }) {
  return hashStableValue({
    collection_prefix: collectionPrefix || '',
    mode,
    snapshot_date: snapshotDate,
  }).slice(0, 32);
}

function buildOfferChangeEventId({
  sourceProductId,
  snapshotDate,
  eventType,
  fingerprintHash,
}) {
  return hashStableValue({
    event_type: eventType,
    fingerprint_hash: fingerprintHash,
    snapshot_date: snapshotDate || '',
    source_product_id: sourceProductId,
  });
}

function hashStableValue(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeMoney(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 10000) / 10000 : null;
}

function normalizeNullableNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 10000) / 10000 : null;
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

module.exports = {
  DEFAULT_INCREMENTAL_EVENT_POLICY,
  DEFAULT_INCREMENTAL_HIGH_WRITE_THRESHOLD,
  INCREMENTAL_EVENT_POLICIES,
  INCREMENTAL_INGEST_RULES_VERSION,
  buildCurrentOfferFingerprint,
  buildCurrentOfferFingerprints,
  buildCompactCurrentOfferBaselineRecord,
  buildCompactCurrentOfferBaselineRecords,
  buildRichCurrentOfferBaselineRecord,
  buildRichCurrentOfferBaselineRecords,
  buildOfferChangeEvents,
  buildIncrementalWriterPlan,
  buildSnapshotManifest,
  changedRowsForWriter,
  diffCurrentOffers,
  hashStableValue,
  normalizeIncrementalEventPolicy,
};
