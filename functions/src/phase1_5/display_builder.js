const {
  DISPLAY_PREFIXES_EN,
  SUPPORTED_TRANSLATION_LANGS,
  UNIT_DISPLAY_MAP,
} = require('./constants');
const { buildCanonicalEn } = require('./canonical_en');

function buildDisplayEn(canonicalEn) {
  const parts = [];
  const prefix = DISPLAY_PREFIXES_EN[canonicalEn.product_type] || DISPLAY_PREFIXES_EN[canonicalEn.product_family] || null;

  if (prefix) {
    parts.push(prefix);
  }

  if (canonicalEn.brand) {
    parts.push(canonicalEn.brand);
  }

  if (typeof canonicalEn.fat_percent === 'number') {
    parts.push(formatFatPercent(canonicalEn.fat_percent));
  }

  if (typeof canonicalEn.size_value === 'number' && canonicalEn.size_unit) {
    parts.push(formatSize(canonicalEn.size_value, canonicalEn.size_unit));
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join(' ');
}

function buildEnglishMetadata(enrichment) {
  const canonicalEn = buildCanonicalEn(enrichment);
  const displayEn = buildDisplayEn(canonicalEn);

  return {
    canonical_en: canonicalEn,
    display_en: displayEn,
    i18n_status: displayEn ? 'complete' : 'pending',
    display: createDisplayStructure(displayEn),
    translation_status: createTranslationStatus(displayEn),
  };
}

function mergeEnglishMetadata(baseEnrichment, existingEnrichment = null) {
  const englishMetadata = buildEnglishMetadata(baseEnrichment);
  const mergedDisplay = {
    ...createDisplayStructure(englishMetadata.display_en),
    ...(existingEnrichment && existingEnrichment.display ? existingEnrichment.display : {}),
  };
  const mergedTranslationStatus = {
    ...createTranslationStatus(englishMetadata.display_en),
    ...(existingEnrichment && existingEnrichment.translation_status ? existingEnrichment.translation_status : {}),
  };

  if (existingEnrichment && Object.prototype.hasOwnProperty.call(existingEnrichment, 'display_en')) {
    englishMetadata.display_en = existingEnrichment.display_en;
  }

  if (existingEnrichment && Object.prototype.hasOwnProperty.call(existingEnrichment, 'canonical_en')) {
    englishMetadata.canonical_en = existingEnrichment.canonical_en;
  }

  if (existingEnrichment && Object.prototype.hasOwnProperty.call(existingEnrichment, 'i18n_status')) {
    englishMetadata.i18n_status = existingEnrichment.i18n_status;
  }

  mergedDisplay.en = existingEnrichment && existingEnrichment.display && existingEnrichment.display.en
    ? existingEnrichment.display.en
    : englishMetadata.display_en;

  mergedTranslationStatus.en = mergedDisplay.en ? 'complete' : mergedTranslationStatus.en;

  return {
    canonical_en: englishMetadata.canonical_en,
    display_en: englishMetadata.display_en,
    i18n_status: englishMetadata.i18n_status,
    display: mergedDisplay,
    translation_status: mergedTranslationStatus,
  };
}

function createDisplayStructure(displayEn) {
  const display = {};
  for (const lang of SUPPORTED_TRANSLATION_LANGS) {
    display[lang] = lang === 'en' ? displayEn || null : null;
  }

  return display;
}

function createTranslationStatus(displayEn) {
  const status = {};
  for (const lang of SUPPORTED_TRANSLATION_LANGS) {
    status[lang] = lang === 'en'
      ? (displayEn ? 'complete' : 'pending')
      : 'pending';
  }

  return status;
}

function formatFatPercent(value) {
  return `${stripTrailingZero(value)}%`;
}

function formatSize(sizeValue, sizeUnit) {
  return `${stripTrailingZero(sizeValue)}${UNIT_DISPLAY_MAP[sizeUnit] || sizeUnit}`;
}

function stripTrailingZero(value) {
  return Number.isInteger(value) ? String(value) : String(value).replace(/\.0$/, '');
}

module.exports = {
  buildDisplayEn,
  buildEnglishMetadata,
  createDisplayStructure,
  createTranslationStatus,
  formatSize,
  mergeEnglishMetadata,
};
