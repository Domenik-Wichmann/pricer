const { SUPPORTED_TRANSLATION_LANGS } = require('./constants');
const { translateDisplayEn } = require('./translator');

async function upgradeTranslations({
  store,
  limit = 1000,
  languages = SUPPORTED_TRANSLATION_LANGS.filter((lang) => lang !== 'en'),
  translator = translateDisplayEn,
}) {
  const state = await store.load();
  let processed = 0;
  let completed = 0;
  let failed = 0;

  for (const entry of state.source_product_enrichment) {
    if (!entry.display || !entry.display.en) {
      continue;
    }

    entry.translation_status = {
      en: 'complete',
      ...(entry.translation_status || {}),
    };

    for (const lang of languages) {
      if (processed >= limit) {
        await store.save(state);
        return {
          processed,
          completed,
          failed,
          state,
        };
      }

      entry.display = entry.display || {};
      if (entry.display[lang]) {
        entry.translation_status[lang] = 'complete';
        continue;
      }

      if (entry.translation_status[lang] === 'complete') {
        continue;
      }

      processed += 1;
      try {
        entry.display[lang] = await translator(entry.display.en, lang);
        entry.translation_status[lang] = 'complete';
        completed += 1;
      } catch (error) {
        entry.translation_status[lang] = 'failed';
        failed += 1;
      }
    }
  }

  await store.save(state);

  return {
    processed,
    completed,
    failed,
    state,
  };
}

module.exports = {
  upgradeTranslations,
};
