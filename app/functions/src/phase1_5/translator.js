const { TRANSLATED_DISPLAY_PREFIXES } = require('./constants');

async function translateDisplayEn(text, targetLang) {
  if (targetLang === 'en') {
    return text;
  }

  const prefixMap = TRANSLATED_DISPLAY_PREFIXES[targetLang];
  if (!prefixMap) {
    throw new Error(`Unsupported translation language: ${targetLang}`);
  }

  const englishPrefixes = Object.keys(prefixMap).sort((left, right) => right.length - left.length);
  for (const englishPrefix of englishPrefixes) {
    if (text.startsWith(`${englishPrefix} `) || text === englishPrefix) {
      return text.replace(englishPrefix, prefixMap[englishPrefix]);
    }
  }

  return text;
}

module.exports = {
  translateDisplayEn,
};
