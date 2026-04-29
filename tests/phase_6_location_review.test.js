const assert = require('node:assert/strict');

const {
  InMemoryDataBackboneStore,
  DEFAULT_COORDINATE_MODE,
  buildLocationReviewCandidates,
  buildLocationReviewCandidateId,
  buildReviewedCoordinateRolloutDiagnostics,
  handleGetLocationReviewCandidateRequest,
  handleGetReviewedLocationCoordinateRequest,
  handleListLocationReviewCandidatesRequest,
  handleListReviewedLocationCoordinatesRequest,
  handleReviewLocationCandidateRequest,
  handleReviewedCoordinateDiagnosticsRequest,
  handleReviewedCoordinateRolloutDiagnosticsRequest,
  publishReviewedLocationCoordinates,
  reviewLocationCandidate,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function baseState(overrides = {}) {
  return {
    retailer_locations: [
      retailerLocation({
        location_id: 'loc_ambiguous',
        store_name_raw: 'Pharmacy Sofia Center',
        raw_address: 'Sofia / ul. Solunska 12',
        city: 'Sofia',
        source_product_count: 15,
        snapshot_count: 20,
      }),
      retailerLocation({
        location_id: 'loc_missing',
        store_name_raw: 'DM Store Plovdiv',
        raw_address: 'ul. Kapitan Raycho 32',
        city: 'Plovdiv',
        source_product_count: 30,
        snapshot_count: 40,
      }),
      retailerLocation({
        location_id: 'loc_low_confidence',
        store_name_raw: 'Market Varna',
        raw_address: 'Street 5',
        city: 'Varna',
        source_product_count: 3,
        snapshot_count: 4,
      }),
    ],
    retailer_location_geocodes: [
      geocode({
        geocode_id: 'geo_ambiguous',
        location_id: 'loc_ambiguous',
        status: 'ambiguous',
        confidence: 0,
        latitude: null,
        longitude: null,
      }),
      geocode({
        geocode_id: 'geo_low_confidence',
        location_id: 'loc_low_confidence',
        status: 'matched',
        confidence: 0.51,
        latitude: 43.21,
        longitude: 27.91,
      }),
    ],
    manual_location_geocodes: [
      manualGeocode({
        geocode_id: 'manual_geo_mismatch',
        provider: 'fake-a',
        provider_place_id: 'place-a',
        confidence: 0.92,
      }),
    ],
    saved_user_locations: [
      {
        location_id: 'userloc_mismatch',
        user_id: 'user-1',
        label: 'custom',
        display_name: 'Gym',
        address_raw: 'Vitosha Boulevard 24',
        latitude: 42.695,
        longitude: 23.321,
        default_radius_km: 3,
        default_sort: 'nearest',
        source: 'geocoded',
        provider: 'fake-b',
        provider_place_id: 'place-b',
        formatted_address: 'Vitosha Boulevard 24, Sofia',
        confidence: 0.9,
        confidence_reason: 'saved_from_geocode',
        provenance: {
          geocode_id: 'manual_geo_mismatch',
          country: 'BG',
          city: 'Sofia',
          query_text: 'BG, Sofia, Vitosha Boulevard 24',
        },
        is_default: false,
        created_at: '2026-04-28T09:00:00.000Z',
        updated_at: '2026-04-28T09:00:00.000Z',
      },
    ],
    location_review_candidates: [],
    ...overrides,
  };
}

function retailerLocation(overrides = {}) {
  return {
    location_id: 'loc_default',
    chain_id: 'chain_test',
    chain_name_raw: 'Test Chain',
    chain_name_normalized: 'test chain',
    store_name_raw: 'Test Store',
    store_name_normalized: 'test store',
    branch_name: 'Branch',
    raw_address: 'ul. Test 1',
    city: 'Sofia',
    locality_code: '1000',
    country: 'BG',
    latitude: null,
    longitude: null,
    source: 'store_name_raw',
    confidence: 0.88,
    confidence_reason: 'city_and_street_marker',
    extraction_method: 'deterministic',
    rules_version: 'store-location-v1',
    needs_geocoding: true,
    provenance: {
      source_product_ids: ['sp_1', 'sp_2'],
      snapshot_ids: ['snap_1'],
      raw_store_names: ['Test Store, ul. Test 1'],
    },
    first_seen_date: '2026-04-21',
    last_seen_date: '2026-04-21',
    snapshot_count: 2,
    source_product_count: 2,
    extracted_at: '2026-04-22T08:00:00.000Z',
    updated_at: '2026-04-22T08:00:00.000Z',
    ...overrides,
  };
}

function geocode(overrides = {}) {
  return {
    geocode_id: 'geo_default',
    cache_key: 'cache_default',
    location_id: 'loc_default',
    provider: 'fake',
    provider_place_id: 'place_default',
    query_text: 'BG, Sofia, ul. Test 1',
    formatted_address: 'ul. Test 1, Sofia',
    latitude: 42.7,
    longitude: 23.3,
    confidence: 0.9,
    confidence_reason: 'single_provider_match',
    status: 'matched',
    rules_version: 'store-location-geocoding-v1',
    provenance: {
      source: 'retailer_locations',
      location_id: overrides.location_id || 'loc_default',
      country: 'BG',
      city: 'Sofia',
      raw_address: 'ul. Test 1',
    },
    raw_provider_result: {},
    geocoded_at: '2026-04-28T09:00:00.000Z',
    updated_at: '2026-04-28T09:00:00.000Z',
    ...overrides,
  };
}

function manualGeocode(overrides = {}) {
  return {
    geocode_id: 'manual_geo_default',
    cache_key: 'manual_cache_default',
    user_id: 'user-1',
    provider: 'fake',
    provider_place_id: 'manual_place_default',
    query_text: 'BG, Sofia, Vitosha Boulevard 24',
    formatted_address: 'Vitosha Boulevard 24, Sofia',
    latitude: 42.695,
    longitude: 23.321,
    confidence: 0.9,
    confidence_reason: 'single_provider_match',
    status: 'matched',
    rules_version: 'manual-address-geocoding-v1',
    provenance: {
      source: 'manual_address',
      user_id: 'user-1',
      country: 'BG',
      city: 'Sofia',
      address_raw: 'Vitosha Boulevard 24',
      display_name: 'Gym',
    },
    raw_provider_result: {},
    geocoded_at: '2026-04-28T09:00:00.000Z',
    updated_at: '2026-04-28T09:00:00.000Z',
    ...overrides,
  };
}

function reviewedCoordinate(overrides = {}) {
  return {
    reviewed_coordinate_id: 'reviewedloc_default',
    source_candidate_id: 'locreview_default',
    source_type: 'retailer_location_geocode',
    source_id: 'geo_low_confidence',
    location_id: 'loc_low_confidence',
    source_identity: 'retailer_location_geocode|geo_low_confidence',
    latitude: 43.215,
    longitude: 27.925,
    confidence: 0.92,
    correction_reason: 'fixture_review',
    approved_by: 'geo-admin',
    approved_at: '2026-04-28T11:00:00.000Z',
    supersedes_id: null,
    is_active: true,
    provenance: { source: 'location_review_candidates' },
    rules_version: 'reviewed-location-coordinate-v1',
    published_at: '2026-04-28T12:00:00.000Z',
    updated_at: '2026-04-28T12:00:00.000Z',
    ...overrides,
  };
}

test('location review builder ranks ambiguous high-reuse and missing-coordinate candidates first', async () => {
  const store = new InMemoryDataBackboneStore(baseState());
  const result = await buildLocationReviewCandidates({
    store,
    builtAt: '2026-04-28T10:00:00.000Z',
  });
  const candidates = result.candidates;

  assert(candidates.length >= 4);
  assert.equal(candidates[0].source_type, 'retailer_location_geocode');
  assert.equal(candidates[0].source_id, 'geo_ambiguous');
  assert(candidates[0].risk_factors.includes('status:ambiguous'));
  assert(candidates[0].risk_factors.includes('provider:ambiguous_or_mismatch'));

  const missing = candidates.find((candidate) => candidate.source_id === 'loc_missing');
  assert(missing);
  assert.equal(missing.source_type, 'retailer_location_missing_geocode');
  assert(missing.risk_factors.includes('coordinates:missing'));
  assert(missing.risk_factors.includes('reuse:high'));

  const mismatch = candidates.find((candidate) => candidate.source_id === 'userloc_mismatch');
  assert(mismatch);
  assert.equal(mismatch.source_status, 'provider_mismatch');
  assert.equal(mismatch.evidence.provider_mismatch, true);
});

test('location review approval stores reviewer and approved coordinates additively', async () => {
  const store = new InMemoryDataBackboneStore(baseState());
  await buildLocationReviewCandidates({
    store,
    builtAt: '2026-04-28T10:00:00.000Z',
  });
  const candidateId = buildLocationReviewCandidateId(
    'retailer_location_geocode',
    'geo_low_confidence',
  );
  const response = await reviewLocationCandidate({
    store,
    candidateId,
    decision: 'approved',
    reviewedBy: 'admin@example.com',
    reviewerNote: 'Adjusted to storefront entrance.',
    approvedLatitude: 43.215,
    approvedLongitude: 27.925,
    correctionReason: 'manual_admin_review',
    reviewedAt: '2026-04-28T11:00:00.000Z',
  });
  const state = await store.load();
  const sourceGeocode = state.retailer_location_geocodes
    .find((record) => record.geocode_id === 'geo_low_confidence');

  assert.equal(response.status, 200);
  assert.equal(response.body.candidate.review_status, 'approved');
  assert.equal(response.body.candidate.reviewed_by, 'admin@example.com');
  assert.equal(response.body.candidate.approved_latitude, 43.215);
  assert.equal(response.body.candidate.approved_longitude, 27.925);
  assert.equal(response.body.candidate.correction_reason, 'manual_admin_review');
  assert.equal(sourceGeocode.latitude, 43.21);
  assert.equal(sourceGeocode.longitude, 27.91);
});

test('location review rejection records decision without approved coordinates', async () => {
  const store = new InMemoryDataBackboneStore(baseState());
  await buildLocationReviewCandidates({ store });
  const candidateId = buildLocationReviewCandidateId(
    'retailer_location_geocode',
    'geo_ambiguous',
  );
  const response = await reviewLocationCandidate({
    store,
    candidateId,
    decision: 'rejected',
    reviewedBy: 'ops',
    reviewerNote: 'Provider candidates are unrelated.',
    approvedLatitude: 42.7,
    approvedLongitude: 23.3,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.candidate.review_status, 'rejected');
  assert.equal(response.body.candidate.approved_latitude, null);
  assert.equal(response.body.candidate.approved_longitude, null);
  assert.equal(response.body.candidate.reviewer_note, 'Provider candidates are unrelated.');
});

test('location review corrections survive rebuilds without mutating raw location evidence', async () => {
  const store = new InMemoryDataBackboneStore(baseState());
  const candidateId = buildLocationReviewCandidateId(
    'retailer_location_missing_geocode',
    'loc_missing',
  );
  await buildLocationReviewCandidates({
    store,
    builtAt: '2026-04-28T10:00:00.000Z',
  });
  await reviewLocationCandidate({
    store,
    candidateId,
    decision: 'approved',
    reviewedBy: 'ops',
    approvedLatitude: 42.141,
    approvedLongitude: 24.749,
    correctionReason: 'address_verified',
    reviewedAt: '2026-04-28T11:00:00.000Z',
  });
  await buildLocationReviewCandidates({
    store,
    builtAt: '2026-04-28T12:00:00.000Z',
  });
  const state = await store.load();
  const reviewed = state.location_review_candidates
    .find((candidate) => candidate.candidate_id === candidateId);
  const rawLocation = state.retailer_locations
    .find((location) => location.location_id === 'loc_missing');

  assert.equal(reviewed.review_status, 'approved');
  assert.equal(reviewed.approved_latitude, 42.141);
  assert.equal(reviewed.approved_longitude, 24.749);
  assert.equal(rawLocation.latitude, null);
  assert.equal(rawLocation.longitude, null);
  assert.equal(rawLocation.raw_address, 'ul. Kapitan Raycho 32');
});

test('location review admin API lists pending candidates and fetches detail with operator identity', async () => {
  const store = new InMemoryDataBackboneStore(baseState());
  const list = await handleListLocationReviewCandidatesRequest({
    store,
    body: { review_status: 'pending', limit: 20 },
    req: { headers: { 'x-pricer-operator-id': 'ops@example.com' } },
  });
  const firstCandidate = list.body.candidates[0];
  const detail = await handleGetLocationReviewCandidateRequest({
    store,
    params: { id: firstCandidate.candidate_id },
    req: { headers: { 'x-pricer-admin-id': 'admin@example.com' } },
  });

  assert.equal(list.status, 200);
  assert.equal(list.body.operator, 'ops@example.com');
  assert(list.body.total > 0);
  assert(list.body.candidates.every((candidate) => candidate.review_status === 'pending'));
  assert.equal(detail.status, 200);
  assert.equal(detail.body.operator, 'admin@example.com');
  assert.equal(detail.body.candidate.candidate_id, firstCandidate.candidate_id);
});

test('location review admin API approves candidate with corrected coordinates', async () => {
  const store = new InMemoryDataBackboneStore(baseState());
  const candidateId = buildLocationReviewCandidateId(
    'retailer_location_geocode',
    'geo_low_confidence',
  );
  const response = await handleReviewLocationCandidateRequest({
    store,
    params: { id: candidateId },
    body: {
      approved_latitude: 43.215,
      approved_longitude: 27.925,
      correction_reason: 'storefront_checked',
      reviewer_note: 'Coordinates corrected after review.',
    },
    req: { headers: { 'x-pricer-admin-id': 'geo-admin' } },
    decision: 'approved',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.candidate.review_status, 'approved');
  assert.equal(response.body.candidate.reviewed_by, 'geo-admin');
  assert.equal(response.body.candidate.approved_latitude, 43.215);
  assert.equal(response.body.candidate.approved_longitude, 27.925);
  assert.equal(response.body.candidate.correction_reason, 'storefront_checked');
});

test('location review admin API rejects candidate with reason', async () => {
  const store = new InMemoryDataBackboneStore(baseState());
  const candidateId = buildLocationReviewCandidateId(
    'retailer_location_geocode',
    'geo_ambiguous',
  );
  const response = await handleReviewLocationCandidateRequest({
    store,
    params: { id: candidateId },
    body: {
      reason: 'provider_candidates_wrong_city',
      note: 'Both candidates are unrelated.',
    },
    req: { headers: { 'x-pricer-operator-id': 'ops' } },
    decision: 'rejected',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.candidate.review_status, 'rejected');
  assert.equal(response.body.candidate.reviewed_by, 'ops');
  assert.equal(response.body.candidate.correction_reason, 'provider_candidates_wrong_city');
  assert.equal(response.body.candidate.reviewer_note, 'Both candidates are unrelated.');
  assert.equal(response.body.candidate.approved_latitude, null);
});

test('location review admin API marks candidate needs_more_info', async () => {
  const store = new InMemoryDataBackboneStore(baseState());
  const candidateId = buildLocationReviewCandidateId(
    'retailer_location_missing_geocode',
    'loc_missing',
  );
  const response = await handleReviewLocationCandidateRequest({
    store,
    params: { id: candidateId },
    body: {
      note: 'Need branch photo or official listing.',
    },
    req: { headers: { 'x-pricer-admin-id': 'location-lead' } },
    decision: 'needs_more_info',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.candidate.review_status, 'needs_more_info');
  assert.equal(response.body.candidate.reviewed_by, 'location-lead');
  assert.equal(response.body.candidate.reviewer_note, 'Need branch photo or official listing.');
  assert.equal(response.body.candidate.approved_latitude, null);
});

test('location review admin API rejects missing admin identity', async () => {
  const store = new InMemoryDataBackboneStore(baseState());
  const list = await handleListLocationReviewCandidatesRequest({
    store,
    body: {},
    req: { headers: {} },
  });
  const review = await handleReviewLocationCandidateRequest({
    store,
    params: { id: 'locreview_missing' },
    body: {},
    req: { headers: {} },
    decision: 'rejected',
  });

  assert.equal(list.status, 403);
  assert.equal(list.body.error, 'admin identity required');
  assert.equal(review.status, 403);
  assert.equal(review.body.error, 'admin identity required');
});

test('reviewed location coordinate publisher writes approved corrections additively', async () => {
  const store = new InMemoryDataBackboneStore(baseState());
  await buildLocationReviewCandidates({ store });
  const candidateId = buildLocationReviewCandidateId(
    'retailer_location_geocode',
    'geo_low_confidence',
  );
  await reviewLocationCandidate({
    store,
    candidateId,
    decision: 'approved',
    reviewedBy: 'geo-admin',
    approvedLatitude: 43.215,
    approvedLongitude: 27.925,
    correctionReason: 'storefront_verified',
    reviewedAt: '2026-04-28T11:00:00.000Z',
  });
  const result = await publishReviewedLocationCoordinates({
    store,
    publishedAt: '2026-04-28T12:00:00.000Z',
  });
  const coordinate = result.coordinates
    .find((record) => record.source_candidate_id === candidateId);

  assert.equal(result.metrics.published, 1);
  assert(coordinate);
  assert.equal(coordinate.source_type, 'retailer_location_geocode');
  assert.equal(coordinate.source_id, 'geo_low_confidence');
  assert.equal(coordinate.location_id, 'loc_low_confidence');
  assert.equal(coordinate.latitude, 43.215);
  assert.equal(coordinate.longitude, 27.925);
  assert.equal(coordinate.approved_by, 'geo-admin');
  assert.equal(coordinate.correction_reason, 'storefront_verified');
  assert.equal(coordinate.is_active, true);
  assert.equal(coordinate.provenance.source, 'location_review_candidates');
});

test('reviewed location coordinate publisher skips rejected candidates', async () => {
  const store = new InMemoryDataBackboneStore(baseState());
  await buildLocationReviewCandidates({ store });
  const candidateId = buildLocationReviewCandidateId(
    'retailer_location_geocode',
    'geo_ambiguous',
  );
  await reviewLocationCandidate({
    store,
    candidateId,
    decision: 'rejected',
    reviewedBy: 'ops',
    reviewerNote: 'Wrong city.',
  });
  const result = await publishReviewedLocationCoordinates({ store });

  assert.equal(result.coordinates
    .some((record) => record.source_candidate_id === candidateId), false);
  assert.equal(result.metrics.published, 0);
});

test('reviewed location coordinate publisher skips needs_more_info candidates', async () => {
  const store = new InMemoryDataBackboneStore(baseState());
  await buildLocationReviewCandidates({ store });
  const candidateId = buildLocationReviewCandidateId(
    'retailer_location_missing_geocode',
    'loc_missing',
  );
  await reviewLocationCandidate({
    store,
    candidateId,
    decision: 'needs_more_info',
    reviewedBy: 'ops',
    reviewerNote: 'Need operator confirmation.',
  });
  const result = await publishReviewedLocationCoordinates({ store });

  assert.equal(result.coordinates
    .some((record) => record.source_candidate_id === candidateId), false);
  assert.equal(result.metrics.published, 0);
});

test('reviewed location coordinate publisher supersedes older approved coordinates for the same source', async () => {
  const store = new InMemoryDataBackboneStore(baseState());
  await buildLocationReviewCandidates({ store });
  const candidateId = buildLocationReviewCandidateId(
    'retailer_location_geocode',
    'geo_low_confidence',
  );
  await reviewLocationCandidate({
    store,
    candidateId,
    decision: 'approved',
    reviewedBy: 'geo-admin',
    approvedLatitude: 43.215,
    approvedLongitude: 27.925,
    correctionReason: 'first_review',
    reviewedAt: '2026-04-28T11:00:00.000Z',
  });
  const firstPublish = await publishReviewedLocationCoordinates({
    store,
    publishedAt: '2026-04-28T12:00:00.000Z',
  });
  const first = firstPublish.coordinates
    .find((record) => record.source_candidate_id === candidateId);

  await reviewLocationCandidate({
    store,
    candidateId,
    decision: 'approved',
    reviewedBy: 'geo-admin-2',
    approvedLatitude: 43.216,
    approvedLongitude: 27.926,
    correctionReason: 'replacement_review',
    reviewedAt: '2026-04-28T13:00:00.000Z',
  });
  const secondPublish = await publishReviewedLocationCoordinates({
    store,
    publishedAt: '2026-04-28T14:00:00.000Z',
  });
  const records = secondPublish.coordinates
    .filter((record) => record.source_candidate_id === candidateId);
  const active = records.find((record) => record.is_active === true);
  const inactive = records.find((record) => record.is_active === false);

  assert.equal(records.length, 2);
  assert.equal(active.latitude, 43.216);
  assert.equal(active.longitude, 27.926);
  assert.equal(active.supersedes_id, first.reviewed_coordinate_id);
  assert.equal(inactive.reviewed_coordinate_id, first.reviewed_coordinate_id);
});

test('reviewed location coordinate publication leaves raw geocode rows unchanged', async () => {
  const store = new InMemoryDataBackboneStore(baseState());
  await buildLocationReviewCandidates({ store });
  const candidateId = buildLocationReviewCandidateId(
    'retailer_location_geocode',
    'geo_low_confidence',
  );
  await reviewLocationCandidate({
    store,
    candidateId,
    decision: 'approved',
    reviewedBy: 'geo-admin',
    approvedLatitude: 43.215,
    approvedLongitude: 27.925,
    correctionReason: 'storefront_verified',
  });
  await publishReviewedLocationCoordinates({ store });
  const state = await store.load();
  const sourceGeocode = state.retailer_location_geocodes
    .find((record) => record.geocode_id === 'geo_low_confidence');

  assert.equal(sourceGeocode.latitude, 43.21);
  assert.equal(sourceGeocode.longitude, 27.91);
  assert.equal(state.reviewed_location_coordinates.length, 1);
});

test('reviewed coordinate diagnostics dry-run lets active reviewed coordinate win', async () => {
  const store = new InMemoryDataBackboneStore(baseState());
  await buildLocationReviewCandidates({ store });
  const candidateId = buildLocationReviewCandidateId(
    'retailer_location_geocode',
    'geo_low_confidence',
  );
  await reviewLocationCandidate({
    store,
    candidateId,
    decision: 'approved',
    reviewedBy: 'geo-admin',
    approvedLatitude: 43.215,
    approvedLongitude: 27.925,
    correctionReason: 'storefront_verified',
  });
  await publishReviewedLocationCoordinates({ store });
  const response = await handleReviewedCoordinateDiagnosticsRequest({
    store,
    body: { source_identity: 'retailer_location_geocode|geo_low_confidence' },
    req: { headers: { 'x-pricer-admin-id': 'geo-admin' } },
  });
  const diagnostic = response.body.diagnostics[0];

  assert.equal(response.status, 200);
  assert.equal(diagnostic.winner, 'reviewed');
  assert.equal(diagnostic.winning_coordinate.latitude, 43.215);
  assert.equal(diagnostic.provider_coordinate.latitude, 43.21);
  assert.equal(diagnostic.reason, 'active reviewed coordinate wins over provider coordinate');
});

test('reviewed coordinate diagnostics dry-run uses provider coordinate when no reviewed coordinate exists', async () => {
  const store = new InMemoryDataBackboneStore(baseState());
  const response = await handleReviewedCoordinateDiagnosticsRequest({
    store,
    body: { source_identity: 'retailer_location_geocode|geo_low_confidence' },
    req: { headers: { 'x-pricer-operator-id': 'ops' } },
  });
  const diagnostic = response.body.diagnostics[0];

  assert.equal(response.status, 200);
  assert.equal(diagnostic.winner, 'provider');
  assert.equal(diagnostic.winning_coordinate.latitude, 43.21);
  assert.equal(diagnostic.reviewed_coordinate, null);
  assert.equal(diagnostic.reason, 'matched provider coordinate wins because no active reviewed coordinate exists');
});

test('reviewed coordinate diagnostics ignores superseded reviewed coordinates', async () => {
  const superseded = {
    reviewed_coordinate_id: 'reviewedloc_old',
    source_candidate_id: 'candidate_old',
    source_type: 'retailer_location_geocode',
    source_id: 'geo_low_confidence',
    location_id: 'loc_low_confidence',
    source_identity: 'retailer_location_geocode|geo_low_confidence',
    latitude: 43.999,
    longitude: 27.999,
    confidence: 0.51,
    correction_reason: 'old_review',
    approved_by: 'geo-admin',
    approved_at: '2026-04-28T11:00:00.000Z',
    supersedes_id: null,
    is_active: false,
    provenance: { source: 'location_review_candidates' },
    rules_version: 'reviewed-location-coordinate-v1',
    published_at: '2026-04-28T12:00:00.000Z',
    updated_at: '2026-04-28T12:00:00.000Z',
  };
  const store = new InMemoryDataBackboneStore(baseState({
    reviewed_location_coordinates: [superseded],
  }));
  const response = await handleReviewedCoordinateDiagnosticsRequest({
    store,
    body: { source_identity: 'retailer_location_geocode|geo_low_confidence' },
    req: { headers: { 'x-pricer-admin-id': 'geo-admin' } },
  });
  const diagnostic = response.body.diagnostics[0];

  assert.equal(response.status, 200);
  assert.equal(diagnostic.winner, 'provider');
  assert.equal(diagnostic.winning_coordinate.latitude, 43.21);
  assert.equal(diagnostic.superseded_reviewed_coordinate_count, 1);
});

test('reviewed coordinate diagnostics reports unavailable when no coordinate can win', async () => {
  const store = new InMemoryDataBackboneStore(baseState());
  const response = await handleReviewedCoordinateDiagnosticsRequest({
    store,
    body: { source_identity: 'retailer_location_missing_geocode|loc_missing' },
    req: { headers: { 'x-pricer-operator-id': 'ops' } },
  });
  const diagnostic = response.body.diagnostics[0];

  assert.equal(response.status, 200);
  assert.equal(diagnostic.winner, 'unavailable');
  assert.equal(diagnostic.winning_coordinate, null);
  assert.equal(diagnostic.reason, 'no reviewed or matched provider coordinates available');
});

test('reviewed coordinate admin API lists active and superseded coordinates and fetches detail', async () => {
  const store = new InMemoryDataBackboneStore(baseState());
  await buildLocationReviewCandidates({ store });
  const candidateId = buildLocationReviewCandidateId(
    'retailer_location_geocode',
    'geo_low_confidence',
  );
  await reviewLocationCandidate({
    store,
    candidateId,
    decision: 'approved',
    reviewedBy: 'geo-admin',
    approvedLatitude: 43.215,
    approvedLongitude: 27.925,
    correctionReason: 'first_review',
    reviewedAt: '2026-04-28T11:00:00.000Z',
  });
  const firstPublish = await publishReviewedLocationCoordinates({ store });
  const first = firstPublish.coordinates.find((record) => record.source_candidate_id === candidateId);
  await reviewLocationCandidate({
    store,
    candidateId,
    decision: 'approved',
    reviewedBy: 'geo-admin',
    approvedLatitude: 43.216,
    approvedLongitude: 27.926,
    correctionReason: 'second_review',
    reviewedAt: '2026-04-28T12:00:00.000Z',
  });
  const secondPublish = await publishReviewedLocationCoordinates({ store });
  const activeRecord = secondPublish.coordinates
    .find((record) => record.source_candidate_id === candidateId && record.is_active === true);

  const active = await handleListReviewedLocationCoordinatesRequest({
    store,
    body: { status: 'active' },
    req: { headers: { 'x-pricer-admin-id': 'geo-admin' } },
  });
  const superseded = await handleListReviewedLocationCoordinatesRequest({
    store,
    body: { status: 'superseded' },
    req: { headers: { 'x-pricer-admin-id': 'geo-admin' } },
  });
  const detail = await handleGetReviewedLocationCoordinateRequest({
    store,
    params: { id: activeRecord.reviewed_coordinate_id },
    req: { headers: { 'x-pricer-operator-id': 'ops' } },
  });

  assert.equal(active.status, 200);
  assert.equal(active.body.coordinates.length, 1);
  assert.equal(active.body.coordinates[0].reviewed_coordinate_id, activeRecord.reviewed_coordinate_id);
  assert.equal(superseded.status, 200);
  assert.equal(superseded.body.coordinates.length, 1);
  assert.equal(superseded.body.coordinates[0].reviewed_coordinate_id, first.reviewed_coordinate_id);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.coordinate.reviewed_coordinate_id, activeRecord.reviewed_coordinate_id);
});

test('reviewed coordinate diagnostics and read APIs require admin identity', async () => {
  const store = new InMemoryDataBackboneStore(baseState());
  const list = await handleListReviewedLocationCoordinatesRequest({
    store,
    body: {},
    req: { headers: {} },
  });
  const detail = await handleGetReviewedLocationCoordinateRequest({
    store,
    params: { id: 'reviewedloc_missing' },
    req: { headers: {} },
  });
  const diagnostics = await handleReviewedCoordinateDiagnosticsRequest({
    store,
    body: {},
    req: { headers: {} },
  });

  assert.equal(list.status, 403);
  assert.equal(detail.status, 403);
  assert.equal(diagnostics.status, 403);
  assert.equal(diagnostics.body.error, 'admin identity required');
});

test('reviewed coordinate rollout diagnostics count changed coordinates', () => {
  const state = baseState({
    retailer_location_geocodes: [
      geocode({
        geocode_id: 'geo_low_confidence',
        location_id: 'loc_low_confidence',
        status: 'matched',
        confidence: 0.9,
        latitude: 43.21,
        longitude: 27.91,
      }),
      geocode({
        geocode_id: 'geo_missing_now_matched',
        location_id: 'loc_missing',
        status: 'matched',
        confidence: 0.88,
        latitude: 42.14,
        longitude: 24.75,
      }),
    ],
    reviewed_location_coordinates: [
      reviewedCoordinate({
        location_id: 'loc_low_confidence',
        latitude: 43.215,
        longitude: 27.925,
      }),
    ],
  });
  const report = buildReviewedCoordinateRolloutDiagnostics({ state });

  assert.equal(report.default_coordinate_mode, 'provider_only');
  assert.equal(report.metrics.provider_only_result_count, 2);
  assert.equal(report.metrics.reviewed_first_result_count, 2);
  assert.equal(report.metrics.changed_coordinate_count, 1);
  assert.equal(report.metrics.distance_delta_km.count, 1);
  assert(report.metrics.distance_delta_km.max > 0);
  assert.equal(report.changed_coordinates[0].location_id, 'loc_low_confidence');
});

test('reviewed coordinate rollout diagnostics calculate high-reuse coverage', () => {
  const state = baseState({
    reviewed_location_coordinates: [
      reviewedCoordinate({
        reviewed_coordinate_id: 'reviewedloc_missing',
        source_id: 'loc_missing',
        source_type: 'retailer_location_missing_geocode',
        location_id: 'loc_missing',
        source_identity: 'retailer_location_missing_geocode|loc_missing',
        latitude: 42.141,
        longitude: 24.749,
        confidence: 0.8,
      }),
    ],
  });
  const report = buildReviewedCoordinateRolloutDiagnostics({ state });

  assert.equal(report.metrics.high_reuse_store_count, 2);
  assert.equal(report.metrics.high_reuse_reviewed_covered_count, 1);
  assert.equal(report.metrics.high_reuse_reviewed_coverage_rate, 0.5);
  assert.deepEqual(report.metrics.reviewed_coordinate_confidence_distribution, {
    high: 0,
    medium: 1,
    low: 0,
    very_low: 0,
    unknown: 0,
  });
});

test('reviewed coordinate rollout diagnostics preserve provider-only default', () => {
  const report = buildReviewedCoordinateRolloutDiagnostics({ state: baseState() });

  assert.equal(DEFAULT_COORDINATE_MODE, 'provider_only');
  assert.equal(report.default_coordinate_mode, 'provider_only');
  assert.equal(report.compared_coordinate_modes.includes('reviewed_first'), true);
});

test('reviewed coordinate rollout diagnostics API requires admin identity', async () => {
  const store = new InMemoryDataBackboneStore(baseState());
  const response = await handleReviewedCoordinateRolloutDiagnosticsRequest({
    store,
    body: {},
    req: { headers: {} },
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.error, 'admin identity required');
});

async function run() {
  let failed = 0;

  for (const entry of tests) {
    try {
      await entry.fn();
      console.log(`PASS ${entry.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${entry.name}`);
      console.error(error.stack);
    }
  }

  console.log(`\nPhase 6 location-review tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
