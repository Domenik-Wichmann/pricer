const crypto = require('node:crypto');
const { haversineDistanceKm } = require('./location_availability');

const LOCATION_REVIEW_RULES_VERSION = 'location-review-v1';
const LOCATION_REVIEW_STATUSES = Object.freeze([
  'pending',
  'approved',
  'rejected',
  'needs_more_info',
]);
const REVIEWED_LOCATION_COORDINATE_RULES_VERSION = 'reviewed-location-coordinate-v1';
const REVIEWED_COORDINATE_ROLLOUT_DIAGNOSTICS_RULES_VERSION = 'reviewed-coordinate-rollout-diagnostics-v1';
const REVIEWED_COORDINATE_PRECEDENCE_POLICY = Object.freeze([
  'active_reviewed_coordinate',
  'matched_provider_coordinate',
  'unavailable',
]);
const LOW_CONFIDENCE_THRESHOLD = 0.75;
const HIGH_REUSE_THRESHOLD = 10;
const REVIEWED_COORDINATE_DEFAULT_SWITCH_CRITERIA = Object.freeze({
  high_reuse_reviewed_coverage_threshold: 0.8,
  max_provider_reviewed_distance_delta_km: 0.5,
  sample_review_requirement: 'operator review of changed high-reuse coordinates before default switch',
  rollback_mode: 'provider_only',
});
const ADMIN_IDENTITY_HEADERS = Object.freeze([
  'x-pricer-admin-id',
  'x-pricer-operator-id',
]);

async function buildLocationReviewCandidates({
  store,
  builtAt = new Date().toISOString(),
  limit = 200,
} = {}) {
  requireStore(store);
  const state = await store.load();
  const result = buildLocationReviewCandidatesInState({
    state,
    builtAt,
    limit,
  });
  await store.save(state);
  return result;
}

function buildLocationReviewCandidatesInState({
  state,
  builtAt = new Date().toISOString(),
  limit = 200,
} = {}) {
  if (!state) {
    throw new Error('state is required');
  }

  state.location_review_candidates = Array.isArray(state.location_review_candidates)
    ? state.location_review_candidates
    : [];

  const existingById = new Map(
    state.location_review_candidates.map((candidate) => [candidate.candidate_id, candidate]),
  );
  const proposed = [
    ...buildRetailerGeocodeCandidates(state, builtAt),
    ...buildMissingRetailerLocationCandidates(state, builtAt),
    ...buildManualGeocodeCandidates(state, builtAt),
    ...buildSavedLocationCandidates(state, builtAt),
  ];

  const deduped = new Map();
  proposed.forEach((candidate) => {
    const existing = deduped.get(candidate.candidate_id);
    if (!existing || compareLocationReviewCandidates(candidate, existing) < 0) {
      deduped.set(candidate.candidate_id, candidate);
    }
  });

  const records = [...deduped.values()]
    .map((candidate) => mergeExistingReview(candidate, existingById.get(candidate.candidate_id), builtAt))
    .sort(compareLocationReviewCandidates)
    .slice(0, normalizeLimit(limit));

  const activeIds = new Set(records.map((record) => record.candidate_id));
  const reviewedArchive = state.location_review_candidates
    .filter((candidate) => !activeIds.has(candidate.candidate_id))
    .filter((candidate) => candidate.review_status && candidate.review_status !== 'pending')
    .map((candidate) => ({
      ...candidate,
      updated_at: candidate.updated_at || builtAt,
    }));

  state.location_review_candidates = [...records, ...reviewedArchive]
    .sort(compareLocationReviewCandidates);

  return {
    candidates: state.location_review_candidates.map(clone),
    metrics: {
      proposed: proposed.length,
      active: records.length,
      archived_reviewed: reviewedArchive.length,
    },
  };
}

async function reviewLocationCandidate({
  store,
  candidateId,
  decision,
  reviewedBy,
  reviewerNote = null,
  approvedLatitude = null,
  approvedLongitude = null,
  correctionReason = null,
  reviewedAt = new Date().toISOString(),
} = {}) {
  requireStore(store);
  const state = await store.load();
  const result = reviewLocationCandidateInState({
    state,
    candidateId,
    decision,
    reviewedBy,
    reviewerNote,
    approvedLatitude,
    approvedLongitude,
    correctionReason,
    reviewedAt,
  });
  if (result.status === 200) {
    await store.save(state);
  }
  return result;
}

async function publishReviewedLocationCoordinates({
  store,
  publishedAt = new Date().toISOString(),
  limit = 500,
} = {}) {
  requireStore(store);
  const state = await store.load();
  const result = publishReviewedLocationCoordinatesInState({
    state,
    publishedAt,
    limit,
  });
  await store.save(state);
  return result;
}

function publishReviewedLocationCoordinatesInState({
  state,
  publishedAt = new Date().toISOString(),
  limit = 500,
} = {}) {
  if (!state) {
    throw new Error('state is required');
  }

  state.reviewed_location_coordinates = Array.isArray(state.reviewed_location_coordinates)
    ? state.reviewed_location_coordinates
    : [];

  const normalizedPublishedAt = normalizeTimestamp(publishedAt);
  const existingById = new Map(
    state.reviewed_location_coordinates
      .map((coordinate) => [coordinate.reviewed_coordinate_id, coordinate]),
  );
  const approvedCandidates = (state.location_review_candidates || [])
    .filter(isPublishableApprovedCandidate)
    .sort(compareApprovedCandidates)
    .slice(0, normalizeLimit(limit));

  const nextById = new Map(existingById);
  const metrics = {
    approved_candidates: approvedCandidates.length,
    published: 0,
    reused: 0,
    skipped: 0,
    superseded: 0,
  };

  approvedCandidates.forEach((candidate) => {
    const reviewedCoordinateId = buildReviewedLocationCoordinateId(candidate);
    const sourceIdentity = buildReviewedCoordinateSourceIdentity(candidate);
    if (!reviewedCoordinateId || !sourceIdentity) {
      metrics.skipped += 1;
      return;
    }

    const existing = nextById.get(reviewedCoordinateId);
    if (existing) {
      metrics.reused += 1;
      nextById.set(reviewedCoordinateId, {
        ...existing,
        is_active: existing.is_active !== false,
        updated_at: existing.updated_at || normalizedPublishedAt,
      });
      return;
    }

    const activeForSource = [...nextById.values()]
      .filter((coordinate) => coordinate.source_identity === sourceIdentity)
      .filter((coordinate) => coordinate.is_active !== false)
      .sort(compareReviewedCoordinates)
      .at(-1) || null;

    if (activeForSource) {
      nextById.set(activeForSource.reviewed_coordinate_id, {
        ...activeForSource,
        is_active: false,
        updated_at: normalizedPublishedAt,
      });
      metrics.superseded += 1;
    }

    const record = buildReviewedLocationCoordinateRecord({
      candidate,
      reviewedCoordinateId,
      sourceIdentity,
      supersedesId: activeForSource?.reviewed_coordinate_id || null,
      publishedAt: normalizedPublishedAt,
    });
    nextById.set(record.reviewed_coordinate_id, record);
    metrics.published += 1;
  });

  const groupedBySource = new Map();
  [...nextById.values()].forEach((coordinate) => {
    const key = coordinate.source_identity || buildReviewedCoordinateSourceIdentity(coordinate);
    if (!key) return;
    const group = groupedBySource.get(key) || [];
    group.push(coordinate);
    groupedBySource.set(key, group);
  });

  groupedBySource.forEach((group) => {
    const active = group
      .sort(compareReviewedCoordinates)
      .at(-1);
    group.forEach((coordinate) => {
      if (coordinate.reviewed_coordinate_id !== active.reviewed_coordinate_id && coordinate.is_active !== false) {
        nextById.set(coordinate.reviewed_coordinate_id, {
          ...coordinate,
          is_active: false,
          updated_at: normalizedPublishedAt,
        });
        metrics.superseded += 1;
      }
    });
    if (active && active.is_active === false) {
      nextById.set(active.reviewed_coordinate_id, {
        ...active,
        is_active: true,
        updated_at: active.updated_at || normalizedPublishedAt,
      });
    }
  });

  state.reviewed_location_coordinates = [...nextById.values()]
    .sort(compareReviewedCoordinates);

  return {
    coordinates: state.reviewed_location_coordinates.map(clone),
    metrics,
  };
}

function reviewLocationCandidateInState({
  state,
  candidateId,
  decision,
  reviewedBy,
  reviewerNote = null,
  approvedLatitude = null,
  approvedLongitude = null,
  correctionReason = null,
  reviewedAt = new Date().toISOString(),
} = {}) {
  if (!state) {
    throw new Error('state is required');
  }
  state.location_review_candidates = Array.isArray(state.location_review_candidates)
    ? state.location_review_candidates
    : [];

  const normalizedCandidateId = normalizeString(candidateId);
  if (!normalizedCandidateId) {
    return badRequest('candidate_id is required');
  }

  const reviewStatus = normalizeReviewStatus(decision);
  if (reviewStatus.error) {
    return reviewStatus.error;
  }

  const reviewer = normalizeString(reviewedBy);
  if (!reviewer) {
    return badRequest('reviewed_by is required');
  }

  const index = state.location_review_candidates
    .findIndex((candidate) => candidate.candidate_id === normalizedCandidateId);
  if (index < 0) {
    return {
      status: 404,
      body: {
        error: 'location review candidate not found',
      },
    };
  }

  const existing = state.location_review_candidates[index];
  const approvedCoordinates = normalizeApprovedCoordinates({
    reviewStatus: reviewStatus.value,
    approvedLatitude,
    approvedLongitude,
  });
  if (approvedCoordinates.error) {
    return approvedCoordinates.error;
  }

  const updated = {
    ...existing,
    review_status: reviewStatus.value,
    reviewed_by: reviewer,
    reviewed_at: normalizeTimestamp(reviewedAt),
    reviewer_note: normalizeOptionalString(reviewerNote),
    approved_latitude: approvedCoordinates.latitude,
    approved_longitude: approvedCoordinates.longitude,
    correction_reason: normalizeOptionalString(correctionReason),
    updated_at: normalizeTimestamp(reviewedAt),
  };

  state.location_review_candidates[index] = updated;
  state.location_review_candidates = state.location_review_candidates
    .sort(compareLocationReviewCandidates);

  return {
    status: 200,
    body: {
      candidate: clone(updated),
    },
  };
}

function isPublishableApprovedCandidate(candidate) {
  return candidate &&
    candidate.review_status === 'approved' &&
    toFiniteNumber(candidate.approved_latitude) !== null &&
    toFiniteNumber(candidate.approved_longitude) !== null;
}

function buildReviewedLocationCoordinateRecord({
  candidate,
  reviewedCoordinateId,
  sourceIdentity,
  supersedesId,
  publishedAt,
}) {
  return {
    reviewed_coordinate_id: reviewedCoordinateId,
    source_candidate_id: candidate.candidate_id,
    source_type: candidate.source_type,
    source_id: candidate.source_id,
    location_id: candidate.related_location_id || candidate.evidence?.retailer_location?.location_id || null,
    source_identity: sourceIdentity,
    latitude: toFiniteNumber(candidate.approved_latitude),
    longitude: toFiniteNumber(candidate.approved_longitude),
    confidence: normalizeConfidence(candidate.confidence),
    correction_reason: normalizeOptionalString(candidate.correction_reason),
    approved_by: normalizeOptionalString(candidate.reviewed_by),
    approved_at: normalizeTimestamp(candidate.reviewed_at),
    supersedes_id: supersedesId || null,
    is_active: true,
    provenance: {
      source: 'location_review_candidates',
      candidate_id: candidate.candidate_id,
      source_type: candidate.source_type,
      source_id: candidate.source_id,
      related_location_id: candidate.related_location_id || null,
      review_status: candidate.review_status,
      source_status: candidate.source_status || null,
      risk_score: candidate.risk_score || 0,
      risk_factors: Array.isArray(candidate.risk_factors) ? [...candidate.risk_factors] : [],
      query_text: candidate.query_text || null,
      raw_address: candidate.raw_address || null,
      city: candidate.city || null,
      country: candidate.country || null,
      provider: candidate.provider || null,
      provider_place_id: candidate.provider_place_id || null,
    },
    rules_version: REVIEWED_LOCATION_COORDINATE_RULES_VERSION,
    published_at: publishedAt,
    updated_at: publishedAt,
  };
}

function buildReviewedLocationCoordinateId(candidate) {
  if (!candidate) return '';
  return `reviewedloc_${crypto
    .createHash('sha256')
    .update([
      'reviewed_location_coordinate_v1',
      normalizeString(candidate.candidate_id),
      normalizeString(candidate.reviewed_at),
      String(toFiniteNumber(candidate.approved_latitude)),
      String(toFiniteNumber(candidate.approved_longitude)),
      normalizeString(candidate.correction_reason),
    ].join('|'))
    .digest('hex')
    .slice(0, 32)}`;
}

function buildReviewedCoordinateSourceIdentity(value) {
  const sourceType = normalizeString(value?.source_type);
  const sourceId = normalizeString(value?.source_id);
  if (sourceType && sourceId) {
    return `${sourceType}|${sourceId}`;
  }
  const locationId = normalizeString(value?.location_id || value?.related_location_id);
  return locationId ? `location|${locationId}` : '';
}

function compareApprovedCandidates(left, right) {
  const timeDelta = normalizeTimestamp(left.reviewed_at)
    .localeCompare(normalizeTimestamp(right.reviewed_at));
  if (timeDelta !== 0) return timeDelta;
  return String(left.candidate_id).localeCompare(String(right.candidate_id));
}

function compareReviewedCoordinates(left, right) {
  const sourceDelta = String(left.source_identity || '')
    .localeCompare(String(right.source_identity || ''));
  if (sourceDelta !== 0) return sourceDelta;
  const timeDelta = normalizeTimestamp(left.approved_at)
    .localeCompare(normalizeTimestamp(right.approved_at));
  if (timeDelta !== 0) return timeDelta;
  return String(left.reviewed_coordinate_id).localeCompare(String(right.reviewed_coordinate_id));
}

async function handleListLocationReviewCandidatesRequest({
  store,
  body = {},
  req,
} = {}) {
  const admin = requireAdminIdentity(req);
  if (!admin.allowed) {
    return admin;
  }

  const built = await buildLocationReviewCandidates({
    store,
    limit: body.limit,
  });
  const reviewStatus = normalizeOptionalReviewStatus(body.review_status || body.status || 'pending');
  if (reviewStatus.error) {
    return reviewStatus.error;
  }
  const sourceType = normalizeOptionalString(body.source_type);
  const candidates = built.candidates
    .filter((candidate) => !reviewStatus.value || candidate.review_status === reviewStatus.value)
    .filter((candidate) => !sourceType || candidate.source_type === sourceType);

  return {
    status: 200,
    body: {
      candidates,
      total: candidates.length,
      generated_total: built.candidates.length,
      metrics: built.metrics,
      operator: admin.identity,
    },
  };
}

async function handleGetLocationReviewCandidateRequest({
  store,
  params = {},
  req,
} = {}) {
  const admin = requireAdminIdentity(req);
  if (!admin.allowed) {
    return admin;
  }

  const candidateId = normalizeString(params.id || params.candidate_id);
  if (!candidateId) {
    return badRequest('candidate_id is required');
  }

  const built = await buildLocationReviewCandidates({ store });
  const candidate = built.candidates
    .find((entry) => entry.candidate_id === candidateId);
  if (!candidate) {
    return {
      status: 404,
      body: {
        error: 'location review candidate not found',
      },
    };
  }

  return {
    status: 200,
    body: {
      candidate,
      operator: admin.identity,
    },
  };
}

async function handleReviewLocationCandidateRequest({
  store,
  params = {},
  body = {},
  req,
  decision,
} = {}) {
  const admin = requireAdminIdentity(req);
  if (!admin.allowed) {
    return admin;
  }

  const candidateId = normalizeString(params.id || params.candidate_id || body.candidate_id);
  if (!candidateId) {
    return badRequest('candidate_id is required');
  }

  await buildLocationReviewCandidates({ store });
  const reviewDecision = normalizeString(decision || body.review_status || body.decision);
  return reviewLocationCandidate({
    store,
    candidateId,
    decision: reviewDecision,
    reviewedBy: admin.identity,
    reviewerNote: body.reviewer_note || body.note || null,
    approvedLatitude: body.approved_latitude ?? body.latitude ?? null,
    approvedLongitude: body.approved_longitude ?? body.longitude ?? null,
    correctionReason: body.correction_reason || body.reason || null,
  });
}

async function handleListReviewedLocationCoordinatesRequest({
  store,
  body = {},
  req,
} = {}) {
  const admin = requireAdminIdentity(req);
  if (!admin.allowed) {
    return admin;
  }
  requireStore(store);
  const state = await store.load();
  const status = normalizeReviewedCoordinateStatus(body.status || body.review_status || 'active');
  if (status.error) {
    return status.error;
  }
  const sourceType = normalizeOptionalString(body.source_type);
  const coordinates = listReviewedLocationCoordinates({
    state,
    status: status.value,
    sourceType,
    limit: body.limit,
  });

  return {
    status: 200,
    body: {
      coordinates,
      total: coordinates.length,
      status: status.value,
      operator: admin.identity,
    },
  };
}

async function handleGetReviewedLocationCoordinateRequest({
  store,
  params = {},
  req,
} = {}) {
  const admin = requireAdminIdentity(req);
  if (!admin.allowed) {
    return admin;
  }
  requireStore(store);
  const reviewedCoordinateId = normalizeString(params.id || params.reviewed_coordinate_id);
  if (!reviewedCoordinateId) {
    return badRequest('reviewed_coordinate_id is required');
  }
  const state = await store.load();
  const coordinate = (state.reviewed_location_coordinates || [])
    .find((record) => record.reviewed_coordinate_id === reviewedCoordinateId);
  if (!coordinate) {
    return {
      status: 404,
      body: {
        error: 'reviewed location coordinate not found',
      },
    };
  }

  return {
    status: 200,
    body: {
      coordinate: clone(coordinate),
      operator: admin.identity,
    },
  };
}

async function handleReviewedCoordinateDiagnosticsRequest({
  store,
  body = {},
  req,
} = {}) {
  const admin = requireAdminIdentity(req);
  if (!admin.allowed) {
    return admin;
  }
  requireStore(store);
  const state = await store.load();
  const result = buildReviewedCoordinateDiagnostics({
    state,
    sourceType: body.source_type,
    sourceIdentity: body.source_identity,
    limit: body.limit,
  });

  return {
    status: 200,
    body: {
      ...result,
      operator: admin.identity,
    },
  };
}

async function handleReviewedCoordinateRolloutDiagnosticsRequest({
  store,
  body = {},
  req,
} = {}) {
  const admin = requireAdminIdentity(req);
  if (!admin.allowed) {
    return admin;
  }
  requireStore(store);
  const state = await store.load();
  const result = buildReviewedCoordinateRolloutDiagnostics({
    state,
    highReuseThreshold: body.high_reuse_threshold,
    limit: body.limit,
  });

  return {
    status: 200,
    body: {
      ...result,
      operator: admin.identity,
    },
  };
}

function listReviewedLocationCoordinates({
  state,
  status = 'active',
  sourceType = null,
  limit = 500,
} = {}) {
  const reviewedStatus = normalizeReviewedCoordinateStatus(status);
  if (reviewedStatus.error) {
    throw new Error(reviewedStatus.error.body.error);
  }
  const normalizedSourceType = normalizeOptionalString(sourceType);
  return (state?.reviewed_location_coordinates || [])
    .filter((coordinate) => {
      if (reviewedStatus.value === 'active') return coordinate.is_active === true;
      if (reviewedStatus.value === 'superseded') return coordinate.is_active === false;
      return true;
    })
    .filter((coordinate) => !normalizedSourceType || coordinate.source_type === normalizedSourceType)
    .sort(compareReviewedCoordinates)
    .slice(0, normalizeLimit(limit))
    .map(clone);
}

function buildReviewedCoordinateRolloutDiagnostics({
  state,
  highReuseThreshold = HIGH_REUSE_THRESHOLD,
  limit = 100,
} = {}) {
  const normalizedHighReuseThreshold = Math.max(1, toInt(highReuseThreshold) || HIGH_REUSE_THRESHOLD);
  const locationsById = new Map((state?.retailer_locations || [])
    .map((location) => [location.location_id, location]));
  const providerByLocationId = buildMatchedProviderCoordinateIndexByLocationId(state?.retailer_location_geocodes || []);
  const reviewedByLocationId = buildActiveReviewedCoordinateIndexByLocationId(state?.reviewed_location_coordinates || []);
  const allLocationIds = new Set([
    ...providerByLocationId.keys(),
    ...reviewedByLocationId.keys(),
  ]);
  const changedCoordinates = [...allLocationIds]
    .map((locationId) => buildRolloutCoordinateComparison({
      locationId,
      location: locationsById.get(locationId) || null,
      providerCoordinate: providerByLocationId.get(locationId) || null,
      reviewedCoordinate: reviewedByLocationId.get(locationId) || null,
    }))
    .filter(Boolean)
    .filter((comparison) => comparison.changed === true)
    .sort(compareRolloutCoordinateComparisons);

  const highReuseLocations = (state?.retailer_locations || [])
    .filter((location) => getLocationReuseCount(location) >= normalizedHighReuseThreshold);
  const highReuseCovered = highReuseLocations
    .filter((location) => reviewedByLocationId.has(location.location_id));
  const confidenceDistribution = buildReviewedConfidenceDistribution([...reviewedByLocationId.values()]);
  const distanceSummary = summarizeDistanceDeltas(changedCoordinates);

  return {
    rules_version: REVIEWED_COORDINATE_ROLLOUT_DIAGNOSTICS_RULES_VERSION,
    default_coordinate_mode: 'provider_only',
    compared_coordinate_modes: ['provider_only', 'reviewed_first'],
    switch_criteria: { ...REVIEWED_COORDINATE_DEFAULT_SWITCH_CRITERIA },
    metrics: {
      provider_only_result_count: providerByLocationId.size,
      reviewed_first_result_count: allLocationIds.size,
      changed_coordinate_count: changedCoordinates.length,
      high_reuse_store_count: highReuseLocations.length,
      high_reuse_reviewed_covered_count: highReuseCovered.length,
      high_reuse_reviewed_coverage_rate: ratio(highReuseCovered.length, highReuseLocations.length),
      reviewed_coordinate_confidence_distribution: confidenceDistribution,
      distance_delta_km: distanceSummary,
    },
    changed_coordinates: changedCoordinates
      .slice(0, normalizeLimit(limit))
      .map(clone),
  };
}

function buildMatchedProviderCoordinateIndexByLocationId(geocodes) {
  const index = new Map();
  (geocodes || [])
    .filter((geocode) => geocode?.status === 'matched')
    .filter(hasCoordinates)
    .forEach((geocode) => {
      const locationId = normalizeString(geocode.location_id || geocode.provenance?.location_id);
      if (!locationId) return;
      const existing = index.get(locationId);
      if (!existing || String(geocode.updated_at || '') > String(existing.updated_at || '')) {
        index.set(locationId, {
          coordinate_source: 'provider',
          geocode_id: geocode.geocode_id,
          location_id: locationId,
          latitude: toFiniteNumber(geocode.latitude),
          longitude: toFiniteNumber(geocode.longitude),
          confidence: normalizeConfidence(geocode.confidence),
          provider: normalizeOptionalString(geocode.provider),
          provider_place_id: normalizeOptionalString(geocode.provider_place_id),
          formatted_address: normalizeOptionalString(geocode.formatted_address),
          status: geocode.status,
          updated_at: geocode.updated_at || null,
        });
      }
    });
  return index;
}

function buildActiveReviewedCoordinateIndexByLocationId(coordinates) {
  const index = new Map();
  (coordinates || [])
    .filter((coordinate) => coordinate?.is_active === true)
    .filter(hasCoordinates)
    .sort(compareReviewedCoordinates)
    .forEach((coordinate) => {
      const locationId = normalizeString(coordinate.location_id);
      if (!locationId) return;
      index.set(locationId, {
        coordinate_source: 'reviewed',
        reviewed_coordinate_id: coordinate.reviewed_coordinate_id,
        source_candidate_id: coordinate.source_candidate_id || null,
        source_type: coordinate.source_type || null,
        source_id: coordinate.source_id || null,
        location_id: locationId,
        latitude: toFiniteNumber(coordinate.latitude),
        longitude: toFiniteNumber(coordinate.longitude),
        confidence: normalizeConfidence(coordinate.confidence),
        correction_reason: normalizeOptionalString(coordinate.correction_reason),
        approved_by: normalizeOptionalString(coordinate.approved_by),
        approved_at: coordinate.approved_at || null,
      });
    });
  return index;
}

function buildRolloutCoordinateComparison({
  locationId,
  location,
  providerCoordinate,
  reviewedCoordinate,
}) {
  if (!providerCoordinate || !reviewedCoordinate) {
    return null;
  }
  const delta = haversineDistanceKm(providerCoordinate, reviewedCoordinate);
  const changed = delta !== null && delta > 0;
  return {
    location_id: locationId,
    store_name_raw: location?.store_name_raw || null,
    chain_id: location?.chain_id || null,
    chain_name: location?.chain_name_raw || location?.chain_name_normalized || null,
    reuse_count: getLocationReuseCount(location),
    provider_coordinate: providerCoordinate,
    reviewed_coordinate: reviewedCoordinate,
    distance_delta_km: delta,
    changed,
  };
}

function compareRolloutCoordinateComparisons(left, right) {
  return (Number(right.distance_delta_km) - Number(left.distance_delta_km)) ||
    (Number(right.reuse_count) - Number(left.reuse_count)) ||
    String(left.location_id).localeCompare(String(right.location_id));
}

function summarizeDistanceDeltas(changedCoordinates) {
  const values = changedCoordinates
    .map((comparison) => Number(comparison.distance_delta_km))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (values.length === 0) {
    return {
      count: 0,
      average: 0,
      max: 0,
      p95: 0,
    };
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  const p95Index = Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1);
  return {
    count: values.length,
    average: roundMetric(total / values.length),
    max: roundMetric(values.at(-1)),
    p95: roundMetric(values[p95Index]),
  };
}

function buildReviewedConfidenceDistribution(coordinates) {
  const distribution = {
    high: 0,
    medium: 0,
    low: 0,
    very_low: 0,
    unknown: 0,
  };
  coordinates.forEach((coordinate) => {
    const confidence = normalizeConfidence(coordinate.confidence);
    if (confidence === null) {
      distribution.unknown += 1;
    } else if (confidence >= 0.9) {
      distribution.high += 1;
    } else if (confidence >= LOW_CONFIDENCE_THRESHOLD) {
      distribution.medium += 1;
    } else if (confidence >= 0.5) {
      distribution.low += 1;
    } else {
      distribution.very_low += 1;
    }
  });
  return distribution;
}

function buildReviewedCoordinateDiagnostics({
  state,
  sourceType = null,
  sourceIdentity = null,
  limit = 500,
} = {}) {
  const normalizedSourceType = normalizeOptionalString(sourceType);
  const normalizedSourceIdentity = normalizeOptionalString(sourceIdentity);
  const sourceEntries = buildCoordinateSourceEntries(state);
  const activeReviewedByIdentity = buildActiveReviewedCoordinateIndex(state?.reviewed_location_coordinates || []);
  const supersededByIdentity = buildSupersededReviewedCoordinateIndex(state?.reviewed_location_coordinates || []);
  const allIdentities = new Set([
    ...sourceEntries.keys(),
    ...activeReviewedByIdentity.keys(),
    ...supersededByIdentity.keys(),
  ]);

  const diagnostics = [...allIdentities]
    .map((identity) => buildCoordinateDiagnostic({
      identity,
      sourceEntry: sourceEntries.get(identity) || null,
      activeReviewed: activeReviewedByIdentity.get(identity) || null,
      supersededReviewed: supersededByIdentity.get(identity) || [],
    }))
    .filter((entry) => !normalizedSourceType || entry.source_type === normalizedSourceType)
    .filter((entry) => !normalizedSourceIdentity || entry.source_identity === normalizedSourceIdentity)
    .sort(compareCoordinateDiagnostics)
    .slice(0, normalizeLimit(limit));

  return {
    precedence_policy: [...REVIEWED_COORDINATE_PRECEDENCE_POLICY],
    diagnostics: diagnostics.map(clone),
    total: diagnostics.length,
    metrics: {
      active_reviewed_wins: diagnostics.filter((entry) => entry.winner === 'reviewed').length,
      provider_wins: diagnostics.filter((entry) => entry.winner === 'provider').length,
      unavailable: diagnostics.filter((entry) => entry.winner === 'unavailable').length,
    },
  };
}

function buildCoordinateDiagnostic({
  identity,
  sourceEntry,
  activeReviewed,
  supersededReviewed,
}) {
  const providerCoordinate = sourceEntry?.provider_coordinate || null;
  const reviewedCoordinate = activeReviewed && hasCoordinates(activeReviewed)
    ? buildCoordinateSnapshot(activeReviewed, 'reviewed')
    : null;
  let winner = 'unavailable';
  let winningCoordinate = null;
  let reason = 'no reviewed or matched provider coordinates available';

  if (reviewedCoordinate) {
    winner = 'reviewed';
    winningCoordinate = reviewedCoordinate;
    reason = 'active reviewed coordinate wins over provider coordinate';
  } else if (providerCoordinate) {
    winner = 'provider';
    winningCoordinate = providerCoordinate;
    reason = 'matched provider coordinate wins because no active reviewed coordinate exists';
  } else if (supersededReviewed.length > 0) {
    reason = 'only superseded reviewed coordinates exist';
  }

  return {
    source_identity: identity,
    source_type: sourceEntry?.source_type || activeReviewed?.source_type || supersededReviewed[0]?.source_type || null,
    source_id: sourceEntry?.source_id || activeReviewed?.source_id || supersededReviewed[0]?.source_id || null,
    location_id: sourceEntry?.location_id || activeReviewed?.location_id || supersededReviewed[0]?.location_id || null,
    provider_coordinate: providerCoordinate,
    reviewed_coordinate: reviewedCoordinate,
    superseded_reviewed_coordinate_count: supersededReviewed.length,
    winner,
    winning_coordinate: winningCoordinate,
    reason,
  };
}

function buildCoordinateSourceEntries(state) {
  const entries = new Map();
  (state?.retailer_location_geocodes || []).forEach((geocode) => {
    const sourceType = 'retailer_location_geocode';
    const sourceId = geocode.geocode_id;
    addCoordinateSourceEntry(entries, {
      sourceType,
      sourceId,
      locationId: geocode.location_id || geocode.provenance?.location_id || null,
      providerCoordinate: buildProviderCoordinateFromGeocode(geocode, sourceType),
    });
  });

  (state?.manual_location_geocodes || []).forEach((geocode) => {
    const sourceType = 'manual_location_geocode';
    const sourceId = geocode.geocode_id;
    addCoordinateSourceEntry(entries, {
      sourceType,
      sourceId,
      locationId: null,
      providerCoordinate: buildProviderCoordinateFromGeocode(geocode, sourceType),
    });
  });

  (state?.saved_user_locations || []).forEach((location) => {
    const sourceType = 'saved_user_location';
    const sourceId = location.location_id;
    addCoordinateSourceEntry(entries, {
      sourceType,
      sourceId,
      locationId: location.location_id,
      providerCoordinate: buildProviderCoordinateFromSavedLocation(location),
    });
  });

  (state?.retailer_locations || [])
    .filter((location) => location.needs_geocoding === true)
    .forEach((location) => {
      const sourceType = 'retailer_location_missing_geocode';
      const sourceId = location.location_id;
      addCoordinateSourceEntry(entries, {
        sourceType,
        sourceId,
        locationId: location.location_id,
        providerCoordinate: hasCoordinates(location)
          ? buildCoordinateSnapshot(location, 'provider')
          : null,
      });
    });

  return entries;
}

function addCoordinateSourceEntry(entries, {
  sourceType,
  sourceId,
  locationId,
  providerCoordinate,
}) {
  const sourceIdentity = buildReviewedCoordinateSourceIdentity({
    source_type: sourceType,
    source_id: sourceId,
    location_id: locationId,
  });
  if (!sourceIdentity || entries.has(sourceIdentity)) {
    return;
  }
  entries.set(sourceIdentity, {
    source_identity: sourceIdentity,
    source_type: sourceType,
    source_id: sourceId,
    location_id: locationId || null,
    provider_coordinate: providerCoordinate,
  });
}

function buildProviderCoordinateFromGeocode(geocode, sourceType) {
  if (geocode?.status !== 'matched' || !hasCoordinates(geocode)) {
    return null;
  }
  return {
    coordinate_source: 'provider',
    source_type: sourceType,
    source_id: geocode.geocode_id,
    latitude: toFiniteNumber(geocode.latitude),
    longitude: toFiniteNumber(geocode.longitude),
    confidence: normalizeConfidence(geocode.confidence),
    provider: normalizeOptionalString(geocode.provider),
    provider_place_id: normalizeOptionalString(geocode.provider_place_id),
    formatted_address: normalizeOptionalString(geocode.formatted_address),
    status: geocode.status,
  };
}

function buildProviderCoordinateFromSavedLocation(location) {
  if (!hasCoordinates(location)) {
    return null;
  }
  return {
    coordinate_source: 'provider',
    source_type: 'saved_user_location',
    source_id: location.location_id,
    latitude: toFiniteNumber(location.latitude),
    longitude: toFiniteNumber(location.longitude),
    confidence: normalizeConfidence(location.confidence),
    provider: normalizeOptionalString(location.provider),
    provider_place_id: normalizeOptionalString(location.provider_place_id),
    formatted_address: normalizeOptionalString(location.formatted_address),
    status: location.source || null,
  };
}

function buildCoordinateSnapshot(value, coordinateSource) {
  return {
    coordinate_source: coordinateSource,
    reviewed_coordinate_id: value.reviewed_coordinate_id || null,
    source_type: value.source_type || null,
    source_id: value.source_id || value.location_id || null,
    latitude: toFiniteNumber(value.latitude),
    longitude: toFiniteNumber(value.longitude),
    confidence: normalizeConfidence(value.confidence),
    approved_by: value.approved_by || null,
    approved_at: value.approved_at || null,
    correction_reason: value.correction_reason || null,
  };
}

function buildActiveReviewedCoordinateIndex(coordinates) {
  const index = new Map();
  coordinates
    .filter((coordinate) => coordinate?.is_active === true)
    .filter(hasCoordinates)
    .sort(compareReviewedCoordinates)
    .forEach((coordinate) => {
      const identity = coordinate.source_identity || buildReviewedCoordinateSourceIdentity(coordinate);
      if (identity) {
        index.set(identity, coordinate);
      }
    });
  return index;
}

function buildSupersededReviewedCoordinateIndex(coordinates) {
  const index = new Map();
  coordinates
    .filter((coordinate) => coordinate?.is_active === false)
    .sort(compareReviewedCoordinates)
    .forEach((coordinate) => {
      const identity = coordinate.source_identity || buildReviewedCoordinateSourceIdentity(coordinate);
      if (!identity) return;
      const group = index.get(identity) || [];
      group.push(coordinate);
      index.set(identity, group);
    });
  return index;
}

function compareCoordinateDiagnostics(left, right) {
  return String(left.source_type || '').localeCompare(String(right.source_type || '')) ||
    String(left.source_id || '').localeCompare(String(right.source_id || '')) ||
    String(left.source_identity || '').localeCompare(String(right.source_identity || ''));
}

function buildRetailerGeocodeCandidates(state, builtAt) {
  const locationsById = new Map((state.retailer_locations || [])
    .map((location) => [location.location_id, location]));
  return (state.retailer_location_geocodes || [])
    .map((geocode) => {
      const location = locationsById.get(geocode.location_id || geocode.provenance?.location_id) || null;
      const reuseCount = Math.max(
        toInt(location?.source_product_count),
        toInt(location?.snapshot_count),
        countLocationSourceProducts(location),
      );
      const risk = scoreRisk({
        status: geocode.status,
        confidence: geocode.confidence,
        reuseCount,
        missingCoordinates: !hasCoordinates(geocode),
        providerAmbiguity: geocode.status === 'ambiguous',
      });
      if (!risk.shouldReview) {
        return null;
      }
      return buildBaseCandidate({
        sourceType: 'retailer_location_geocode',
        sourceId: geocode.geocode_id,
        relatedLocationId: geocode.location_id || geocode.provenance?.location_id || null,
        title: location?.store_name_raw || geocode.formatted_address || geocode.query_text || geocode.geocode_id,
        queryText: geocode.query_text,
        rawAddress: geocode.provenance?.raw_address || location?.raw_address || null,
        city: geocode.provenance?.city || location?.city || null,
        country: geocode.provenance?.country || location?.country || null,
        provider: geocode.provider,
        providerPlaceId: geocode.provider_place_id,
        formattedAddress: geocode.formatted_address,
        latitude: geocode.latitude,
        longitude: geocode.longitude,
        confidence: geocode.confidence,
        status: geocode.status,
        reuseCount,
        risk,
        evidence: {
          geocode: clone(geocode),
          retailer_location: location ? clone(location) : null,
        },
        builtAt,
      });
    })
    .filter(Boolean);
}

function buildMissingRetailerLocationCandidates(state, builtAt) {
  const geocodedLocationIds = new Set((state.retailer_location_geocodes || [])
    .filter((geocode) => hasCoordinates(geocode) || ['matched', 'ambiguous', 'failed'].includes(geocode.status))
    .map((geocode) => geocode.location_id || geocode.provenance?.location_id)
    .filter(Boolean));

  return (state.retailer_locations || [])
    .filter((location) => location.needs_geocoding === true)
    .filter((location) => !hasCoordinates(location))
    .filter((location) => !geocodedLocationIds.has(location.location_id))
    .filter((location) => hasAddressLikeText(location.raw_address || location.store_name_raw || location.branch_name))
    .map((location) => {
      const reuseCount = Math.max(
        toInt(location.source_product_count),
        toInt(location.snapshot_count),
        countLocationSourceProducts(location),
      );
      const risk = scoreRisk({
        status: 'missing_geocode',
        confidence: location.confidence,
        reuseCount,
        missingCoordinates: true,
        providerAmbiguity: false,
      });
      return buildBaseCandidate({
        sourceType: 'retailer_location_missing_geocode',
        sourceId: location.location_id,
        relatedLocationId: location.location_id,
        title: location.store_name_raw || location.branch_name || location.location_id,
        queryText: null,
        rawAddress: location.raw_address,
        city: location.city,
        country: location.country,
        provider: null,
        providerPlaceId: null,
        formattedAddress: null,
        latitude: null,
        longitude: null,
        confidence: location.confidence,
        status: 'missing_geocode',
        reuseCount,
        risk,
        evidence: {
          retailer_location: clone(location),
        },
        builtAt,
      });
    });
}

function buildManualGeocodeCandidates(state, builtAt) {
  return (state.manual_location_geocodes || [])
    .map((geocode) => {
      const reuseCount = countSavedLocationsForManualGeocode(state, geocode);
      const risk = scoreRisk({
        status: geocode.status,
        confidence: geocode.confidence,
        reuseCount,
        missingCoordinates: !hasCoordinates(geocode),
        providerAmbiguity: geocode.status === 'ambiguous',
      });
      if (!risk.shouldReview) {
        return null;
      }
      return buildBaseCandidate({
        sourceType: 'manual_location_geocode',
        sourceId: geocode.geocode_id,
        relatedLocationId: null,
        title: geocode.provenance?.display_name || geocode.formatted_address || geocode.query_text || geocode.geocode_id,
        queryText: geocode.query_text,
        rawAddress: geocode.provenance?.address_raw || null,
        city: geocode.provenance?.city || null,
        country: geocode.provenance?.country || null,
        provider: geocode.provider,
        providerPlaceId: geocode.provider_place_id,
        formattedAddress: geocode.formatted_address,
        latitude: geocode.latitude,
        longitude: geocode.longitude,
        confidence: geocode.confidence,
        status: geocode.status,
        reuseCount,
        risk,
        evidence: {
          manual_geocode: clone(geocode),
        },
        builtAt,
      });
    })
    .filter(Boolean);
}

function buildSavedLocationCandidates(state, builtAt) {
  const manualById = new Map((state.manual_location_geocodes || [])
    .map((geocode) => [geocode.geocode_id, geocode]));
  const manualByAddress = new Map((state.manual_location_geocodes || [])
    .map((geocode) => [manualAddressKey(geocode.provenance || {}), geocode])
    .filter(([key]) => key));

  return (state.saved_user_locations || [])
    .filter((location) => location.source === 'geocoded')
    .map((location) => {
      const linkedGeocode = manualById.get(location.provenance?.geocode_id) ||
        manualByAddress.get(manualAddressKey({
          country: location.provenance?.country,
          city: location.provenance?.city,
          address_raw: location.address_raw,
        })) ||
        null;
      const providerMismatch = Boolean(
        linkedGeocode &&
        (
          normalizeString(location.provider) !== normalizeString(linkedGeocode.provider) ||
          normalizeString(location.provider_place_id) !== normalizeString(linkedGeocode.provider_place_id)
        ),
      );
      const missingLinkedProvider = !linkedGeocode;
      const risk = scoreRisk({
        status: providerMismatch ? 'provider_mismatch' : 'matched',
        confidence: location.confidence,
        reuseCount: 1,
        missingCoordinates: !hasCoordinates(location),
        providerAmbiguity: providerMismatch || missingLinkedProvider,
      });
      if (!risk.shouldReview) {
        return null;
      }
      return buildBaseCandidate({
        sourceType: 'saved_user_location',
        sourceId: location.location_id,
        relatedLocationId: location.location_id,
        title: location.display_name || location.address_raw || location.location_id,
        queryText: location.provenance?.query_text || null,
        rawAddress: location.address_raw,
        city: location.provenance?.city || null,
        country: location.provenance?.country || null,
        provider: location.provider,
        providerPlaceId: location.provider_place_id,
        formattedAddress: location.formatted_address,
        latitude: location.latitude,
        longitude: location.longitude,
        confidence: location.confidence,
        status: providerMismatch ? 'provider_mismatch' : 'matched',
        reuseCount: 1,
        risk,
        evidence: {
          saved_user_location: clone(location),
          linked_manual_geocode: linkedGeocode ? clone(linkedGeocode) : null,
          provider_mismatch: providerMismatch,
          missing_linked_provider: missingLinkedProvider,
        },
        builtAt,
      });
    })
    .filter(Boolean);
}

function buildBaseCandidate({
  sourceType,
  sourceId,
  relatedLocationId,
  title,
  queryText,
  rawAddress,
  city,
  country,
  provider,
  providerPlaceId,
  formattedAddress,
  latitude,
  longitude,
  confidence,
  status,
  reuseCount,
  risk,
  evidence,
  builtAt,
}) {
  return {
    candidate_id: buildLocationReviewCandidateId(sourceType, sourceId),
    source_type: sourceType,
    source_id: sourceId,
    related_location_id: relatedLocationId || null,
    title: normalizeOptionalString(title),
    query_text: normalizeOptionalString(queryText),
    raw_address: normalizeOptionalString(rawAddress),
    city: normalizeOptionalString(city),
    country: normalizeOptionalString(country),
    provider: normalizeOptionalString(provider),
    provider_place_id: normalizeOptionalString(providerPlaceId),
    formatted_address: normalizeOptionalString(formattedAddress),
    latitude: toFiniteNumber(latitude),
    longitude: toFiniteNumber(longitude),
    confidence: normalizeConfidence(confidence),
    source_status: status,
    reuse_count: reuseCount,
    risk_score: risk.score,
    risk_factors: risk.factors,
    review_status: 'pending',
    reviewed_by: null,
    reviewed_at: null,
    reviewer_note: null,
    approved_latitude: null,
    approved_longitude: null,
    correction_reason: null,
    evidence,
    rules_version: LOCATION_REVIEW_RULES_VERSION,
    created_at: builtAt,
    updated_at: builtAt,
  };
}

function scoreRisk({
  status,
  confidence,
  reuseCount,
  missingCoordinates,
  providerAmbiguity,
}) {
  const factors = [];
  let score = 0;
  const normalizedStatus = normalizeString(status);
  const statusScores = {
    ambiguous: 50,
    failed: 45,
    provider_mismatch: 45,
    missing_geocode: 35,
    skipped: 25,
    pending: 25,
    invalid_input: 20,
  };

  if (statusScores[normalizedStatus]) {
    score += statusScores[normalizedStatus];
    factors.push(`status:${normalizedStatus}`);
  }

  const normalizedConfidence = normalizeConfidence(confidence);
  if (normalizedConfidence === null) {
    score += 12;
    factors.push('confidence:missing');
  } else if (normalizedConfidence < LOW_CONFIDENCE_THRESHOLD) {
    score += Math.round((LOW_CONFIDENCE_THRESHOLD - normalizedConfidence) * 50);
    factors.push('confidence:low');
  }

  if (missingCoordinates) {
    score += 20;
    factors.push('coordinates:missing');
  }

  if (providerAmbiguity) {
    score += 30;
    factors.push('provider:ambiguous_or_mismatch');
  }

  const normalizedReuse = Math.max(0, toInt(reuseCount));
  if (normalizedReuse >= HIGH_REUSE_THRESHOLD) {
    score += Math.min(25, normalizedReuse);
    factors.push('reuse:high');
  } else if (normalizedReuse > 1) {
    score += Math.min(10, normalizedReuse);
    factors.push('reuse:present');
  }

  return {
    score,
    factors,
    shouldReview: score > 0,
  };
}

function mergeExistingReview(candidate, existing, builtAt) {
  if (!existing) {
    return candidate;
  }
  return {
    ...candidate,
    review_status: existing.review_status || 'pending',
    reviewed_by: existing.reviewed_by || null,
    reviewed_at: existing.reviewed_at || null,
    reviewer_note: existing.reviewer_note || null,
    approved_latitude: existing.approved_latitude ?? null,
    approved_longitude: existing.approved_longitude ?? null,
    correction_reason: existing.correction_reason || null,
    created_at: existing.created_at || candidate.created_at || builtAt,
    updated_at: builtAt,
  };
}

function compareLocationReviewCandidates(left, right) {
  const scoreDelta = (right.risk_score || 0) - (left.risk_score || 0);
  if (scoreDelta !== 0) return scoreDelta;
  const reuseDelta = (right.reuse_count || 0) - (left.reuse_count || 0);
  if (reuseDelta !== 0) return reuseDelta;
  return String(left.candidate_id).localeCompare(String(right.candidate_id));
}

function buildLocationReviewCandidateId(sourceType, sourceId) {
  return `locreview_${crypto
    .createHash('sha256')
    .update([
      'location_review_candidate_v1',
      normalizeString(sourceType),
      normalizeString(sourceId),
    ].join('|'))
    .digest('hex')
    .slice(0, 32)}`;
}

function normalizeApprovedCoordinates({
  reviewStatus,
  approvedLatitude,
  approvedLongitude,
}) {
  if (reviewStatus !== 'approved') {
    return {
      latitude: null,
      longitude: null,
    };
  }

  const latitude = toFiniteNumber(approvedLatitude);
  const longitude = toFiniteNumber(approvedLongitude);
  if (latitude === null || latitude < -90 || latitude > 90) {
    return {
      error: badRequest('approved_latitude must be between -90 and 90'),
    };
  }
  if (longitude === null || longitude < -180 || longitude > 180) {
    return {
      error: badRequest('approved_longitude must be between -180 and 180'),
    };
  }
  return {
    latitude,
    longitude,
  };
}

function normalizeReviewStatus(value) {
  const normalized = normalizeString(value);
  if (!LOCATION_REVIEW_STATUSES.includes(normalized)) {
    return {
      error: badRequest('review_status must be pending, approved, rejected, or needs_more_info'),
    };
  }
  return { value: normalized };
}

function normalizeOptionalReviewStatus(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return { value: null };
  }
  const required = normalizeReviewStatus(normalized);
  if (required.error) {
    return required;
  }
  return { value: required.value };
}

function normalizeReviewedCoordinateStatus(value) {
  const normalized = normalizeString(value || 'active');
  if (!['active', 'superseded', 'all'].includes(normalized)) {
    return {
      error: badRequest('status must be active, superseded, or all'),
    };
  }
  return { value: normalized };
}

function countLocationSourceProducts(location) {
  return Array.isArray(location?.provenance?.source_product_ids)
    ? location.provenance.source_product_ids.length
    : 0;
}

function getLocationReuseCount(location) {
  if (!location) return 0;
  return Math.max(
    toInt(location.source_product_count),
    toInt(location.snapshot_count),
    countLocationSourceProducts(location),
  );
}

function countSavedLocationsForManualGeocode(state, geocode) {
  const geocodeId = geocode.geocode_id;
  const key = manualAddressKey(geocode.provenance || {});
  return (state.saved_user_locations || [])
    .filter((location) => location.source === 'geocoded')
    .filter((location) => {
      if (location.provenance?.geocode_id && location.provenance.geocode_id === geocodeId) {
        return true;
      }
      return key && manualAddressKey({
        country: location.provenance?.country,
        city: location.provenance?.city,
        address_raw: location.address_raw,
      }) === key;
    })
    .length;
}

function manualAddressKey(value) {
  const address = normalizeKeyPart(value.address_raw || value.raw_address || value.address);
  if (!address) return '';
  return [
    normalizeKeyPart(value.country),
    normalizeKeyPart(value.city),
    address,
  ].join('|');
}

function hasAddressLikeText(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return false;
  return /(ул\.|бул\.|ul\.|bul\.|жк|гр\.|street|strasse|straße|boulevard|road|avenue|\d)/iu.test(normalized);
}

function hasCoordinates(value) {
  return toFiniteNumber(value?.latitude) !== null && toFiniteNumber(value?.longitude) !== null;
}

function normalizeLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 200;
  return Math.max(1, Math.min(500, Math.trunc(parsed)));
}

function normalizeConfidence(value) {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return null;
  return Math.max(0, Math.min(1, parsed));
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInt(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function ratio(numerator, denominator) {
  if (!denominator) return 0;
  return roundMetric(numerator / denominator);
}

function roundMetric(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

function normalizeString(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .trim();
}

function normalizeOptionalString(value) {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeKeyPart(value) {
  return normalizeString(value)
    .toLocaleLowerCase('bg-BG')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function normalizeTimestamp(value) {
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function requireAdminIdentity(req) {
  const identity = ADMIN_IDENTITY_HEADERS
    .map((header) => readHeader(req, header))
    .map(normalizeString)
    .find(Boolean);
  if (!identity) {
    return {
      allowed: false,
      status: 403,
      body: {
        error: 'admin identity required',
      },
    };
  }
  return {
    allowed: true,
    identity,
  };
}

function readHeader(req, name) {
  if (!req || !name) {
    return null;
  }
  if (typeof req.get === 'function') {
    return req.get(name);
  }
  if (typeof req.header === 'function') {
    return req.header(name);
  }
  const headers = req.headers || {};
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || null;
}

function badRequest(message) {
  return {
    status: 400,
    body: {
      error: message,
    },
  };
}

function requireStore(store) {
  if (!store || typeof store.load !== 'function' || typeof store.save !== 'function') {
    throw new Error('store with load/save is required');
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  ADMIN_IDENTITY_HEADERS,
  HIGH_REUSE_THRESHOLD,
  LOCATION_REVIEW_RULES_VERSION,
  LOCATION_REVIEW_STATUSES,
  LOW_CONFIDENCE_THRESHOLD,
  REVIEWED_COORDINATE_PRECEDENCE_POLICY,
  REVIEWED_COORDINATE_DEFAULT_SWITCH_CRITERIA,
  REVIEWED_COORDINATE_ROLLOUT_DIAGNOSTICS_RULES_VERSION,
  REVIEWED_LOCATION_COORDINATE_RULES_VERSION,
  buildLocationReviewCandidateId,
  buildReviewedCoordinateSourceIdentity,
  buildReviewedLocationCoordinateId,
  buildReviewedCoordinateDiagnostics,
  buildReviewedCoordinateRolloutDiagnostics,
  buildLocationReviewCandidates,
  buildLocationReviewCandidatesInState,
  compareLocationReviewCandidates,
  handleGetLocationReviewCandidateRequest,
  handleGetReviewedLocationCoordinateRequest,
  handleListLocationReviewCandidatesRequest,
  handleListReviewedLocationCoordinatesRequest,
  handleReviewLocationCandidateRequest,
  handleReviewedCoordinateDiagnosticsRequest,
  handleReviewedCoordinateRolloutDiagnosticsRequest,
  listReviewedLocationCoordinates,
  publishReviewedLocationCoordinates,
  publishReviewedLocationCoordinatesInState,
  reviewLocationCandidate,
  reviewLocationCandidateInState,
};
