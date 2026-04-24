const { buildEnglishMetadata } = require('./display_builder');

async function upgradeEnrichmentToEnglish({
  store,
  upgradedAt = new Date().toISOString(),
}) {
  const state = await store.load();
  let upgraded = 0;

  state.source_product_enrichment = state.source_product_enrichment.map((entry) => {
    const needsCanonical = !Object.prototype.hasOwnProperty.call(entry, 'canonical_en');
    const needsDisplayEn = !Object.prototype.hasOwnProperty.call(entry, 'display_en');
    const needsI18nStatus = !Object.prototype.hasOwnProperty.call(entry, 'i18n_status');
    const needsDisplayObject = !entry.display || typeof entry.display !== 'object';
    const needsTranslationStatus = !entry.translation_status || typeof entry.translation_status !== 'object';

    if (!needsCanonical && !needsDisplayEn && !needsI18nStatus && !needsDisplayObject && !needsTranslationStatus) {
      return entry;
    }

    const englishMetadata = buildEnglishMetadata(entry);
    upgraded += 1;

    return {
      ...entry,
      canonical_en: needsCanonical ? englishMetadata.canonical_en : entry.canonical_en,
      display_en: needsDisplayEn ? englishMetadata.display_en : entry.display_en,
      i18n_status: needsI18nStatus ? englishMetadata.i18n_status : entry.i18n_status,
      display: needsDisplayObject
        ? englishMetadata.display
        : {
            ...englishMetadata.display,
            ...entry.display,
          },
      translation_status: needsTranslationStatus
        ? englishMetadata.translation_status
        : {
            ...englishMetadata.translation_status,
            ...entry.translation_status,
          },
      enriched_at: entry.enriched_at || upgradedAt,
    };
  });

  await store.save(state);

  return {
    upgraded,
    state,
  };
}

module.exports = {
  upgradeEnrichmentToEnglish,
};
