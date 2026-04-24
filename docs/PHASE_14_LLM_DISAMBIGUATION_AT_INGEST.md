Phase 14.0 — audited LLM disambiguation lane

This phase should not change canonicalization logic itself. It should add a governed lane for the unresolved warning set that remains after deterministic rules.

1. Goal

Turn leftover warnings into a durable, reviewable decision flow:

deterministic pipeline produces unresolved pairs
unresolved pairs are normalized into a queue
queue items get stable fingerprints
LLM can adjudicate only those items
decisions are stored and reused
no pair is paid for twice unless meaningfully changed
2. What this phase should include
2.1 Queue artifact

Add a structured unresolved-warning queue.

Suggested record shape:

{
  "warning_id": "warn_...",
  "pair_fingerprint": "fp_...",
  "product_a": {
    "source_product_id": "...",
    "canonical_candidate_id": "...",
    "raw_name": "...",
    "core_tokens": ["..."],
    "markers": {
      "volume_marker": "...",
      "count_marker": "...",
      "age_band_marker": "...",
      "reserve_marker": "..."
    }
  },
  "product_b": {
    "source_product_id": "...",
    "canonical_candidate_id": "...",
    "raw_name": "...",
    "core_tokens": ["..."],
    "markers": {
      "volume_marker": "...",
      "count_marker": "...",
      "age_band_marker": "...",
      "reserve_marker": "..."
    }
  },
  "warning_reason": "potential_over_canonicalization_name_divergence",
  "status": "pending",
  "created_at": "...",
  "last_seen_at": "..."
}
2.2 Fingerprint generation

Fingerprint should be deterministic and stable.

It should include:

normalized names or canonical candidate ids
warning reason
relevant markers
normalized core tokens
prompt contract version only if you want prompt-version-sensitive reuse

Do not fingerprint on volatile timestamps or transient run ids.

2.3 Decision store

Persist adjudication results separately from queue items.

Suggested shape:

{
  "decision_id": "dec_...",
  "pair_fingerprint": "fp_...",
  "decision": "merge",
  "confidence": "high",
  "reason_short": "same product, equivalent naming variation",
  "decisive_features": ["brand_match", "token_overlap", "same_markers"],
  "decision_source": "llm",
  "model_name": "grok-...",
  "prompt_version": "phase14_v1",
  "created_at": "..."
}

Allowed decisions:

merge
distinct
uncertain
2.4 Reuse rule

Before any LLM call:

compute fingerprint
look for prior accepted decision
reuse it if found
do not call model again unless fingerprint changed or reuse policy says prompt version mismatch matters
3. What this phase should not include

Do not:

add live auto-merge into main canonical output yet
add human UI yet
send whole archives to the LLM
allow LLM to override hard deterministic conflicts
mix queue generation and network calls into one opaque blob

This phase should be queue + storage + dry-run adjudication plumbing.

4. Decision policy
Hard rule

Deterministic hard conflicts still win.

Examples:

different volume_marker
different count_marker
different age_band_marker
different reserve_marker

Those should not be sent for LLM override unless you intentionally add an escape hatch later.

LLM lane scope

Only send unresolved pairs where:

hard markers do not already force block
deterministic logic cannot confidently merge
the pair is still plausible enough to justify review
5. Prompt contract

Prompt should be narrow and structured.

Input

For each pair:

raw name A/B
normalized core tokens A/B
extracted markers A/B
warning reason
optional category/brand hints if available
Ask

Return only:

decision
confidence
reason_short
decisive_features
Example response schema
{
  "decision": "distinct",
  "confidence": "high",
  "reason_short": "different age-targeted variants",
  "decisive_features": ["age_band_marker_conflict"]
}
6. Suggested storage strategy

Since your current project already uses additive artifacts and verification reports, keep this phase lightweight and deterministic.

Good options
Option A — JSON artifact store first

Fastest and safest.

Artifacts like:

tmp/phase14_disambiguation_queue.json
tmp/phase14_disambiguation_decisions.json

Pros:

fast to implement
easy to diff
easy to inspect
Option B — state-store-backed persistence

Better longer term.

If your existing LargeStateStore or equivalent can hold stable additional structures, use:

disambiguation_queue
disambiguation_decisions

My recommendation: JSON artifact first, state-store second, unless the current store integration is already easy.

7. Phase 14.0 success criteria

This phase is successful if:

unresolved warnings can be exported into a structured queue
queue items get stable fingerprints
prior decisions are reused by fingerprint
new decisions can be stored without changing canonical merge behavior yet
dry-run adjudication can produce persisted decisions
tests prove no duplicate charges for identical unresolved pairs
8. Tests to add
Queue creation
unresolved pairs become queue records
queue records contain markers and warning reasons
deterministic hard conflicts are excluded if policy says so
Fingerprints
same pair across reruns → same fingerprint
changed markers or core tokens → changed fingerprint
ordering is stable if A/B ordering varies
Decision reuse
existing decision prevents new model call
missing decision creates pending adjudication need
changed fingerprint causes a fresh adjudication need
Safety
no live canonical merge behavior changes yet
no hard-marker conflict bypass
prompt/output schema validation works
9. Recommended implementation order
Step 1

Add queue builder from current warning output

Step 2

Add fingerprint helper

Step 3

Add decision-store read/write helpers

Step 4

Add dry-run adjudication entrypoint
This can:

read queue
skip already-decided fingerprints
print or persist the items that would be sent
Step 5

Optionally add real LLM call behind a flag
Example:

ENABLE_LLM_DISAMBIGUATION=false by default
10. After Phase 14.0
Phase 14.1

Decision application layer:

apply high-confidence cached decisions cautiously
keep uncertain decisions unresolved
Phase 14.2

Human override:

operator accept/reject
decision_source = human
durable overrides survive reruns