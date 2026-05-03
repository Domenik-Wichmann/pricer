const crypto = require('node:crypto');

const SAVED_LOCATION_LABELS = Object.freeze(['home', 'work', 'custom']);
const SAVED_LOCATION_SORTS = Object.freeze(['nearest', 'cheapest', 'best_value']);
const SAVED_LOCATION_SOURCES = Object.freeze(['manual', 'device', 'geocoded']);
const DEFAULT_RADIUS_KM = 10;
const MAX_RADIUS_KM = 50;
const DEFAULT_SORT = 'nearest';

async function upsertSavedUserLocation({
  store,
  input = {},
  savedAt = new Date().toISOString(),
} = {}) {
  requireStore(store);
  const normalized = normalizeSavedUserLocationInput(input, savedAt);
  if (normalized.error) {
    return normalized.error;
  }

  const state = await loadSavedUserLocationState(store, normalized.value.user_id);
  const record = upsertSavedUserLocationInState({
    state,
    input: normalized.value,
    savedAt: normalized.value.updated_at,
  });
  await persistSavedUserLocationState(store, state);
  return {
    status: 200,
    body: {
      location: clone(record),
    },
  };
}

async function handleListSavedUserLocationsRequest({
  store,
  req,
} = {}) {
  const userId = resolveUserIdFromRequest(req);
  if (!userId) {
    return userIdentityRequired();
  }
  return listSavedUserLocations({ store, userId });
}

async function handleUpsertSavedUserLocationRequest({
  store,
  body = {},
  req,
} = {}) {
  const userId = resolveUserIdFromRequest(req);
  if (!userId) {
    return userIdentityRequired();
  }
  return upsertSavedUserLocation({
    store,
    input: {
      ...body,
      user_id: userId,
    },
  });
}

async function handleDeleteSavedUserLocationRequest({
  store,
  params = {},
  req,
} = {}) {
  const userId = resolveUserIdFromRequest(req);
  if (!userId) {
    return userIdentityRequired();
  }
  return deleteSavedUserLocation({
    store,
    userId,
    locationId: params.id,
  });
}

function upsertSavedUserLocationInState({
  state,
  input,
  savedAt = new Date().toISOString(),
}) {
  if (!state) {
    throw new Error('state is required');
  }
  state.saved_user_locations = Array.isArray(state.saved_user_locations)
    ? state.saved_user_locations
    : [];

  const normalizedInput = input.location_id
    ? {
        ...input,
        updated_at: normalizeTimestamp(savedAt),
      }
    : {
        ...input,
        location_id: buildSavedUserLocationId(input),
        created_at: normalizeTimestamp(input.created_at || savedAt),
        updated_at: normalizeTimestamp(savedAt),
      };
  const existingIndex = state.saved_user_locations.findIndex((location) => {
    return location.location_id === normalizedInput.location_id ||
      (
        normalizedInput.label !== 'custom' &&
        location.user_id === normalizedInput.user_id &&
        location.label === normalizedInput.label
      );
  });
  const existing = existingIndex >= 0 ? state.saved_user_locations[existingIndex] : null;
  const record = {
    ...existing,
    ...normalizedInput,
    location_id: existing?.location_id || normalizedInput.location_id,
    created_at: existing?.created_at || normalizedInput.created_at,
    updated_at: normalizedInput.updated_at,
  };

  if (record.is_default) {
    state.saved_user_locations = state.saved_user_locations.map((location) => {
      if (location.user_id !== record.user_id || location.location_id === record.location_id) {
        return location;
      }

      return {
        ...location,
        is_default: false,
        updated_at: record.updated_at,
      };
    });
  }

  if (existingIndex >= 0) {
    state.saved_user_locations[existingIndex] = record;
  } else {
    state.saved_user_locations.push(record);
  }
  state.saved_user_locations = state.saved_user_locations.sort(compareSavedLocations);
  return record;
}

async function listSavedUserLocations({
  store,
  userId,
} = {}) {
  requireStore(store);
  const normalizedUserId = normalizeRequiredString(userId, 'user_id');
  if (normalizedUserId.error) {
    return normalizedUserId.error;
  }

  const state = await loadSavedUserLocationState(store, normalizedUserId.value);
  const locations = listSavedUserLocationsInState({
    state,
    userId: normalizedUserId.value,
  });
  return {
    status: 200,
    body: {
      locations,
      total: locations.length,
    },
  };
}

function listSavedUserLocationsInState({
  state,
  userId,
} = {}) {
  const normalizedUserId = normalizeString(userId);
  return (state?.saved_user_locations || [])
    .filter((location) => location.user_id === normalizedUserId)
    .sort(compareSavedLocations)
    .map((location) => clone(location));
}

async function deleteSavedUserLocation({
  store,
  userId,
  locationId,
} = {}) {
  requireStore(store);
  const normalizedUserId = normalizeRequiredString(userId, 'user_id');
  if (normalizedUserId.error) {
    return normalizedUserId.error;
  }
  const normalizedLocationId = normalizeRequiredString(locationId, 'location_id');
  if (normalizedLocationId.error) {
    return normalizedLocationId.error;
  }

  const state = await loadSavedUserLocationState(store, normalizedUserId.value);
  const deleted = deleteSavedUserLocationInState({
    state,
    userId: normalizedUserId.value,
    locationId: normalizedLocationId.value,
  });
  if (!deleted) {
    return {
      status: 404,
      body: {
        error: 'saved user location not found',
      },
    };
  }
  if (typeof store.deleteRecord === 'function') {
    await store.deleteRecord('saved_user_locations', normalizedLocationId.value);
  } else {
    await store.save(state);
  }
  return {
    status: 200,
    body: {
      deleted: true,
      location_id: normalizedLocationId.value,
    },
  };
}

function deleteSavedUserLocationInState({
  state,
  userId,
  locationId,
} = {}) {
  if (!state) {
    throw new Error('state is required');
  }
  const before = (state.saved_user_locations || []).length;
  state.saved_user_locations = (state.saved_user_locations || [])
    .filter((location) => !(location.user_id === userId && location.location_id === locationId));
  return state.saved_user_locations.length < before;
}

async function loadSavedUserLocationState(store, userId) {
  if (typeof store.queryCollection === 'function') {
    return {
      saved_user_locations: await store.queryCollection('saved_user_locations', {
        fieldName: 'user_id',
        value: userId,
      }),
    };
  }
  if (typeof store.loadCollections === 'function') {
    return store.loadCollections(['saved_user_locations']);
  }
  return store.load();
}

async function persistSavedUserLocationState(store, state) {
  if (typeof store.upsertRecord === 'function') {
    for (const location of state.saved_user_locations || []) {
      await store.upsertRecord('saved_user_locations', location);
    }
    return;
  }
  await store.save(state);
}

function resolveLocationForSearch({
  state,
  userId,
  latitude,
  longitude,
  radiusKm,
  sort,
  savedLocationId,
  label,
} = {}) {
  const explicitLatitude = Number(latitude);
  const explicitLongitude = Number(longitude);
  if (latitude !== undefined || longitude !== undefined) {
    if (!isValidLatitude(explicitLatitude) || !isValidLongitude(explicitLongitude)) {
      return {
        error: 'latitude and longitude must be valid numeric coordinates',
        status: 'invalid_location',
        value: buildResolvedLocationValue({
          latitude: explicitLatitude,
          longitude: explicitLongitude,
          radiusKm,
          sort,
          source: 'explicit',
        }),
      };
    }

    return {
      value: buildResolvedLocationValue({
        latitude: explicitLatitude,
        longitude: explicitLongitude,
        radiusKm,
        sort,
        source: 'explicit',
      }),
    };
  }

  const normalizedUserId = normalizeString(userId);
  if (!normalizedUserId) {
    return {
      error: 'user_id is required for saved location lookup',
      status: 'invalid_location',
      value: buildResolvedLocationValue({ radiusKm, sort, source: 'saved' }),
    };
  }

  const candidates = (state?.saved_user_locations || [])
    .filter((location) => location.user_id === normalizedUserId);
  let matches = [];
  const normalizedSavedLocationId = normalizeString(savedLocationId);
  const normalizedLabel = normalizeString(label).toLowerCase();
  if (normalizedSavedLocationId) {
    matches = candidates.filter((location) => location.location_id === normalizedSavedLocationId);
  } else if (normalizedLabel) {
    matches = candidates.filter((location) => location.label === normalizedLabel);
  } else {
    matches = candidates.filter((location) => location.is_default === true);
  }

  if (matches.length === 0) {
    return {
      error: 'saved location not found',
      status: 'invalid_location',
      value: buildResolvedLocationValue({ radiusKm, sort, source: 'saved' }),
    };
  }
  if (matches.length > 1) {
    return {
      error: 'saved location label is ambiguous',
      status: 'invalid_location',
      value: buildResolvedLocationValue({ radiusKm, sort, source: 'saved' }),
    };
  }

  const location = matches[0];
  return {
    value: buildResolvedLocationValue({
      latitude: location.latitude,
      longitude: location.longitude,
      radiusKm: radiusKm ?? location.default_radius_km,
      sort: sort || location.default_sort,
      source: 'saved',
      savedLocation: location,
    }),
  };
}

function buildResolvedLocationValue({
  latitude = null,
  longitude = null,
  radiusKm,
  sort,
  source,
  savedLocation = null,
}) {
  return {
    latitude: Number(latitude),
    longitude: Number(longitude),
    radius_km: normalizeRadius(radiusKm),
    sort: normalizeSort(sort),
    source,
    saved_location: savedLocation ? clone(savedLocation) : null,
  };
}

function normalizeSavedUserLocationInput(input, timestamp) {
  const userId = normalizeRequiredString(input?.user_id, 'user_id');
  if (userId.error) return userId;
  const label = normalizeLabel(input?.label);
  if (label.error) return label;
  const displayName = normalizeRequiredString(input?.display_name, 'display_name');
  if (displayName.error) return displayName;
  const latitude = normalizeLatitude(input?.latitude);
  if (latitude.error) return latitude;
  const longitude = normalizeLongitude(input?.longitude);
  if (longitude.error) return longitude;
  const source = normalizeSource(input?.source);
  if (source.error) return source;

  const now = normalizeTimestamp(timestamp);
  return {
    value: {
      location_id: normalizeString(input?.location_id) || null,
      user_id: userId.value,
      label: label.value,
      display_name: displayName.value,
      address_raw: normalizeOptionalString(input?.address_raw),
      latitude: latitude.value,
      longitude: longitude.value,
      default_radius_km: normalizeRadius(input?.default_radius_km),
      default_sort: normalizeSort(input?.default_sort),
      source: source.value,
      provider: normalizeOptionalString(input?.provider),
      provider_place_id: normalizeOptionalString(input?.provider_place_id),
      formatted_address: normalizeOptionalString(input?.formatted_address),
      confidence: normalizeOptionalConfidence(input?.confidence),
      confidence_reason: normalizeOptionalString(input?.confidence_reason),
      provenance: input?.provenance && typeof input.provenance === 'object' && !Array.isArray(input.provenance)
        ? clone(input.provenance)
        : null,
      is_default: input?.is_default === true,
      created_at: normalizeTimestamp(input?.created_at || now),
      updated_at: now,
    },
  };
}

function buildSavedUserLocationId(input) {
  return `userloc_${crypto
    .createHash('sha256')
    .update([
      'saved_user_location_v1',
      input.user_id,
      input.label,
      input.label === 'custom' ? input.display_name : input.label,
      input.label === 'custom' ? input.created_at : '',
    ].join('|'))
    .digest('hex')
    .slice(0, 32)}`;
}

function normalizeRequiredString(value, fieldName) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return {
      error: {
        status: 400,
        body: {
          error: `${fieldName} is required`,
        },
      },
    };
  }
  return { value: normalized };
}

function normalizeLabel(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (!SAVED_LOCATION_LABELS.includes(normalized)) {
    return badRequest('label must be home, work, or custom');
  }
  return { value: normalized };
}

function normalizeSource(value) {
  const normalized = normalizeString(value).toLowerCase() || 'manual';
  if (!SAVED_LOCATION_SOURCES.includes(normalized)) {
    return badRequest('source must be manual, device, or geocoded');
  }
  return { value: normalized };
}

function normalizeLatitude(value) {
  const parsed = Number(value);
  if (!isValidLatitude(parsed)) {
    return badRequest('latitude must be a valid coordinate');
  }
  return { value: parsed };
}

function normalizeLongitude(value) {
  const parsed = Number(value);
  if (!isValidLongitude(parsed)) {
    return badRequest('longitude must be a valid coordinate');
  }
  return { value: parsed };
}

function normalizeRadius(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_RADIUS_KM;
  }
  return Math.min(parsed, MAX_RADIUS_KM);
}

function normalizeSort(value) {
  const normalized = normalizeString(value);
  return SAVED_LOCATION_SORTS.includes(normalized) ? normalized : DEFAULT_SORT;
}

function normalizeOptionalConfidence(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(0, Math.min(1, parsed));
}

function normalizeOptionalString(value) {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isValidLatitude(value) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function compareSavedLocations(left, right) {
  if (Number(right.is_default) !== Number(left.is_default)) {
    return Number(right.is_default) - Number(left.is_default);
  }
  if (left.label !== right.label) {
    return left.label.localeCompare(right.label);
  }
  return String(left.location_id).localeCompare(String(right.location_id));
}

function normalizeTimestamp(value) {
  return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : new Date().toISOString();
}

function badRequest(error) {
  return {
    error: {
      status: 400,
      body: { error },
    },
  };
}

function requireStore(store) {
  if (!store || typeof store.load !== 'function' || typeof store.save !== 'function') {
    throw new Error('store with load/save is required');
  }
}

function resolveUserIdFromRequest(req) {
  const headerValue = getRequestHeader(req, 'x-pricer-owner-id') ||
    getRequestHeader(req, 'x-pricer-user-id');
  return normalizeString(headerValue);
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

function userIdentityRequired() {
  return {
    status: 400,
    body: {
      error: 'x-pricer-owner-id is required',
    },
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  DEFAULT_RADIUS_KM,
  DEFAULT_SORT,
  MAX_RADIUS_KM,
  SAVED_LOCATION_LABELS,
  SAVED_LOCATION_SORTS,
  SAVED_LOCATION_SOURCES,
  buildSavedUserLocationId,
  deleteSavedUserLocation,
  deleteSavedUserLocationInState,
  handleDeleteSavedUserLocationRequest,
  handleListSavedUserLocationsRequest,
  handleUpsertSavedUserLocationRequest,
  listSavedUserLocations,
  listSavedUserLocationsInState,
  resolveLocationForSearch,
  upsertSavedUserLocation,
  upsertSavedUserLocationInState,
};
