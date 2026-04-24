const crypto = require('crypto');

async function collectFeedback({
  store,
  feedback,
  recordedAt = new Date().toISOString(),
}) {
  const state = await store.load();
  const feedbackRecord = {
    feedback_id: buildFeedbackId(feedback, recordedAt),
    user_id: feedback.user_id || null,
    query_text: feedback.query_text,
    raw_item_input: feedback.raw_item_input || null,
    resolved_source_product_id: feedback.resolved_source_product_id || null,
    feedback_type: feedback.feedback_type,
    feedback_value: feedback.feedback_value,
    notes: feedback.notes || null,
    locality_code: feedback.locality_code || null,
    created_at: recordedAt,
  };

  state.feedback_events.push(feedbackRecord);
  await store.save(state);

  return feedbackRecord;
}

function buildFeedbackId(feedback, recordedAt) {
  return crypto.createHash('sha256')
    .update([
      feedback.user_id || '',
      feedback.query_text || '',
      feedback.raw_item_input || '',
      feedback.feedback_type || '',
      feedback.feedback_value || '',
      recordedAt,
    ].join('|'), 'utf8')
    .digest('hex');
}

module.exports = {
  collectFeedback,
};
