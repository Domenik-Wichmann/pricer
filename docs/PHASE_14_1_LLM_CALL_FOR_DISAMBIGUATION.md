Phase 14.1 — opt-in LLM adjudication caller

This phase should sit on top of Phase 14.0, not inside canonicalization.

The purpose is simple:

read pending queue items, reuse cached decisions, optionally call the model, persist decisions, and stop there.

No silent canonical mutation yet.

1. Goal

Add a controlled adjudication runner that:

loads pending unresolved queue items
skips anything already decided by fingerprint
batches the remaining items
calls the LLM behind an explicit flag
validates the returned schema
stores decisions durably
leaves canonical merge behavior unchanged
2. What Phase 14.1 should include
2.1 Adjudication entrypoint

Add a dedicated entrypoint, separate from ingest.

Possible shapes:

helper function in phase6
callable runner in index.js
CLI/test-only execution path

It should be explicit and operator-invoked.

Example conceptual flow:

load queue -> filter pending -> reuse cache -> batch unresolved -> call LLM -> validate -> persist decisions
2.2 Cache-first behavior

Before any model call:

compute / read pair_fingerprint
check canonical_disambiguation_decisions
if found, reuse
do not re-send

This is the whole cost-control mechanism.

2.3 Prompt builder

Create a narrow, structured prompt payload using queue records only.

Each adjudication item should include:

raw name A
raw name B
normalized core tokens A/B
markers A/B
warning reason
maybe category/brand if available later
2.4 Response validator

Every model response must be validated before being stored.

Allowed schema:

{
  "decision": "merge",
  "confidence": "high",
  "reason_short": "same product with equivalent naming",
  "decisive_features": ["same_markers", "high_token_overlap"]
}

Allowed decision:

merge
distinct
uncertain

Allowed confidence:

high
medium
low

If response is malformed:

reject it
log it
do not write partial garbage
2.5 Decision persistence

Write validated results to canonical_disambiguation_decisions.

Include:

fingerprint
decision
confidence
reason
decisive features
source = llm
model name
prompt version
created_at
2.6 Explicit feature flag

This phase should be opt-in only.

Something like:

ENABLE_LLM_DISAMBIGUATION=false by default

Dry-run mode should still work without network calls.

3. What Phase 14.1 should not include

Do not:

auto-apply merge/distinct to canonical outputs
silently clear queue items from canonical warning logic
allow LLM to overrule hard deterministic conflicts
add human UI yet
broaden this into a general AI orchestration layer

This phase is just:

adjudicate and persist

4. Recommended API / execution shape
Option A — internal function runner

Good if you want code-first workflow.

Example conceptual function:

runCanonicalDisambiguation({
  dryRun: true,
  batchSize: 50,
  modelName: "...",
  promptVersion: "phase14_1_v1"
})
Option B — callable/admin endpoint

Good if you want operator triggering later.

Example:

/admin/runCanonicalDisambiguation

My recommendation:

start with internal runner + tests
expose endpoint later if needed
5. Batch strategy

Keep it simple.

Rules
batch by fixed size, e.g. 25–100 pairs
skip already-decided fingerprints before batching
preserve deterministic ordering for repeatability
Why

This makes:

logs stable
cost predictable
debugging easier
6. Suggested prompt contract
System instruction intent

The model is not classifying whole products broadly. It is deciding one narrow thing:

Are these two unresolved candidates the same canonical product family or distinct products?

Input shape per pair
names
tokens
markers
reason class
Output shape

For each pair:

{
  "decision": "distinct",
  "confidence": "high",
  "reason_short": "different age-targeted variants",
  "decisive_features": ["age_band_difference"]
}
Strong guardrail

Tell the model:

if uncertain, say uncertain
do not guess just to be decisive
7. Queue status behavior

You already have queue records with status.

For 14.1, suggested status flow:

pending
adjudicated
maybe skipped_cached

You can either:

keep queue status minimal
or only rely on the decision store as truth

I’d keep it simple:

decision store is truth
queue status is convenience
8. Tests to add
Cache reuse
existing fingerprint decision means no new model call
Response validation
bad response schema is rejected
partial output does not persist
Persistence
valid model result is stored correctly
prompt version and model name are recorded
Safety
hard deterministic conflicts do not enter the LLM caller
canonical merge behavior does not change in this phase
Repeatability
same queue, same existing decisions, second run produces zero new model calls
9. Metrics to add

Add these to verification/handoff:

pending queue count
cached decision hits
new model adjudications
merge / distinct / uncertain counts
malformed response count
skipped hard-conflict count

These metrics will matter a lot.

10. Success criteria

Phase 14.1 is successful if:

pending queue items can be adjudicated in batches
cached fingerprints are reused
valid LLM results are persisted
malformed results are safely rejected
no live canonical merge behavior changes yet
run metrics are visible
11. What comes right after
Phase 14.2

Human override layer:

operator can resolve merge/distinct manually
human decisions outrank model decisions
unresolved long-tail gets governed
Phase 14.3

Controlled application layer:

optionally apply only high-confidence cached decisions
still auditable
still reversible