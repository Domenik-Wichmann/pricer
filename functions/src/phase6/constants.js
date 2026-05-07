const DEFAULT_KOLKOSTRUVA_BASE_URL = 'https://kolkostruva.bg/opendata_files';
const DEFAULT_SCHEDULE = Object.freeze({
  cron: '0 5 * * *',
  timezone: 'Europe/Sofia',
});
const DEFAULT_LOOKBACK_DAYS = 7;
const DEFAULT_GROK_ENDPOINT = 'https://api.x.ai/v1/chat/completions';
const DEFAULT_GROK_MODEL = 'grok-4-1-fast-non-reasoning';
const DEFAULT_EMBEDDING_ENDPOINT = 'https://api.x.ai/v1/embeddings';
const DEFAULT_EMBEDDING_MODEL = 'embedding-text-v1';
const DEFAULT_MAX_GROK_CALLS = 3;
const DEFAULT_MAX_EMBEDDING_CALLS = 250;

module.exports = {
  DEFAULT_EMBEDDING_ENDPOINT,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_GROK_ENDPOINT,
  DEFAULT_GROK_MODEL,
  DEFAULT_KOLKOSTRUVA_BASE_URL,
  DEFAULT_LOOKBACK_DAYS,
  DEFAULT_MAX_EMBEDDING_CALLS,
  DEFAULT_MAX_GROK_CALLS,
  DEFAULT_SCHEDULE,
};
