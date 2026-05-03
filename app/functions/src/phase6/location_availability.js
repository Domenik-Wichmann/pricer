const { searchCanonicalProductViews } = require('../phase15/readers');
const { buildRetailerLocationCandidate } = require('./store_locations');
const { resolveLocationForSearch } = require('./saved_user_locations');

const EARTH_RADIUS_KM = 6371.0088;
const DEFAULT_RADIUS_KM = 10;
const MAX_RADIUS_KM = 50;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const DEFAULT_SORT = 'nearest';
const DEFAULT_COORDINATE_MODE = 'provider_only';
const ALLOWED_LOCATION_AVAILABILITY_SORTS = Object.freeze(['nearest', 'cheapest', 'best_value']);
const LOCATION_COORDINATE_MODES = Object.freeze(['provider_only', 'reviewed_first']);
const LOCATION_AVAILABILITY_STATUSES = Object.freeze([
  'matched',
  'no_nearby_stores',
  'no_geocoded_locations',
  'product_not_found',
  'invalid_location',
]);

function haversineDistanceKm(left, right) {
  const leftLat = Number(left?.latitude);
  const leftLon = Number(left?.longitude);
  const rightLat = Number(right?.latitude);
  const rightLon = Number(right?.longitude);
  if (!isValidLatitude(leftLat) || !isValidLongitude(leftLon) || !isValidLatitude(rightLat) || !isValidLongitude(rightLon)) {
    return null;
  }

  const dLat = toRadians(rightLat - leftLat);
  const dLon = toRadians(rightLon - leftLon);
  const lat1 = toRadians(leftLat);
  const lat2 = toRadians(rightLat);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return roundDistance(EARTH_RADIUS_KM * c);
}

function findNearestProductAvailability({
  state,
  queryText,
  canonicalProductId,
  latitude,
  longitude,
  radiusKm,
  limit = DEFAULT_LIMIT,
  sort,
  coordinateMode,
  env = process.env,
  userId,
  savedLocationId,
  label,
} = {}) {
  const resolvedLocation = resolveLocationForSearch({
    state,
    userId,
    latitude,
    longitude,
    radiusKm,
    sort,
    savedLocationId,
    label,
  });
  const options = normalizeLocationAvailabilityOptions({
    latitude: resolvedLocation.value.latitude,
    longitude: resolvedLocation.value.longitude,
    radiusKm: resolvedLocation.value.radius_km,
    limit,
    sort: resolvedLocation.value.sort,
    savedLocation: resolvedLocation.value.saved_location,
    locationSource: resolvedLocation.value.source,
    coordinateMode,
    env,
  });
  if (resolvedLocation.error) {
    return buildAvailabilityResponse({
      status: 'invalid_location',
      options: options.value,
      reason: resolvedLocation.error,
    });
  }
  if (options.error) {
    return buildAvailabilityResponse({
      status: 'invalid_location',
      options: options.value,
      reason: options.error,
    });
  }

  const productResolution = resolveRequestedCanonicalProduct({
    state,
    queryText,
    canonicalProductId,
  });
  if (!productResolution.product) {
    return buildAvailabilityResponse({
      status: 'product_not_found',
      options: options.value,
      productResolution,
    });
  }

  const allOffers = buildLocationAwareOffers({
    state,
    canonicalProduct: productResolution.product,
    origin: {
      latitude: options.value.latitude,
      longitude: options.value.longitude,
    },
    coordinateMode: options.value.coordinate_mode,
  });
  if (allOffers.length === 0) {
    return buildAvailabilityResponse({
      status: 'no_geocoded_locations',
      options: options.value,
      productResolution,
      totalGeocodedOfferCount: 0,
      coordinateSources: ['unavailable'],
    });
  }

  const nearbyOffers = allOffers
    .filter((offer) => offer.distance_km <= options.value.radius_km)
    .sort((left, right) => compareOffers(left, right, options.value.sort))
    .slice(0, options.value.limit);

  if (nearbyOffers.length === 0) {
    return buildAvailabilityResponse({
      status: 'no_nearby_stores',
      options: options.value,
      productResolution,
      totalGeocodedOfferCount: allOffers.length,
      coordinateSources: collectCoordinateSources(allOffers),
    });
  }

  return buildAvailabilityResponse({
    status: 'matched',
    options: options.value,
    productResolution,
    totalGeocodedOfferCount: allOffers.length,
    offers: nearbyOffers,
    coordinateSources: collectCoordinateSources(nearbyOffers),
  });
}

async function handleNearestProductAvailabilityRequest({
  store,
  body = {},
  req,
} = {}) {
  if (!store || typeof store.load !== 'function') {
    throw new Error('store with load is required');
  }
  if (store.isFirestoreBackboneStore && !body.state) {
    return {
      status: 503,
      body: {
        error: 'nearest availability requires a compact production read model',
        limitation: 'The legacy nearest-availability join needs mappings, latest snapshots, and location geocodes. It is disabled for large Firestore runtime data until a scoped availability read model is published.',
      },
    };
  }
  const state = await store.load();
  const response = findNearestProductAvailability({
    state,
    queryText: body.query || body.query_text,
    canonicalProductId: body.canonical_product_id,
    latitude: body.latitude,
    longitude: body.longitude,
    radiusKm: body.radius_km,
    limit: body.limit,
    sort: body.sort,
    coordinateMode: body.coordinate_mode || body.coordinateMode,
    userId: resolveUserIdFromRequest(req) || body.user_id,
    savedLocationId: body.saved_location_id,
    label: body.label,
  });
  const hasExplicitCoordinates = body.latitude !== undefined &&
    body.latitude !== null &&
    body.longitude !== undefined &&
    body.longitude !== null;
  const missingSavedIdentity = !hasExplicitCoordinates &&
    (body.saved_location_id || body.label) &&
    !resolveUserIdFromRequest(req) &&
    !body.user_id;
  const invalidCoordinateMode = response.status === 'invalid_location' &&
    response.reason === 'coordinate_mode must be provider_only or reviewed_first';

  return {
    status: missingSavedIdentity || invalidCoordinateMode ? 400 : 200,
    body: missingSavedIdentity
      ? {
          error: 'x-pricer-owner-id is required for saved location search',
        }
      : response,
  };
}

function buildLocationAwareOffers({
  state,
  canonicalProduct,
  origin,
  coordinateMode = DEFAULT_COORDINATE_MODE,
}) {
  const sourceProductIds = new Set(canonicalProduct.source_product_ids || []);
  const sourceProductIndex = new Map((state?.source_products || []).map((row) => [row.source_product_id, row]));
  const latestSnapshots = buildLatestSnapshotsBySourceProduct(state?.raw_price_snapshots || []);
  const matchedGeocodesByLocationId = buildMatchedGeocodesByLocationId(state?.retailer_location_geocodes || []);
  const reviewedCoordinatesByLocationId = coordinateMode === 'reviewed_first'
    ? buildActiveReviewedCoordinatesByLocationId(state?.reviewed_location_coordinates || [])
    : new Map();
  const retailerLocationIndex = new Map((state?.retailer_locations || []).map((row) => [row.location_id, row]));

  return [...sourceProductIds]
    .map((sourceProductId) => {
      const snapshot = latestSnapshots.get(sourceProductId);
      const sourceProduct = sourceProductIndex.get(sourceProductId) || null;
      if (!snapshot) {
        return null;
      }

      const candidate = buildRetailerLocationCandidate({
        snapshot,
        sourceProduct,
        extractedAt: snapshot.ingested_at || snapshot.snapshot_date || new Date(0).toISOString(),
      });
      const locationId = candidate?.location_id || null;
      const geocode = locationId ? matchedGeocodesByLocationId.get(locationId) : null;
      const reviewedCoordinate = locationId ? reviewedCoordinatesByLocationId.get(locationId) : null;
      const coordinate = resolveAvailabilityCoordinate({
        coordinateMode,
        providerGeocode: geocode,
        reviewedCoordinate,
      });
      if (!coordinate) {
        return null;
      }

      const distanceKm = haversineDistanceKm(origin, {
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
      });
      const price = computeEffectivePrice(snapshot);
      if (distanceKm === null || price === null) {
        return null;
      }

      const retailerLocation = retailerLocationIndex.get(locationId) || candidate || {};
      return {
        source_product_id: sourceProductId,
        canonical_product_id: canonicalProduct.canonical_product_id,
        product_name_raw: sourceProduct?.latest_product_name_raw || snapshot.product_name_raw || null,
        chain_id: retailerLocation.chain_id || geocode?.provenance?.chain_id || null,
        chain_name: retailerLocation.chain_name_raw || retailerLocation.chain_name_normalized || null,
        store_name_raw: retailerLocation.store_name_raw || snapshot.store_name_raw || null,
        branch_name: retailerLocation.branch_name || null,
        location_id: locationId,
        geocode_id: geocode?.geocode_id || null,
        provider: geocode?.provider || null,
        provider_place_id: geocode?.provider_place_id || null,
        formatted_address: geocode?.formatted_address || reviewedCoordinate?.provenance?.formatted_address || null,
        reviewed_coordinate_id: coordinate.source === 'reviewed' ? reviewedCoordinate.reviewed_coordinate_id : null,
        coordinate_source: coordinate.source,
        coordinate_mode: coordinateMode,
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        distance_km: distanceKm,
        retail_price: Number(snapshot.retail_price),
        promo_price: Number(snapshot.promo_price),
        effective_price: price,
        currency: 'EUR',
        snapshot_date: snapshot.snapshot_date || null,
        provenance: {
          snapshot_id: snapshot.snapshot_id || null,
          source_product_id: sourceProductId,
          location_id: locationId,
          geocode_id: geocode?.geocode_id || null,
          geocode_status: geocode?.status || null,
          reviewed_coordinate_id: coordinate.source === 'reviewed' ? reviewedCoordinate.reviewed_coordinate_id : null,
          coordinate_source: coordinate.source,
          coordinate_mode: coordinateMode,
        },
      };
    })
    .filter(Boolean);
}

function resolveRequestedCanonicalProduct({
  state,
  queryText,
  canonicalProductId,
}) {
  const requestedCanonicalId = normalizeString(canonicalProductId);
  if (requestedCanonicalId) {
    const product = (state?.canonical_products || [])
      .find((row) => row.canonical_product_id === requestedCanonicalId);
    return {
      mode: 'canonical_product_id',
      query_text: null,
      canonical_product_id: requestedCanonicalId,
      product: product ? buildResolvedProductFromCanonical({ state, product }) : null,
    };
  }

  const normalizedQueryText = normalizeString(queryText);
  if (!normalizedQueryText) {
    return {
      mode: 'query_text',
      query_text: normalizedQueryText,
      canonical_product_id: null,
      product: null,
    };
  }

  const matches = searchCanonicalProductViews({
    state,
    queryText: normalizedQueryText,
    limit: 1,
  });
  const view = matches[0] || null;
  return {
    mode: 'query_text',
    query_text: normalizedQueryText,
    canonical_product_id: view?.canonical_product_id || null,
    product: view ? {
      canonical_product_id: view.canonical_product_id,
      canonical_name: view.canonical_truth?.canonical_display_name || null,
      source_product_ids: view.canonical_truth?.source_product_ids || [],
    } : null,
  };
}

function buildResolvedProductFromCanonical({
  state,
  product,
}) {
  const sourceProductIds = (state?.canonical_product_mappings || [])
    .filter((mapping) => mapping.canonical_product_id === product.canonical_product_id)
    .map((mapping) => mapping.source_product_id)
    .filter(Boolean)
    .sort();

  return {
    canonical_product_id: product.canonical_product_id,
    canonical_name: product.canonical_display_name || null,
    source_product_ids: [...new Set(sourceProductIds)],
  };
}

function buildAvailabilityResponse({
  status,
  options,
  reason = null,
  productResolution = null,
  totalGeocodedOfferCount = 0,
  offers = [],
  coordinateSources = null,
}) {
  return {
    status,
    reason,
    query: {
      mode: productResolution?.mode || null,
      query_text: productResolution?.query_text || null,
      canonical_product_id: productResolution?.canonical_product_id || null,
    },
    location: {
      latitude: options.latitude,
      longitude: options.longitude,
      radius_km: options.radius_km,
      source: options.location_source,
      saved_location_id: options.saved_location?.location_id || null,
      saved_location_label: options.saved_location?.label || null,
      saved_location_display_name: options.saved_location?.display_name || null,
      coordinate_mode: options.coordinate_mode,
    },
    sort: options.sort,
    limit: options.limit,
    product: productResolution?.product ? {
      canonical_product_id: productResolution.product.canonical_product_id,
      canonical_name: productResolution.product.canonical_name,
    } : null,
    coordinate_sources: coordinateSources || collectCoordinateSources(offers),
    total_geocoded_offer_count: totalGeocodedOfferCount,
    result_count: offers.length,
    offers,
  };
}

function normalizeLocationAvailabilityOptions({
  latitude,
  longitude,
  radiusKm,
  limit,
  sort,
  savedLocation,
  locationSource,
  coordinateMode,
  env = process.env,
}) {
  const requestedCoordinateMode = normalizeString(coordinateMode);
  const normalized = {
    latitude: Number(latitude),
    longitude: Number(longitude),
    radius_km: clampPositiveNumber(radiusKm, DEFAULT_RADIUS_KM, MAX_RADIUS_KM),
    limit: clampPositiveInteger(limit, DEFAULT_LIMIT, MAX_LIMIT),
    sort: ALLOWED_LOCATION_AVAILABILITY_SORTS.includes(sort) ? sort : DEFAULT_SORT,
    coordinate_mode: requestedCoordinateMode || resolveDefaultCoordinateMode(env),
    saved_location: savedLocation || null,
    location_source: locationSource || 'explicit',
  };

  if (!isValidLatitude(normalized.latitude) || !isValidLongitude(normalized.longitude)) {
    return {
      error: 'latitude and longitude must be valid numeric coordinates',
      value: normalized,
    };
  }
  if (requestedCoordinateMode && !LOCATION_COORDINATE_MODES.includes(requestedCoordinateMode)) {
    return {
      error: 'coordinate_mode must be provider_only or reviewed_first',
      value: normalized,
    };
  }

  return {
    value: normalized,
  };
}

function buildLatestSnapshotsBySourceProduct(rawPriceSnapshots) {
  const index = new Map();
  rawPriceSnapshots.forEach((row) => {
    const existing = index.get(row.source_product_id);
    if (!existing || compareSnapshotRecency(row, existing) > 0) {
      index.set(row.source_product_id, row);
    }
  });
  return index;
}

function resolveDefaultCoordinateMode(env = process.env) {
  const configured = normalizeString(env?.DEFAULT_COORDINATE_MODE);
  return LOCATION_COORDINATE_MODES.includes(configured)
    ? configured
    : DEFAULT_COORDINATE_MODE;
}

function buildMatchedGeocodesByLocationId(geocodes) {
  const index = new Map();
  geocodes
    .filter((row) => row?.status === 'matched')
    .forEach((row) => {
      if (!row.location_id || !isValidLatitude(Number(row.latitude)) || !isValidLongitude(Number(row.longitude))) {
        return;
      }

      const existing = index.get(row.location_id);
      if (!existing || String(row.updated_at || '') > String(existing.updated_at || '')) {
        index.set(row.location_id, row);
      }
    });
  return index;
}

function collectCoordinateSources(offers) {
  const sources = [...new Set((offers || [])
    .map((offer) => offer?.coordinate_source)
    .filter(Boolean))]
    .sort();
  return sources.length > 0 ? sources : [];
}

function buildActiveReviewedCoordinatesByLocationId(coordinates) {
  const index = new Map();
  coordinates
    .filter((row) => row?.is_active === true)
    .forEach((row) => {
      if (!row.location_id || !isValidLatitude(Number(row.latitude)) || !isValidLongitude(Number(row.longitude))) {
        return;
      }

      const existing = index.get(row.location_id);
      if (!existing || compareReviewedCoordinateRecency(row, existing) > 0) {
        index.set(row.location_id, row);
      }
    });
  return index;
}

function resolveAvailabilityCoordinate({
  coordinateMode,
  providerGeocode,
  reviewedCoordinate,
}) {
  if (
    coordinateMode === 'reviewed_first' &&
    reviewedCoordinate &&
    isValidLatitude(Number(reviewedCoordinate.latitude)) &&
    isValidLongitude(Number(reviewedCoordinate.longitude))
  ) {
    return {
      source: 'reviewed',
      latitude: Number(reviewedCoordinate.latitude),
      longitude: Number(reviewedCoordinate.longitude),
    };
  }

  if (
    providerGeocode &&
    providerGeocode.status === 'matched' &&
    isValidLatitude(Number(providerGeocode.latitude)) &&
    isValidLongitude(Number(providerGeocode.longitude))
  ) {
    return {
      source: 'provider',
      latitude: Number(providerGeocode.latitude),
      longitude: Number(providerGeocode.longitude),
    };
  }

  return null;
}

function compareReviewedCoordinateRecency(left, right) {
  const leftTime = String(left.approved_at || left.updated_at || left.published_at || '');
  const rightTime = String(right.approved_at || right.updated_at || right.published_at || '');
  const timeDelta = leftTime.localeCompare(rightTime);
  if (timeDelta !== 0) return timeDelta;
  return String(left.reviewed_coordinate_id || '').localeCompare(String(right.reviewed_coordinate_id || ''));
}

function compareOffers(left, right, sort) {
  if (sort === 'cheapest') {
    return compareNumbers(left.effective_price, right.effective_price) ||
      compareNumbers(left.distance_km, right.distance_km) ||
      compareStableOfferIds(left, right);
  }

  if (sort === 'best_value') {
    return compareNumbers(computeBestValueScore(left), computeBestValueScore(right)) ||
      compareNumbers(left.effective_price, right.effective_price) ||
      compareNumbers(left.distance_km, right.distance_km) ||
      compareStableOfferIds(left, right);
  }

  return compareNumbers(left.distance_km, right.distance_km) ||
    compareNumbers(left.effective_price, right.effective_price) ||
    compareStableOfferIds(left, right);
}

function computeBestValueScore(offer) {
  return roundDistance(Number(offer.effective_price) + Number(offer.distance_km) * 0.1);
}

function compareSnapshotRecency(left, right) {
  if (left.snapshot_date !== right.snapshot_date) {
    return String(left.snapshot_date || '').localeCompare(String(right.snapshot_date || ''));
  }

  return String(left.ingested_at || '').localeCompare(String(right.ingested_at || ''));
}

function computeEffectivePrice(snapshot) {
  const retailPrice = Number(snapshot.retail_price);
  const promoPrice = Number(snapshot.promo_price);
  if (Number.isFinite(promoPrice) && promoPrice > 0 && Number.isFinite(retailPrice) && promoPrice < retailPrice) {
    return promoPrice;
  }
  if (Number.isFinite(retailPrice) && retailPrice > 0) {
    return retailPrice;
  }

  return null;
}

function clampPositiveNumber(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function clampPositiveInteger(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function isValidLatitude(value) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function toRadians(value) {
  return value * Math.PI / 180;
}

function roundDistance(value) {
  return Math.round(value * 1000) / 1000;
}

function compareNumbers(left, right) {
  return Number(left) - Number(right);
}

function compareStableOfferIds(left, right) {
  return String(left.location_id).localeCompare(String(right.location_id)) ||
    String(left.source_product_id).localeCompare(String(right.source_product_id));
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
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

module.exports = {
  ALLOWED_LOCATION_AVAILABILITY_SORTS,
  DEFAULT_COORDINATE_MODE,
  DEFAULT_LIMIT,
  DEFAULT_RADIUS_KM,
  EARTH_RADIUS_KM,
  LOCATION_COORDINATE_MODES,
  LOCATION_AVAILABILITY_STATUSES,
  MAX_LIMIT,
  MAX_RADIUS_KM,
  buildLocationAwareOffers,
  findNearestProductAvailability,
  handleNearestProductAvailabilityRequest,
  haversineDistanceKm,
  resolveDefaultCoordinateMode,
};
