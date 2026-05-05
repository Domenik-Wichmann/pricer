const PRODUCT_NAME_MAX_LENGTH = 220;
const FIELD_MAX_LENGTHS = Object.freeze({
  locality_code_raw: 32,
  store_name_raw: 180,
  product_code_raw: 48,
  category_code_raw: 32,
});
const REQUIRED_SOURCE_ROW_FIELDS = Object.freeze([
  'locality_code_raw',
  'store_name_raw',
  'product_name_raw',
  'product_code_raw',
  'category_code_raw',
]);
const PRODUCT_NAME_SAMPLE_LENGTH = 500;
const PRODUCT_QUALITY_STATUS = Object.freeze({
  VALID: 'valid',
  WARNING: 'warning',
  SUSPICIOUS: 'suspicious',
  INVALID: 'invalid',
});
const PRODUCT_QUARANTINE_SOURCE = 'phase6_bad_product_audit_v1';

function validateSourceRowForImport(sourceRow, {
  parseMetadata = null,
} = {}) {
  const reasons = [];
  REQUIRED_SOURCE_ROW_FIELDS.forEach((fieldName) => {
    if (!String(sourceRow?.[fieldName] || '').trim()) {
      reasons.push(`missing_${fieldName}`);
    }
  });

  if (parseMetadata?.has_column_count_mismatch) {
    reasons.push(
      parseMetadata.column_count < parseMetadata.expected_column_count
        ? 'too_few_columns'
        : 'too_many_columns'
    );
  }

  (parseMetadata?.malformed_reasons || []).forEach((reason) => {
    reasons.push(`csv_${reason}`);
  });

  Object.entries(FIELD_MAX_LENGTHS).forEach(([fieldName, maxLength]) => {
    const value = String(sourceRow?.[fieldName] || '');
    if (value.length > maxLength) {
      reasons.push(`${fieldName}_too_long`);
    }
    if (/[\r\n]/u.test(value)) {
      reasons.push(`${fieldName}_contains_newline`);
    }
  });

  if (!looksLikeSourceCode(sourceRow?.product_code_raw)) {
    reasons.push('invalid_product_code');
  }
  if (!looksLikeSourceCode(sourceRow?.category_code_raw)) {
    reasons.push('invalid_category_code');
  }

  const productNameValidation = validateProductName(sourceRow?.product_name_raw);
  reasons.push(...productNameValidation.reasons.map((reason) => `product_name_${reason}`));
  const qualityStatus = classifyProductQualityReasons(reasons);

  return {
    valid: qualityStatus !== PRODUCT_QUALITY_STATUS.INVALID,
    quality_status: qualityStatus,
    quarantinable: qualityStatus === PRODUCT_QUALITY_STATUS.INVALID,
    reasons: [...new Set(reasons)],
    sample: sampleText(sourceRow?.product_name_raw),
  };
}

function validateProductName(value) {
  const name = String(value || '').normalize('NFKC').trim();
  const reasons = [];
  if (!name) {
    reasons.push('missing');
    return {
      valid: false,
      quality_status: PRODUCT_QUALITY_STATUS.INVALID,
      quarantinable: true,
      reasons,
      sample: '',
    };
  }

  if (/[\r\n]/u.test(name)) {
    reasons.push('contains_newline');
  }
  if (name.length > PRODUCT_NAME_MAX_LENGTH) {
    reasons.push('too_long');
  }
  if ((name.match(/[;,]/gu) || []).length > 8) {
    reasons.push('too_many_delimiters');
  }
  if ((name.match(/"/gu) || []).length > 0) {
    reasons.push('contains_quote_fragment');
  }
  if (countMatches(name, /\b\d{4,}\b/gu) > 8) {
    reasons.push('too_many_code_like_tokens');
  }
  if (countMatches(name, /\b\d+[,.]\d{2}\b/gu) > 6) {
    reasons.push('too_many_price_like_tokens');
  }
  if (countMatches(name, /(?:^|[\r\n,;])\s*"?\d{3,5}\s*,\s*[^,\r\n]{2,80}\/[^,\r\n]{2,80},/gu) > 0) {
    reasons.push('contains_store_address_fragment');
  }
  if (countMatches(name, /,\s*"?\d{4,8}"?\s*,\s*"?\d{1,3}"?\s*,\s*"?\d+[,.]\d{2}"?/gu) > 0) {
    reasons.push('contains_row_value_fragment');
  }
  if (countMatches(name, /(?:^|[\r\n])"?\d{3,5}"?\s*,/gu) > 1) {
    reasons.push('multiple_csv_row_fragments');
  }
  if (looksLikeMultiProductChunk(name)) {
    reasons.push('obvious_multi_product_chunk');
  }

  const qualityStatus = classifyProductQualityReasons(reasons);
  return {
    valid: reasons.length === 0,
    quality_status: qualityStatus,
    quarantinable: qualityStatus === PRODUCT_QUALITY_STATUS.INVALID,
    reasons: [...new Set(reasons)],
    sample: sampleText(name),
  };
}

function validateCanonicalProductRecord(product) {
  const checks = [
    validateProductName(product?.canonical_display_name),
    validateProductName(product?.source_example_name),
  ];
  const reasons = checks.flatMap((check) => check.reasons);
  const qualityStatus = classifyProductQualityReasons(reasons);
  return {
    valid: qualityStatus === PRODUCT_QUALITY_STATUS.VALID,
    quality_status: qualityStatus,
    quarantinable: qualityStatus === PRODUCT_QUALITY_STATUS.INVALID,
    reasons: [...new Set(reasons)],
    sample: sampleText(product?.canonical_display_name || product?.source_example_name),
  };
}

function validateSourceProductRecord(product) {
  const check = validateProductName(product?.latest_product_name_raw);
  const qualityStatus = classifyProductQualityReasons(check.reasons);
  return {
    valid: qualityStatus === PRODUCT_QUALITY_STATUS.VALID,
    quality_status: qualityStatus,
    quarantinable: qualityStatus === PRODUCT_QUALITY_STATUS.INVALID,
    reasons: check.reasons,
    sample: check.sample,
  };
}

function validateCurrentOfferRecord(offer) {
  const checks = [
    validateProductName(offer?.source_product_name_raw),
    validateProductName(offer?.canonical_name),
  ];
  const reasons = checks.flatMap((check) => check.reasons);
  const qualityStatus = classifyProductQualityReasons(reasons);
  return {
    valid: qualityStatus === PRODUCT_QUALITY_STATUS.VALID,
    quality_status: qualityStatus,
    quarantinable: qualityStatus === PRODUCT_QUALITY_STATUS.INVALID,
    reasons: [...new Set(reasons)],
    sample: sampleText(offer?.canonical_name || offer?.source_product_name_raw),
  };
}

function isRuntimeSafeCanonicalProduct(product) {
  return !isDataQualityQuarantined(product) &&
    validateCanonicalProductRecord(product).quality_status !== PRODUCT_QUALITY_STATUS.INVALID;
}

function isRuntimeSafeSourceProduct(product) {
  return !isDataQualityQuarantined(product) &&
    validateSourceProductRecord(product).quality_status !== PRODUCT_QUALITY_STATUS.INVALID;
}

function isRuntimeSafeCurrentOffer(offer) {
  return !isDataQualityQuarantined(offer) &&
    validateCurrentOfferRecord(offer).quality_status !== PRODUCT_QUALITY_STATUS.INVALID;
}

function summarizeProductQualityReasons(record, type = 'canonical_product') {
  const validation = type === 'source_product'
    ? validateSourceProductRecord(record)
    : type === 'current_offer'
      ? validateCurrentOfferRecord(record)
      : validateCanonicalProductRecord(record);
  return {
    valid: validation.valid,
    quality_status: validation.quality_status,
    quarantinable: validation.quarantinable,
    reasons: validation.reasons,
    sample: validation.sample,
  };
}

function isDataQualityQuarantined(record) {
  return record?.data_quality_status === PRODUCT_QUALITY_STATUS.INVALID;
}

function classifyProductQualityReasons(reasons = []) {
  const reasonSet = new Set((reasons || []).filter(Boolean));
  if (reasonSet.size === 0) {
    return PRODUCT_QUALITY_STATUS.VALID;
  }

  if (hasInvalidReason(reasonSet)) {
    return PRODUCT_QUALITY_STATUS.INVALID;
  }

  if (hasSuspiciousReason(reasonSet)) {
    return PRODUCT_QUALITY_STATUS.SUSPICIOUS;
  }

  return PRODUCT_QUALITY_STATUS.WARNING;
}

function hasInvalidReason(reasonSet) {
  if (
    hasReason(reasonSet, 'missing') ||
    [...reasonSet].some((reason) => reason.startsWith('missing_')) ||
    hasReason(reasonSet, 'invalid_product_code') ||
    hasReason(reasonSet, 'invalid_category_code') ||
    hasReason(reasonSet, 'too_few_columns') ||
    hasReason(reasonSet, 'too_many_columns') ||
    hasReason(reasonSet, 'csv_unclosed_quote') ||
    hasReason(reasonSet, 'contains_newline') ||
    hasReason(reasonSet, 'contains_store_address_fragment') ||
    hasReason(reasonSet, 'multiple_csv_row_fragments') ||
    hasReason(reasonSet, 'obvious_multi_product_chunk')
  ) {
    return true;
  }

  const tooLong = hasReason(reasonSet, 'too_long');
  const tooManyDelimiters = hasReason(reasonSet, 'too_many_delimiters');
  if (tooLong && tooManyDelimiters) {
    return true;
  }

  const rowValue = hasReason(reasonSet, 'contains_row_value_fragment');
  if (rowValue && (
    hasReason(reasonSet, 'too_many_code_like_tokens') ||
    hasReason(reasonSet, 'too_many_price_like_tokens')
  )) {
    return true;
  }

  return false;
}

function hasSuspiciousReason(reasonSet) {
  return hasReason(reasonSet, 'contains_row_value_fragment') ||
    hasReason(reasonSet, 'too_many_delimiters') ||
    hasReason(reasonSet, 'too_long') ||
    hasReason(reasonSet, 'too_many_code_like_tokens') ||
    hasReason(reasonSet, 'too_many_price_like_tokens');
}

function hasReason(reasonSet, suffix) {
  return [...reasonSet].some((reason) => reason === suffix || reason.endsWith(`_${suffix}`));
}

function looksLikeSourceCode(value) {
  const text = String(value || '').trim();
  return Boolean(text) &&
    text.length <= 48 &&
    !/[\r\n,;"]/u.test(text) &&
    /^[\p{L}\p{N}._/-]+$/u.test(text);
}

function looksLikeMultiProductChunk(name) {
  const normalized = String(name || '').toLocaleLowerCase('bg-BG');
  const familyHits = [
    /\b(?:боб|beans?)\b/u,
    /\b(?:пюре|puree)\b/u,
    /\b(?:хляб|bread)\b/u,
    /\b(?:цигари|cigarettes?)\b/u,
    /\b(?:шунка|ham)\b/u,
    /\b(?:вода|water)\b/u,
    /\b(?:шампоан|shampoo)\b/u,
    /\b(?:colgate)\b/u,
    /\b(?:кафе|coffee)\b/u,
  ].filter((pattern) => pattern.test(normalized)).length;

  return familyHits >= 5 && (
    /[\r\n]/u.test(name) ||
    countMatches(name, /,\s*"?\d{4,8}"?\s*,\s*"?\d{1,3}"?\s*,/gu) > 1 ||
    name.length > PRODUCT_NAME_MAX_LENGTH
  );
}

function countMatches(value, pattern) {
  return (String(value || '').match(pattern) || []).length;
}

function sampleText(value) {
  const text = String(value || '').replace(/\s+/gu, ' ').trim();
  return text.length > PRODUCT_NAME_SAMPLE_LENGTH
    ? `${text.slice(0, PRODUCT_NAME_SAMPLE_LENGTH)}...`
    : text;
}

module.exports = {
  PRODUCT_QUALITY_STATUS,
  PRODUCT_QUARANTINE_SOURCE,
  PRODUCT_NAME_MAX_LENGTH,
  classifyProductQualityReasons,
  isDataQualityQuarantined,
  summarizeProductQualityReasons,
  validateCanonicalProductRecord,
  validateCurrentOfferRecord,
  validateProductName,
  validateSourceProductRecord,
  validateSourceRowForImport,
  isRuntimeSafeCanonicalProduct,
  isRuntimeSafeCurrentOffer,
  isRuntimeSafeSourceProduct,
};
