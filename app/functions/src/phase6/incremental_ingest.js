const crypto = require('node:crypto');

const INCREMENTAL_INGEST_RULES_VERSION = 'phase6_incremental_ingest_v1';

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

function diffCurrentOffers({
  nextOffers = [],
  existingFingerprints = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const nextFingerprints = buildCurrentOfferFingerprints(nextOffers, { generatedAt });
  const nextBySourceId = new Map(nextFingerprints.map((row) => [row.source_product_id, row]));
  const existingBySourceId = new Map((existingFingerprints || []).map((row) => [row.source_product_id, normalizeExistingFingerprint(row)]));
  const categories = {
    unchanged: [],
    new: [],
    price_changed: [],
    promo_changed: [],
    metadata_changed: [],
    missing_removed: [],
  };
  const affectedCanonicalProductIds = new Set();

  for (const next of nextFingerprints) {
    const existing = existingBySourceId.get(next.source_product_id);
    if (!existing) {
      categories.new.push(next);
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
  const changedOfferCount = counts.new + counts.price_changed + counts.promo_changed + counts.metadata_changed;
  const affectedCanonicalIds = [...affectedCanonicalProductIds].sort();

  return {
    rules_version: INCREMENTAL_INGEST_RULES_VERSION,
    counts,
    scanned_next_offers: nextFingerprints.length,
    scanned_existing_fingerprints: existingFingerprints.length,
    affected_canonical_product_ids: affectedCanonicalIds,
    summaries_to_update: affectedCanonicalIds.length,
    estimated_writes: {
      current_product_offers: changedOfferCount,
      current_offer_fingerprints: changedOfferCount,
      canonical_current_offer_summary: affectedCanonicalIds.length,
      offer_change_events: changedOfferCount,
      snapshot_manifests: 1,
      deletes: 0,
      total_without_removed_mark_unavailable: changedOfferCount * 3 + affectedCanonicalIds.length + 1,
    },
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
    new_offers: counts.new || 0,
    changed_offers: (counts.price_changed || 0) + (counts.promo_changed || 0) + (counts.metadata_changed || 0),
    unchanged_offers: counts.unchanged || 0,
    removed_missing_offers: counts.missing_removed || 0,
    affected_canonical_product_ids: diff?.affected_canonical_product_ids || [],
    summaries_to_update: diff?.summaries_to_update || 0,
    estimated_writes: diff?.estimated_writes || {},
    destructive_deletes: false,
    created_at: generatedAt,
    updated_at: generatedAt,
    rules_version: INCREMENTAL_INGEST_RULES_VERSION,
  };
}

function buildOfferChangeEvents({
  diff,
  snapshotDate,
  generatedAt = new Date().toISOString(),
} = {}) {
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

  pushRows('new_offer', diff?.categories?.new);
  pushRows('price_changed', diff?.categories?.price_changed);
  pushRows('promo_changed', diff?.categories?.promo_changed);
  pushRows('metadata_changed', diff?.categories?.metadata_changed);
  pushRows('missing_removed', diff?.categories?.missing_removed);
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

  return 'metadata_changed';
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
  INCREMENTAL_INGEST_RULES_VERSION,
  buildCurrentOfferFingerprint,
  buildCurrentOfferFingerprints,
  buildCompactCurrentOfferBaselineRecord,
  buildCompactCurrentOfferBaselineRecords,
  buildOfferChangeEvents,
  buildSnapshotManifest,
  diffCurrentOffers,
  hashStableValue,
};
