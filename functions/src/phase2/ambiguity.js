function detectAmbiguity(scoredCandidates) {
  if (scoredCandidates.length === 0) {
    return {
      status: 'unmatched',
      should_escalate: true,
      reason: 'no_candidates',
    };
  }

  const [top, second] = scoredCandidates;
  if (scoredCandidates.length === 1) {
    if (top.score < 0.3) {
      return {
        status: 'ambiguous',
        should_escalate: true,
        reason: 'low_confidence',
      };
    }

    return {
      status: 'matched',
      should_escalate: false,
      reason: null,
    };
  }

  if (top.score < 0.55) {
    return {
      status: 'ambiguous',
      should_escalate: true,
      reason: 'low_confidence',
    };
  }

  if (second && Math.abs(top.score - second.score) <= 0.15) {
    return {
      status: 'ambiguous',
      should_escalate: true,
      reason: 'close_scores',
    };
  }

  return {
    status: 'matched',
    should_escalate: false,
    reason: null,
  };
}

module.exports = {
  detectAmbiguity,
};
