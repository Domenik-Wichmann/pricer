const crypto = require('node:crypto');

const STORE_LOCATION_RULES_VERSION = 'store-location-extraction-v1';
const STORE_LOCATION_SOURCE = 'kolkostruva_snapshot';
const DEFAULT_COUNTRY = 'BG';

const ADDRESS_MARKER_PATTERN = /(?:\b(?:ul|str|strasse|straße|street|road|rd|avenue|ave|blvd|boulevard|platz|pl)\.?\b|(?:ул|бул|булевард|жк|ж\.к|кв|пл|площад)\.?)|\d{1,4}/iu;
const STRONG_ADDRESS_MARKER_PATTERN = /(?:\b(?:ul|str|strasse|straße|street|road|rd|avenue|ave|blvd|boulevard|platz|pl)\.?\b|(?:ул|бул|булевард|жк|ж\.к|кв|пл|площад)\.?)/iu;
const CITY_MARKER_PATTERN = /(?:^|[\s,/.-])(?:гр\.|гр\s+|град\s+)([A-ZА-Я\u0400-\u04ff][\p{L}\p{M}.' -]{1,48}?)(?=,|\/|-|\s+(?:ул|бул|жк|ж\.к|кв|пл|площад)\.?|$)/iu;
const BG_SETTLEMENT_MARKER_PATTERN = /(?:^|[\s,/.-])(?:с\.|с\s+|село\s+)([A-ZА-Я\u0400-\u04ff][\p{L}\p{M}.' -]{1,48}?)(?=,|\/|-|\s+(?:ул|бул|жк|ж\.к|кв|пл|площад)\.?|$)/iu;

function buildRetailerLocationsFromState({
  state,
  extractedAt = new Date().toISOString(),
} = {}) {
  const snapshots = Array.isArray(state?.raw_price_snapshots) ? state.raw_price_snapshots : [];
  const sourceProductIndex = new Map(
    (Array.isArray(state?.source_products) ? state.source_products : [])
      .map((product) => [product.source_product_id, product])
  );
  const buckets = new Map();

  snapshots.forEach((snapshot) => {
    const sourceProduct = sourceProductIndex.get(snapshot.source_product_id) || null;
    const candidate = buildRetailerLocationCandidate({
      snapshot,
      sourceProduct,
      extractedAt,
    });
    if (!candidate) {
      return;
    }

    const existing = buckets.get(candidate.location_id);
    buckets.set(candidate.location_id, existing
      ? mergeRetailerLocation(existing, candidate)
      : candidate);
  });

  return [...buckets.values()].sort((left, right) => left.location_id.localeCompare(right.location_id));
}

function buildRetailerLocationCandidate({
  snapshot,
  sourceProduct = null,
  extractedAt = new Date().toISOString(),
}) {
  const storeNameRaw = normalizeWhitespace(snapshot?.store_name_raw || sourceProduct?.store_name_raw || '');
  if (!storeNameRaw) {
    return null;
  }

  const localityCode = normalizeWhitespace(snapshot?.locality_code || sourceProduct?.locality_code || '');
  const chainNameRaw = normalizeWhitespace(
    sourceProduct?.source_chain_name_raw ||
    snapshot?.source_chain_name_raw ||
    sourceProduct?.source_chain_name_normalized ||
    snapshot?.source_chain_name_normalized ||
    storeNameRaw
  );
  const chainNameNormalized = normalizeDisplayName(
    sourceProduct?.source_chain_name_normalized ||
    snapshot?.source_chain_name_normalized ||
    chainNameRaw
  );
  const storeNameNormalized = normalizeDisplayName(storeNameRaw);
  const chainId = normalizeIdentifier(chainNameNormalized || chainNameRaw);
  const locationId = buildRetailerLocationId({
    localityCode,
    chainId,
    storeNameNormalized,
  });
  const parsed = parseStoreLocationText(storeNameRaw);
  const firstSeenDate = snapshot?.snapshot_date || sourceProduct?.first_seen_date || null;
  const lastSeenDate = snapshot?.snapshot_date || sourceProduct?.last_seen_date || null;

  return {
    location_id: locationId,
    chain_id: chainId || null,
    chain_name_raw: chainNameRaw || null,
    chain_name_normalized: chainNameNormalized || null,
    store_name_raw: storeNameRaw,
    store_name_normalized: storeNameNormalized || null,
    branch_name: parsed.branch_name,
    raw_address: parsed.raw_address,
    city: parsed.city,
    locality_code: localityCode || null,
    country: DEFAULT_COUNTRY,
    latitude: null,
    longitude: null,
    source: STORE_LOCATION_SOURCE,
    confidence: parsed.confidence,
    confidence_reason: parsed.confidence_reason,
    extraction_method: 'deterministic_store_name_parse',
    rules_version: STORE_LOCATION_RULES_VERSION,
    needs_geocoding: Boolean(parsed.raw_address || parsed.city),
    provenance: {
      source_file_name: snapshot?.source_file_name || null,
      source_file_name_raw: snapshot?.source_file_name_raw || sourceProduct?.source_file_name_raw || null,
      source_file_stem: snapshot?.source_file_stem || sourceProduct?.source_file_stem || null,
      source_file_numeric_id: snapshot?.source_file_numeric_id || sourceProduct?.source_file_numeric_id || null,
      source_chain_name_raw: snapshot?.source_chain_name_raw || sourceProduct?.source_chain_name_raw || null,
      source_chain_name_normalized: snapshot?.source_chain_name_normalized || sourceProduct?.source_chain_name_normalized || null,
      snapshot_ids: snapshot?.snapshot_id ? [snapshot.snapshot_id] : [],
      source_product_ids: snapshot?.source_product_id ? [snapshot.source_product_id] : [],
      raw_store_names: [storeNameRaw],
    },
    first_seen_date: firstSeenDate,
    last_seen_date: lastSeenDate,
    snapshot_count: snapshot?.snapshot_id ? 1 : 0,
    source_product_count: snapshot?.source_product_id ? 1 : 0,
    extracted_at: extractedAt,
    updated_at: extractedAt,
  };
}

function parseStoreLocationText(value) {
  const raw = normalizeWhitespace(value);
  if (!raw) {
    return {
      branch_name: null,
      raw_address: null,
      city: null,
      confidence: 0,
      confidence_reason: 'empty_store_name',
    };
  }

  const city = extractCity(raw);
  const rawAddress = extractAddress(raw, city);
  const branchName = extractBranchName(raw, rawAddress);
  const hasStrongAddress = rawAddress && STRONG_ADDRESS_MARKER_PATTERN.test(rawAddress);
  const hasWeakAddress = rawAddress && ADDRESS_MARKER_PATTERN.test(rawAddress);
  const confidence = hasStrongAddress && city
    ? 0.88
    : hasStrongAddress
      ? 0.78
      : hasWeakAddress && city
        ? 0.72
        : city
          ? 0.58
          : 0.35;

  return {
    branch_name: branchName || null,
    raw_address: rawAddress || null,
    city: city || null,
    confidence,
    confidence_reason: confidence >= 0.8
      ? 'city_and_street_marker_found'
      : confidence >= 0.7
        ? 'address_marker_found'
        : confidence >= 0.5
          ? 'city_marker_found'
          : 'store_name_only',
  };
}

function extractCity(raw) {
  const markedCity = matchCity(raw, CITY_MARKER_PATTERN) || matchCity(raw, BG_SETTLEMENT_MARKER_PATTERN);
  if (markedCity) {
    return markedCity;
  }

  const slashParts = raw.split('/').map((part) => normalizeWhitespace(part)).filter(Boolean);
  if (slashParts.length === 2 && ADDRESS_MARKER_PATTERN.test(slashParts[1])) {
    const cityCandidate = slashParts[0].split('-').map((part) => normalizeWhitespace(part)).filter(Boolean).pop();
    if (looksLikeCityName(cityCandidate)) {
      return toTitleCase(cityCandidate);
    }
  }

  if (slashParts.length >= 3) {
    const cityCandidate = slashParts[slashParts.length - 2];
    if (looksLikeCityName(cityCandidate)) {
      return toTitleCase(cityCandidate);
    }
  }

  const commaParts = raw.split(',').map((part) => normalizeWhitespace(part)).filter(Boolean);
  if (commaParts.length >= 3) {
    const addressIndex = commaParts.findIndex((part) => ADDRESS_MARKER_PATTERN.test(part));
    if (addressIndex > 0) {
      const cityCandidate = commaParts[addressIndex - 1];
      if (looksLikeCityName(cityCandidate)) {
        return toTitleCase(cityCandidate);
      }
    }
  }

  if (commaParts.length >= 2 && STRONG_ADDRESS_MARKER_PATTERN.test(commaParts.slice(1).join(', '))) {
    const cityCandidate = commaParts[0].replace(/^(?:магазин|аптека|супермаркет|market|store)\s+/iu, '');
    const trailingCityCandidate = cityCandidate.split(' ').filter(Boolean).pop();
    if (looksLikeCityName(trailingCityCandidate) && /(?:market|store|магазин|аптека|супермаркет)/iu.test(cityCandidate)) {
      return toTitleCase(trailingCityCandidate);
    }
    if (looksLikeCityName(cityCandidate)) {
      return toTitleCase(cityCandidate);
    }
  }

  return null;
}

function matchCity(raw, pattern) {
  const match = raw.match(pattern);
  if (!match) {
    return null;
  }

  return toTitleCase(cleanCity(match[1]));
}

function extractAddress(raw, city) {
  const slashParts = raw.split('/').map((part) => normalizeWhitespace(part)).filter(Boolean);
  if (slashParts.length === 2 && ADDRESS_MARKER_PATTERN.test(slashParts[1])) {
    return stripLeadingCityFromAddress(normalizeWhitespace(slashParts[1]), city);
  }

  if (slashParts.length >= 3 && ADDRESS_MARKER_PATTERN.test(slashParts[slashParts.length - 1])) {
    return stripLeadingCityFromAddress(normalizeWhitespace(slashParts[slashParts.length - 1]), city);
  }

  const commaParts = raw.split(',').map((part) => normalizeWhitespace(part)).filter(Boolean);
  const commaAddressIndex = commaParts.findIndex((part) => STRONG_ADDRESS_MARKER_PATTERN.test(part) || /\d{1,4}/u.test(part));
  if (commaAddressIndex >= 0) {
    return stripLeadingCityFromAddress(
      normalizeWhitespace(commaParts.slice(commaAddressIndex).join(', ')),
      city,
    );
  }

  const markerIndex = findAddressMarkerIndex(raw);
  if (markerIndex >= 0) {
    return stripLeadingCityFromAddress(
      normalizeWhitespace(raw.slice(markerIndex).replace(/^[-,./\s]+/u, '')),
      city,
    );
  }

  if (city) {
    const cityIndex = raw.toLocaleLowerCase('bg-BG').indexOf(city.toLocaleLowerCase('bg-BG'));
    if (cityIndex >= 0) {
      const tail = stripLeadingCityFromAddress(normalizeWhitespace(raw.slice(cityIndex)), city);
      if (tail && tail !== city) {
        return tail;
      }
    }
  }

  return null;
}

function stripLeadingCityFromAddress(address, city) {
  const normalizedAddress = normalizeWhitespace(address);
  const normalizedCity = normalizeWhitespace(city);
  if (!normalizedAddress || !normalizedCity) {
    return normalizedAddress || null;
  }

  const cityPattern = escapeRegex(normalizedCity);
  const withoutCity = normalizedAddress
    .replace(new RegExp(`^(?:гр\\.?\\s*|град\\s+)?${cityPattern}(?=(?:\\s*[,/\\-]\\s*|\\s+(?:ул|бул|жк|ж\\.к|кв|пл|площад)\\.?|\\s+[A-Za-z\\u0400-\\u04ff].*\\d|$))`, 'iu'), '')
    .replace(/^[,/\-\s]+/u, '');

  return normalizeWhitespace(withoutCity) || normalizedAddress;
}

function findAddressMarkerIndex(raw) {
  const patterns = [
    /\b(?:ul|str|strasse|straße|street|road|rd|avenue|ave|blvd|boulevard|platz|pl)\.?\b/iu,
    /(?:ул|бул|булевард|жк|ж\.к|кв|пл|площад)\.?/iu,
  ];

  return patterns.reduce((best, pattern) => {
    const match = raw.match(pattern);
    if (!match || match.index === undefined) {
      return best;
    }

    return best === -1 ? match.index : Math.min(best, match.index);
  }, -1);
}

function extractBranchName(raw, rawAddress) {
  if (!rawAddress) {
    return raw;
  }

  const addressIndex = raw.indexOf(rawAddress);
  const branch = addressIndex >= 0 ? raw.slice(0, addressIndex) : raw.replace(rawAddress, '');
  return normalizeWhitespace(branch.replace(/[-,./\s]+$/u, '')) || raw;
}

function mergeRetailerLocation(left, right) {
  const snapshotIds = uniqueSorted([
    ...(left.provenance?.snapshot_ids || []),
    ...(right.provenance?.snapshot_ids || []),
  ]);
  const sourceProductIds = uniqueSorted([
    ...(left.provenance?.source_product_ids || []),
    ...(right.provenance?.source_product_ids || []),
  ]);
  const rawStoreNames = uniqueSorted([
    ...(left.provenance?.raw_store_names || []),
    ...(right.provenance?.raw_store_names || []),
  ]);
  const preferred = right.confidence > left.confidence ? right : left;

  return {
    ...left,
    branch_name: preferred.branch_name || left.branch_name || right.branch_name || null,
    raw_address: preferred.raw_address || left.raw_address || right.raw_address || null,
    city: preferred.city || left.city || right.city || null,
    confidence: Math.max(left.confidence || 0, right.confidence || 0),
    confidence_reason: preferred.confidence_reason || left.confidence_reason || right.confidence_reason,
    needs_geocoding: Boolean(left.needs_geocoding || right.needs_geocoding),
    provenance: {
      ...left.provenance,
      source_file_name: left.provenance?.source_file_name || right.provenance?.source_file_name || null,
      source_file_name_raw: left.provenance?.source_file_name_raw || right.provenance?.source_file_name_raw || null,
      source_file_stem: left.provenance?.source_file_stem || right.provenance?.source_file_stem || null,
      source_file_numeric_id: left.provenance?.source_file_numeric_id || right.provenance?.source_file_numeric_id || null,
      source_chain_name_raw: left.provenance?.source_chain_name_raw || right.provenance?.source_chain_name_raw || null,
      source_chain_name_normalized: left.provenance?.source_chain_name_normalized || right.provenance?.source_chain_name_normalized || null,
      snapshot_ids: snapshotIds.slice(0, 20),
      source_product_ids: sourceProductIds.slice(0, 20),
      raw_store_names: rawStoreNames.slice(0, 10),
    },
    first_seen_date: minDate(left.first_seen_date, right.first_seen_date),
    last_seen_date: maxDate(left.last_seen_date, right.last_seen_date),
    snapshot_count: snapshotIds.length,
    source_product_count: sourceProductIds.length,
    updated_at: maxDateTime(left.updated_at, right.updated_at),
  };
}

function buildRetailerLocationId({
  localityCode,
  chainId,
  storeNameNormalized,
}) {
  return crypto
    .createHash('sha256')
    .update([
      'retailer_location_v1',
      normalizeIdentifier(localityCode),
      chainId || '',
      storeNameNormalized || '',
    ].join('|'))
    .digest('hex');
}

function normalizeDisplayName(value) {
  return normalizeWhitespace(value).toLocaleLowerCase('bg-BG');
}

function normalizeIdentifier(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('bg-BG')
    .replace(/[^a-z0-9\u00c0-\u024f\u0400-\u04ff]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

function normalizeWhitespace(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .trim();
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function cleanCity(value) {
  return normalizeWhitespace(value)
    .replace(/\s+(?:ул|бул|жк|ж\.к|кв|пл|площад)\.? .*$/iu, '')
    .replace(/[,.\/-]+$/u, '')
    .trim();
}

function looksLikeCityName(value) {
  const normalized = normalizeWhitespace(value);
  return normalized.length >= 2 &&
    normalized.length <= 50 &&
    /[\p{L}]/u.test(normalized) &&
    !STRONG_ADDRESS_MARKER_PATTERN.test(normalized) &&
    !/^\d+$/u.test(normalized);
}

function toTitleCase(value) {
  return normalizeWhitespace(value)
    .split(' ')
    .map((part) => {
      if (part === part.toUpperCase() || part === part.toLowerCase()) {
        return part.slice(0, 1).toLocaleUpperCase('bg-BG') + part.slice(1).toLocaleLowerCase('bg-BG');
      }

      return part;
    })
    .join(' ');
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort();
}

function minDate(left, right) {
  if (!left) return right || null;
  if (!right) return left || null;
  return String(left) <= String(right) ? left : right;
}

function maxDate(left, right) {
  if (!left) return right || null;
  if (!right) return left || null;
  return String(left) >= String(right) ? left : right;
}

function maxDateTime(left, right) {
  return maxDate(left, right);
}

module.exports = {
  DEFAULT_COUNTRY,
  STORE_LOCATION_RULES_VERSION,
  STORE_LOCATION_SOURCE,
  buildRetailerLocationCandidate,
  buildRetailerLocationId,
  buildRetailerLocationsFromState,
  parseStoreLocationText,
};
