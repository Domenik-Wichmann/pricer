Phase 14.2 — human override / review semantics

This phase should complete the trust layer before any canonical behavior is allowed to change.

Right now you have:

deterministic decisions
queue
LLM adjudication runner
persisted LLM decisions

What you still need is:

a human-controlled override path that becomes the highest-trust decision source.

1. Goal

Add a durable human review layer that:

lets an operator explicitly mark a queued pair as merge, distinct, or uncertain
stores that decision with provenance
makes human decisions outrank LLM decisions for the same fingerprint
reuses human decisions across reruns
still does not auto-apply anything to canonical state yet

This phase is about:

review semantics and precedence, not merge execution.

2. Why this phase matters

Without this, you have:

deterministic logic
AI suggestions

But no final operator authority.

With this, you get:

reversible governance
escalation path for hard cases
ability to correct bad model calls
stable replay behavior

This is what turns the adjudication lane into a real production system.

3. What 14.2 should include
3.1 Human decision writer

Add a dedicated path to write a human decision for a queue item or fingerprint.

The write path should accept:

pair_fingerprint
decision
reason_short
optional review_note
reviewer identity if available
maybe a source queue item reference

Allowed decisions:

merge
distinct
uncertain
3.2 Decision precedence

Define and enforce precedence rules.

Recommended precedence:

human > llm

If you later add deterministic override records explicitly, then:

human > deterministic_override > llm

But for now, at minimum:

human decision wins over any LLM decision with the same fingerprint
3.3 Resolution semantics

Add lightweight queue resolution behavior.

Suggested queue status progression:

pending
adjudicated_llm
reviewed_human

You do not need a fancy workflow yet. Just enough to know:

still pending
seen by LLM
finalized by human
3.4 Review note / provenance

Every human decision should persist:

who decided it, if available
why
when
what it overrode, if anything

This does not need to be huge, just durable and inspectable.

3.5 Read-path resolution helper

Add a helper that says:

given a fingerprint, what is the effective decision?

That helper should:

prefer human
else use LLM
else none

This will be the backbone for the later application phase.

4. Data model additions

You may not need a new table if the current decision store is flexible enough.

Option A — reuse canonical_disambiguation_decisions

Best if it already supports:

decision_source
timestamps
fingerprint
reason fields

Then just add/write:

decision_source = human
optional review_note
optional reviewed_by
Option B — separate human review record

Only do this if the current store cannot cleanly support precedence.

My recommendation:

reuse the same decision store
rely on decision_source plus precedence helper

That keeps the system simple.

5. Suggested decision record shape
{
  "decision_id": "dec_...",
  "pair_fingerprint": "fp_...",
  "decision": "distinct",
  "confidence": "high",
  "reason_short": "different age-targeted variants",
  "review_note": "Human confirmed after inspecting names and markers",
  "decision_source": "human",
  "reviewed_by": "operator",
  "model_name": null,
  "prompt_version": null,
  "created_at": "..."
}

For human decisions:

model_name should be null
prompt_version should be null or omitted
6. What 14.2 should not include

Do not:

build a UI yet unless it is trivially small
auto-apply review decisions to canonical outputs
mix human review with full application logic
create complicated workflow states

This phase should stay:

write human decision, resolve precedence, preserve provenance

7. Suggested interfaces
Option A — internal helper

Something like:

recordHumanCanonicalDisambiguationDecision({
  pairFingerprint,
  decision,
  reasonShort,
  reviewNote,
  reviewedBy
})
Option B — admin function / endpoint

Something like:

/admin/canonicalDisambiguation/review

If you already have function entrypoints and want operator use later, this is useful. But it can still be thin.

My recommendation:

internal helper first
optional admin endpoint if cheap
8. Effective decision resolver

You should add a helper like:

getEffectiveCanonicalDisambiguationDecision(pairFingerprint)

Behavior:

return latest human decision if present
else return latest LLM decision if present
else return null

This is one of the most important pieces of 14.2.

9. Tests to add
Human override precedence
LLM decision exists
human decision added later
effective decision returns human decision
Reuse
same fingerprint on rerun reuses human decision
no new LLM call is needed for human-resolved items
Provenance
human decision stores note/source/reviewer
human decision does not erase original LLM record if both are retained
Safety
canonical merge behavior still unchanged in this phase
queue items can be marked reviewed without affecting ingest outcomes yet
Idempotence
repeated identical human review on same fingerprint does not corrupt state
latest valid human decision remains effective
10. Metrics to add

Add:

human_review_count
human_override_count
effective_human_decision_count
effective_llm_decision_count
still_pending_count

These will help once the queue starts getting real use.

11. Success criteria

Phase 14.2 is successful if:

a human can record a decision for a fingerprint
human decisions persist durably
human decisions outrank LLM decisions
reruns reuse human-reviewed outcomes
canonical behavior still remains unchanged in this phase
provenance is inspectable
12. What comes after 14.2
Phase 14.3 — controlled application layer

This is where decisions start to affect canonical outcomes.

But only after:

precedence exists
human override exists
effective decision lookup exists

Phase 14.3 should likely:

apply only trusted decisions
maybe only human or high-confidence llm
remain reversible and auditable