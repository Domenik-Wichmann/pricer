const crypto = require('node:crypto');

function createPipelineLog({
  level = 'info',
  event_type,
  message,
  context = {},
  logged_at = new Date().toISOString(),
}) {
  return {
    log_id: crypto.createHash('sha256').update(`${level}|${event_type}|${message}|${logged_at}`).digest('hex'),
    level,
    event_type,
    message,
    context_json: JSON.stringify(context),
    logged_at,
  };
}

function appendPipelineLog(state, entry) {
  state.pipeline_logs = state.pipeline_logs || [];
  state.pipeline_logs.push(entry);
  return entry;
}

async function recordPipelineLog({
  store,
  level = 'info',
  eventType,
  message,
  context = {},
  loggedAt = new Date().toISOString(),
}) {
  const state = await store.load();
  const entry = createPipelineLog({
    level,
    event_type: eventType,
    message,
    context,
    logged_at: loggedAt,
  });
  appendPipelineLog(state, entry);
  await store.save(state);
  return entry;
}

module.exports = {
  appendPipelineLog,
  createPipelineLog,
  recordPipelineLog,
};
