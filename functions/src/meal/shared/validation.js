function assertPlainObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
}

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }

  return value.trim();
}

function normalizeOptionalString(value, fieldName) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string or null`);
  }

  const normalized = value.trim();
  return normalized || null;
}

function normalizeStringArray(value, fieldName) {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  const seen = new Set();
  const normalized = [];
  value.forEach((entry) => {
    if (typeof entry !== 'string') {
      throw new Error(`${fieldName} must contain only strings`);
    }
    const trimmed = entry.trim();
    if (!trimmed) {
      return;
    }
    const dedupeKey = trimmed.toLocaleLowerCase('bg-BG');
    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      normalized.push(trimmed);
    }
  });

  return normalized;
}

function normalizeFiniteNumber(value, fieldName, {
  min = null,
  max = null,
  allowNull = false,
} = {}) {
  if (value === null || value === undefined) {
    if (allowNull) {
      return null;
    }
    throw new Error(`${fieldName} must be a finite number`);
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`);
  }

  if (min !== null && value < min) {
    throw new Error(`${fieldName} must be >= ${min}`);
  }
  if (max !== null && value > max) {
    throw new Error(`${fieldName} must be <= ${max}`);
  }

  return value;
}

function sortByKey(items, key) {
  return [...items].sort((left, right) => String(left[key]).localeCompare(String(right[key])));
}

function upsertByKey(items, nextItem, key) {
  const retained = (items || []).filter((entry) => entry[key] !== nextItem[key]);
  return sortByKey([...retained, nextItem], key);
}

module.exports = {
  assertNonEmptyString,
  assertPlainObject,
  normalizeFiniteNumber,
  normalizeOptionalString,
  normalizeStringArray,
  sortByKey,
  upsertByKey,
};
