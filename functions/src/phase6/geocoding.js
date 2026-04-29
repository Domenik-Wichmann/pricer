const crypto = require('node:crypto');

const GEOCODING_RULES_VERSION = 'store-location-geocoding-v1';
const MANUAL_ADDRESS_GEOCODING_RULES_VERSION = 'manual-address-geocoding-v1';
const DEFAULT_GEOCODING_PROVIDER = 'fake';
const GEOCODING_STATUSES = Object.freeze(['pending', 'matched', 'ambiguous', 'failed', 'skipped']);
const MANUAL_ADDRESS_GEOCODING_STATUSES = Object.freeze(['matched', 'ambiguous', 'failed', 'skipped', 'invalid_input']);

async function geocodeRetailerLocations({
  store,
  provider,
  geocodedAt = new Date().toISOString(),
  limit = 100,
} = {}) {
  if (!store || typeof store.load !== 'function' || typeof store.save !== 'function') {
    throw new Error('store with load/save is required');
  }

  const state = await store.load();
  const result = await geocodeRetailerLocationsInState({
    state,
    provider,
    geocodedAt,
    limit,
  });
  await store.save(state);
  return {
    ...result,
    state,
  };
}

async function geocodeManualAddress({
  store,
  input = {},
  provider,
  geocodedAt = new Date().toISOString(),
} = {}) {
  if (!store || typeof store.load !== 'function' || typeof store.save !== 'function') {
    throw new Error('store with load/save is required');
  }

  const state = await store.load();
  const result = await geocodeManualAddressInState({
    state,
    input,
    provider,
    geocodedAt,
  });
  await store.save(state);
  return result;
}

async function handleManualAddressGeocodeRequest({
  store,
  body = {},
  req,
  provider,
} = {}) {
  const userId = resolveUserIdFromRequest(req);
  if (!userId) {
    return {
      status: 400,
      body: {
        error: 'x-pricer-owner-id is required',
      },
    };
  }

  const result = await geocodeManualAddress({
    store,
    input: {
      ...body,
      user_id: userId,
    },
    provider,
  });
  return {
    status: result.status === 'invalid_input' ? 400 : 200,
    body: result,
  };
}

async function geocodeManualAddressInState({
  state,
  input = {},
  provider,
  geocodedAt = new Date().toISOString(),
} = {}) {
  if (!state) {
    throw new Error('state is required');
  }

  state.manual_location_geocodes = Array.isArray(state.manual_location_geocodes)
    ? state.manual_location_geocodes
    : [];

  const normalized = normalizeManualGeocodeInput(input);
  if (normalized.error) {
    return normalized.error;
  }

  const request = normalized.value;
  const cacheKey = buildManualAddressGeocodingCacheKey(request);
  const geocodeId = buildManualAddressGeocodeId(cacheKey);
  const queryText = buildManualAddressGeocodingQueryText(request);
  const cached = state.manual_location_geocodes
    .find((record) => record.cache_key === cacheKey && record.status !== 'pending');
  if (cached) {
    return {
      status: cached.status,
      cache_hit: true,
      geocode: clone(cached),
    };
  }

  if (!queryText) {
    const skipped = buildManualAddressSkippedRecord({
      request,
      cacheKey,
      geocodeId,
      queryText,
      geocodedAt,
      reason: 'missing_address',
    });
    upsertManualGeocodeRecord(state, skipped);
    return {
      status: 'skipped',
      cache_hit: false,
      geocode: clone(skipped),
    };
  }

  const geocoder = provider || createFakeGeocodingProvider();
  let providerResult;
  try {
    providerResult = await geocoder.geocode({
      queryText,
      cacheKey,
      location: {
        location_id: geocodeId,
        country: request.country,
        city: request.city,
        raw_address: request.address_raw,
      },
    });
  } catch (error) {
    const failed = buildManualAddressFailedRecord({
      request,
      cacheKey,
      geocodeId,
      queryText,
      geocodedAt,
      providerName: geocoder.provider || DEFAULT_GEOCODING_PROVIDER,
      reason: error.message || 'provider_error',
    });
    upsertManualGeocodeRecord(state, failed);
    return {
      status: 'failed',
      cache_hit: false,
      geocode: clone(failed),
    };
  }

  const record = buildManualAddressGeocodeRecordFromProviderResult({
    request,
    cacheKey,
    geocodeId,
    queryText,
    providerResult,
    geocodedAt,
    providerName: geocoder.provider || DEFAULT_GEOCODING_PROVIDER,
  });
  upsertManualGeocodeRecord(state, record);
  return {
    status: record.status,
    cache_hit: false,
    geocode: clone(record),
  };
}

async function geocodeRetailerLocationsInState({
  state,
  provider,
  geocodedAt = new Date().toISOString(),
  limit = 100,
} = {}) {
  if (!state) {
    throw new Error('state is required');
  }

  const geocoder = provider || createFakeGeocodingProvider();
  const locations = Array.isArray(state.retailer_locations) ? state.retailer_locations : [];
  const existingRecords = Array.isArray(state.retailer_location_geocodes)
    ? state.retailer_location_geocodes
    : [];
  const cacheByKey = new Map(existingRecords.map((record) => [record.cache_key, record]));
  const recordsById = new Map(existingRecords.map((record) => [record.geocode_id, record]));
  const metrics = {
    considered: 0,
    matched: 0,
    ambiguous: 0,
    failed: 0,
    skipped: 0,
    cache_hits: 0,
    provider_calls: 0,
  };

  for (const location of locations) {
    if (metrics.considered >= limit) {
      break;
    }

    metrics.considered += 1;
    const cacheKey = buildGeocodingCacheKey(location);
    const geocodeId = buildGeocodeId(cacheKey);
    const queryText = buildGeocodingQueryText(location);

    if (!shouldAttemptGeocoding(location, queryText)) {
      const skipped = buildSkippedRecord({
        location,
        cacheKey,
        geocodeId,
        queryText,
        geocodedAt,
      });
      recordsById.set(geocodeId, skipped);
      cacheByKey.set(cacheKey, skipped);
      metrics.skipped += 1;
      continue;
    }

    const cached = cacheByKey.get(cacheKey);
    if (cached && cached.status === 'matched') {
      const reused = buildCachedReuseRecord({
        cached,
        location,
        geocodedAt,
      });
      recordsById.set(reused.geocode_id, reused);
      cacheByKey.set(cacheKey, reused);
      metrics.cache_hits += 1;
      metrics.matched += 1;
      continue;
    }

    let providerResult;
    try {
      metrics.provider_calls += 1;
      providerResult = await geocoder.geocode({
        queryText,
        location,
        cacheKey,
      });
    } catch (error) {
      const failed = buildFailedRecord({
        location,
        cacheKey,
        geocodeId,
        queryText,
        geocodedAt,
        reason: error.message || 'provider_error',
      });
      recordsById.set(geocodeId, failed);
      cacheByKey.set(cacheKey, failed);
      metrics.failed += 1;
      continue;
    }

    const record = buildGeocodeRecordFromProviderResult({
      location,
      cacheKey,
      geocodeId,
      queryText,
      providerResult,
      geocodedAt,
      providerName: geocoder.provider || DEFAULT_GEOCODING_PROVIDER,
    });
    recordsById.set(record.geocode_id, record);
    cacheByKey.set(cacheKey, record);

    if (record.status === 'matched') {
      metrics.matched += 1;
    } else if (record.status === 'ambiguous') {
      metrics.ambiguous += 1;
    } else if (record.status === 'failed') {
      metrics.failed += 1;
    } else if (record.status === 'skipped') {
      metrics.skipped += 1;
    }
  }

  state.retailer_location_geocodes = [...recordsById.values()]
    .sort((left, right) => left.geocode_id.localeCompare(right.geocode_id));

  return {
    metrics,
    records: state.retailer_location_geocodes,
  };
}

function buildGeocodeRecordFromProviderResult({
  location,
  cacheKey,
  geocodeId,
  queryText,
  providerResult,
  geocodedAt,
  providerName,
}) {
  const results = Array.isArray(providerResult?.results) ? providerResult.results : [];
  if (results.length === 0) {
    return buildFailedRecord({
      location,
      cacheKey,
      geocodeId,
      queryText,
      geocodedAt,
      reason: providerResult?.confidence_reason || 'no_provider_results',
      providerName,
    });
  }

  if (results.length > 1) {
    return buildBaseRecord({
      location,
      cacheKey,
      geocodeId,
      queryText,
      geocodedAt,
      providerName,
      status: 'ambiguous',
      confidence: 0,
      confidenceReason: providerResult?.confidence_reason || 'multiple_provider_results',
      providerPlaceId: null,
      formattedAddress: null,
      latitude: null,
      longitude: null,
      rawProviderResult: summarizeProviderResults(results),
    });
  }

  const result = results[0];
  const latitude = toFiniteNumber(result.latitude);
  const longitude = toFiniteNumber(result.longitude);
  if (latitude === null || longitude === null) {
    return buildFailedRecord({
      location,
      cacheKey,
      geocodeId,
      queryText,
      geocodedAt,
      reason: 'missing_coordinates',
      providerName,
      rawProviderResult: result,
    });
  }

  return buildBaseRecord({
    location,
    cacheKey,
    geocodeId,
    queryText,
    geocodedAt,
    providerName,
    status: 'matched',
    confidence: clampConfidence(result.confidence),
    confidenceReason: result.confidence_reason || 'single_provider_match',
    providerPlaceId: normalizeNullableString(result.provider_place_id),
    formattedAddress: normalizeNullableString(result.formatted_address),
    latitude,
    longitude,
    rawProviderResult: result.raw_provider_result || result,
  });
}

function buildManualAddressGeocodeRecordFromProviderResult({
  request,
  cacheKey,
  geocodeId,
  queryText,
  providerResult,
  geocodedAt,
  providerName,
}) {
  const results = Array.isArray(providerResult?.results) ? providerResult.results : [];
  if (results.length === 0) {
    return buildManualAddressFailedRecord({
      request,
      cacheKey,
      geocodeId,
      queryText,
      geocodedAt,
      providerName,
      reason: providerResult?.confidence_reason || 'no_provider_results',
    });
  }

  if (results.length > 1) {
    return buildManualAddressBaseRecord({
      request,
      cacheKey,
      geocodeId,
      queryText,
      geocodedAt,
      providerName,
      status: 'ambiguous',
      confidence: 0,
      confidenceReason: providerResult?.confidence_reason || 'multiple_provider_results',
      providerPlaceId: null,
      formattedAddress: null,
      latitude: null,
      longitude: null,
      rawProviderResult: summarizeProviderResults(results),
    });
  }

  const result = results[0];
  const latitude = toFiniteNumber(result.latitude);
  const longitude = toFiniteNumber(result.longitude);
  if (latitude === null || longitude === null) {
    return buildManualAddressFailedRecord({
      request,
      cacheKey,
      geocodeId,
      queryText,
      geocodedAt,
      providerName,
      reason: 'missing_coordinates',
      rawProviderResult: result,
    });
  }

  return buildManualAddressBaseRecord({
    request,
    cacheKey,
    geocodeId,
    queryText,
    geocodedAt,
    providerName,
    status: 'matched',
    confidence: clampConfidence(result.confidence),
    confidenceReason: result.confidence_reason || 'single_provider_match',
    providerPlaceId: normalizeNullableString(result.provider_place_id),
    formattedAddress: normalizeNullableString(result.formatted_address),
    latitude,
    longitude,
    rawProviderResult: result.raw_provider_result || result,
  });
}

function buildSkippedRecord({
  location,
  cacheKey,
  geocodeId,
  queryText,
  geocodedAt,
}) {
  return buildBaseRecord({
    location,
    cacheKey,
    geocodeId,
    queryText,
    geocodedAt,
    providerName: null,
    status: 'skipped',
    confidence: 0,
    confidenceReason: 'missing_city_or_address',
    providerPlaceId: null,
    formattedAddress: null,
    latitude: null,
    longitude: null,
    rawProviderResult: null,
  });
}

function buildFailedRecord({
  location,
  cacheKey,
  geocodeId,
  queryText,
  geocodedAt,
  reason,
  providerName = null,
  rawProviderResult = null,
}) {
  return buildBaseRecord({
    location,
    cacheKey,
    geocodeId,
    queryText,
    geocodedAt,
    providerName,
    status: 'failed',
    confidence: 0,
    confidenceReason: reason || 'geocoding_failed',
    providerPlaceId: null,
    formattedAddress: null,
    latitude: null,
    longitude: null,
    rawProviderResult,
  });
}

function buildBaseRecord({
  location,
  cacheKey,
  geocodeId,
  queryText,
  geocodedAt,
  providerName,
  status,
  confidence,
  confidenceReason,
  providerPlaceId,
  formattedAddress,
  latitude,
  longitude,
  rawProviderResult,
}) {
  return {
    geocode_id: geocodeId,
    cache_key: cacheKey,
    location_id: location.location_id,
    provider: providerName,
    provider_place_id: providerPlaceId,
    query_text: queryText,
    formatted_address: formattedAddress,
    latitude,
    longitude,
    confidence,
    confidence_reason: confidenceReason,
    status,
    rules_version: GEOCODING_RULES_VERSION,
    provenance: {
      source: 'retailer_locations',
      location_id: location.location_id,
      country: location.country || null,
      city: location.city || null,
      raw_address: location.raw_address || null,
      chain_id: location.chain_id || null,
      chain_name_normalized: location.chain_name_normalized || null,
      store_name_raw: location.store_name_raw || null,
      store_name_normalized: location.store_name_normalized || null,
      branch_name: location.branch_name || null,
    },
    raw_provider_result: rawProviderResult,
    geocoded_at: geocodedAt,
    updated_at: geocodedAt,
  };
}

function buildManualAddressSkippedRecord({
  request,
  cacheKey,
  geocodeId,
  queryText,
  geocodedAt,
  reason,
}) {
  return buildManualAddressBaseRecord({
    request,
    cacheKey,
    geocodeId,
    queryText,
    geocodedAt,
    providerName: null,
    status: 'skipped',
    confidence: 0,
    confidenceReason: reason || 'manual_address_skipped',
    providerPlaceId: null,
    formattedAddress: null,
    latitude: null,
    longitude: null,
    rawProviderResult: null,
  });
}

function buildManualAddressFailedRecord({
  request,
  cacheKey,
  geocodeId,
  queryText,
  geocodedAt,
  providerName = null,
  reason,
  rawProviderResult = null,
}) {
  return buildManualAddressBaseRecord({
    request,
    cacheKey,
    geocodeId,
    queryText,
    geocodedAt,
    providerName,
    status: 'failed',
    confidence: 0,
    confidenceReason: reason || 'manual_address_geocoding_failed',
    providerPlaceId: null,
    formattedAddress: null,
    latitude: null,
    longitude: null,
    rawProviderResult,
  });
}

function buildManualAddressBaseRecord({
  request,
  cacheKey,
  geocodeId,
  queryText,
  geocodedAt,
  providerName,
  status,
  confidence,
  confidenceReason,
  providerPlaceId,
  formattedAddress,
  latitude,
  longitude,
  rawProviderResult,
}) {
  return {
    geocode_id: geocodeId,
    cache_key: cacheKey,
    user_id: request.user_id,
    provider: providerName,
    provider_place_id: providerPlaceId,
    query_text: queryText,
    formatted_address: formattedAddress,
    latitude,
    longitude,
    confidence,
    confidence_reason: confidenceReason,
    status,
    rules_version: MANUAL_ADDRESS_GEOCODING_RULES_VERSION,
    provenance: {
      source: 'manual_address',
      user_id: request.user_id,
      country: request.country || null,
      city: request.city || null,
      address_raw: request.address_raw,
      display_name: request.display_name || null,
    },
    raw_provider_result: rawProviderResult,
    geocoded_at: geocodedAt,
    updated_at: geocodedAt,
  };
}

function buildCachedReuseRecord({
  cached,
  location,
  geocodedAt,
}) {
  const locationIds = [
    ...(Array.isArray(cached.provenance?.location_ids) ? cached.provenance.location_ids : []),
    cached.provenance?.location_id,
    location.location_id,
  ].filter(Boolean);

  return {
    ...cached,
    provenance: {
      ...cached.provenance,
      location_id: cached.provenance?.location_id || location.location_id,
      location_ids: [...new Set(locationIds)].sort(),
    },
    updated_at: geocodedAt,
  };
}

function shouldAttemptGeocoding(location, queryText) {
  return Boolean(
    location &&
    location.needs_geocoding === true &&
    queryText &&
    (normalizeNullableString(location.raw_address) || normalizeNullableString(location.city))
  );
}

function buildGeocodingQueryText(location) {
  if (!location) {
    return '';
  }

  const country = normalizeNullableString(location.country);
  const city = normalizeNullableString(location.city);
  const rawAddress = normalizeNullableString(location.raw_address);
  const identityHint = chooseLocationIdentityHint(location);

  return uniqueParts([
    country,
    city,
    rawAddress,
    identityHint,
  ]).join(', ');
}

function chooseLocationIdentityHint(location) {
  if (!location?.raw_address && !location?.city) {
    return null;
  }

  return normalizeNullableString(location.branch_name) ||
    normalizeNullableString(location.chain_name_raw) ||
    normalizeNullableString(location.store_name_raw);
}

function buildGeocodingCacheKey(location) {
  return crypto
    .createHash('sha256')
    .update([
      'retailer_location_geocode_v1',
      normalizeKeyPart(location?.country),
      normalizeKeyPart(location?.city),
      normalizeKeyPart(location?.raw_address),
      normalizeKeyPart(location?.store_name_normalized || location?.store_name_raw),
    ].join('|'))
    .digest('hex');
}

function buildGeocodeId(cacheKey) {
  return `geo_${cacheKey}`;
}

function buildManualAddressGeocodingQueryText(input) {
  return uniqueParts([
    normalizeNullableString(input?.country),
    normalizeNullableString(input?.city),
    normalizeNullableString(input?.address_raw),
  ]).join(', ');
}

function buildManualAddressGeocodingCacheKey(input) {
  return crypto
    .createHash('sha256')
    .update([
      'manual_location_geocode_v1',
      normalizeKeyPart(input?.country),
      normalizeKeyPart(input?.city),
      normalizeKeyPart(input?.address_raw),
    ].join('|'))
    .digest('hex');
}

function buildManualAddressGeocodeId(cacheKey) {
  return `manual_geo_${cacheKey}`;
}

function createFakeGeocodingProvider({
  responsesByCacheKey = {},
  responsesByQueryText = {},
  defaultResponse = null,
  provider = DEFAULT_GEOCODING_PROVIDER,
} = {}) {
  const calls = [];
  return {
    provider,
    calls,
    async geocode(request) {
      calls.push({
        cache_key: request.cacheKey,
        query_text: request.queryText,
        location_id: request.location?.location_id || null,
      });

      const response = responsesByCacheKey[request.cacheKey] ||
        responsesByQueryText[request.queryText] ||
        defaultResponse;
      if (response instanceof Error) {
        throw response;
      }

      return response || { results: [] };
    },
  };
}

function summarizeProviderResults(results) {
  return results.map((result) => ({
    provider_place_id: normalizeNullableString(result.provider_place_id),
    formatted_address: normalizeNullableString(result.formatted_address),
    latitude: toFiniteNumber(result.latitude),
    longitude: toFiniteNumber(result.longitude),
    confidence: clampConfidence(result.confidence),
    confidence_reason: normalizeNullableString(result.confidence_reason),
  }));
}

function uniqueParts(parts) {
  const seen = new Set();
  const values = [];
  parts.forEach((part) => {
    const normalized = normalizeNullableString(part);
    const key = normalizeKeyPart(normalized);
    if (!normalized || seen.has(key)) {
      return;
    }

    seen.add(key);
    values.push(normalized);
  });
  return values;
}

function normalizeNullableString(value) {
  const normalized = String(value || '')
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .trim();
  return normalized || null;
}

function normalizeKeyPart(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('bg-BG')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampConfidence(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.min(1, parsed));
}

function normalizeManualGeocodeInput(input) {
  const userId = normalizeNullableString(input?.user_id);
  if (!userId) {
    return {
      error: {
        status: 'invalid_input',
        cache_hit: false,
        error: 'user_id is required',
      },
    };
  }
  const addressRaw = normalizeNullableString(input?.address_raw || input?.raw_address || input?.address);
  if (!addressRaw || addressRaw.length < 4) {
    return {
      error: {
        status: 'invalid_input',
        cache_hit: false,
        error: 'address_raw is required',
      },
    };
  }
  return {
    value: {
      user_id: userId,
      address_raw: addressRaw,
      city: normalizeNullableString(input?.city),
      country: normalizeNullableString(input?.country) || 'BG',
      display_name: normalizeNullableString(input?.display_name),
    },
  };
}

function upsertManualGeocodeRecord(state, record) {
  const index = state.manual_location_geocodes
    .findIndex((existing) => existing.geocode_id === record.geocode_id);
  if (index >= 0) {
    state.manual_location_geocodes[index] = record;
  } else {
    state.manual_location_geocodes.push(record);
  }
  state.manual_location_geocodes = state.manual_location_geocodes
    .sort((left, right) => left.geocode_id.localeCompare(right.geocode_id));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function resolveUserIdFromRequest(req) {
  const headerValue = getRequestHeader(req, 'x-pricer-owner-id') ||
    getRequestHeader(req, 'x-pricer-user-id');
  return normalizeNullableString(headerValue);
}

function getRequestHeader(req, name) {
  if (!req) {
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

module.exports = {
  DEFAULT_GEOCODING_PROVIDER,
  GEOCODING_RULES_VERSION,
  GEOCODING_STATUSES,
  MANUAL_ADDRESS_GEOCODING_RULES_VERSION,
  MANUAL_ADDRESS_GEOCODING_STATUSES,
  buildGeocodeId,
  buildGeocodingCacheKey,
  buildGeocodingQueryText,
  buildManualAddressGeocodeId,
  buildManualAddressGeocodingCacheKey,
  buildManualAddressGeocodingQueryText,
  createFakeGeocodingProvider,
  geocodeManualAddress,
  geocodeManualAddressInState,
  geocodeRetailerLocations,
  geocodeRetailerLocationsInState,
  handleManualAddressGeocodeRequest,
};
