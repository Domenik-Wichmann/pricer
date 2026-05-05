Phase 15 Semantic Registry + Rich Enrichment v3 Implementation Plan
Goal

Upgrade Phase 15 enrichment from brittle enum-only extraction into a rich, registry-backed semantic enrichment system.

This must not delete richness. This must not replace messy real-world meaning with tiny fake enums.

The goal is:

messy product text
→ rich factual extraction
→ registry-aware normalization
→ searchable canonical buckets
→ proposed new terms when needed
→ human/audit-friendly review path
Core Principle

Keep both:

What the product actually says / implies
How we normalize it for search and indexing

Do not force every real-world thing into a tiny enum.

Example:

{
  "packaging": {
    "raw_terms": ["кофичка"],
    "description": "small plastic yogurt cup/tub",
    "registry_match": "tub",
    "proposed_aliases": ["кофичка", "cup"],
    "confidence": 0.91,
    "needs_review": false
  }
}

Not this:

{
  "packaging": "tub"
}

The old enum/bucket may still exist, but it becomes a search bucket, not the whole truth.

Required Implementation
1. Add a semantic registry

Create a registry for reusable canonical terms.

Suggested collection/table:

semantic_term_registry

Each record should support:

{
  term_id,
  domain, 
  canonical_label,
  display_label,
  definition,
  aliases,
  parent_term_id,
  related_term_ids,
  status, // active | proposed | rejected | merged | deprecated
  source, // seed | llm_proposed | human | deterministic
  confidence,
  evidence_examples,
  created_at,
  updated_at
}
Domains to support initially

At minimum:

packaging
product_form
food_category
dairy_type
milk_source
quality_tier
storage_type
flavor
dietary_claim
material
preparation_state

Do not overbuild UI yet. But the data structure should support future review.

2. Seed the registry from current enums

Do not delete existing enums.

Seed them into the registry as active canonical terms.

Example:

domain: "packaging"
canonical_label: "tub"
aliases: ["tub", "cup", "кофичка"]
definition: "Rigid or semi-rigid open-top container, often used for yogurt, dairy, dips, or spreads."
status: "active"

For uncertain aliases, mark them as proposed instead of active.

Example:

domain: "packaging"
canonical_label: "packet"
aliases: ["пакетирано"]
status: "proposed"

Because пакетирано may mean “packaged” rather than a specific package type.

3. Add rich v3 enrichment schema

Create a new enrichment version:

canonical_semantic_v3

Do not break canonical_semantic_v2.

The v3 schema should separate:

raw observed meaning
normalized labels
registry matches
search/index buckets
confidence
warnings
review flags

Suggested structure:

{
  schema_version: "canonical_semantic_v3",

  product_identity: {
    canonical_product_id,
    canonical_name_hash,
    observed_name,
    observed_brand,
    brand_confidence,
    brand_needs_review
  },

  category: {
    raw_terms: [],
    category_path_raw: [],
    registry_matches: [
      {
        domain: "food_category",
        term_id,
        canonical_label,
        confidence,
        evidence
      }
    ],
    proposed_terms: [],
    search_buckets: [],
    needs_review
  },

  packaging: {
    raw_terms: [],
    description,
    registry_match: null,
    proposed_aliases: [],
    proposed_new_term: null,
    search_bucket: null,
    confidence,
    needs_review,
    evidence
  },

  product_form: {
    raw_terms: [],
    description,
    registry_match: null,
    proposed_aliases: [],
    proposed_new_term: null,
    search_bucket: null,
    confidence,
    needs_review,
    evidence
  },

  attributes: {
    dairy: {},
    beverage: {},
    nutrition_claims: [],
    dietary_claims: [],
    flavor_terms: [],
    preparation_state: [],
    storage: {},
    quantity: {}
  },

  registry_actions: [
    {
      action: "use_existing" | "propose_alias" | "propose_new_term" | "propose_relationship" | "needs_review",
      domain,
      existing_term_id,
      proposed_label,
      proposed_alias,
      parent_term_id,
      confidence,
      evidence,
      reason
    }
  ],

  warnings: [],
  confidence_overall,
  needs_human_review
}
4. Prompt update

The prompt should be strict about shape, not artificially strict about meaning.

Prompt must say:

You must return exactly this JSON schema.
Do not add extra top-level keys.
Do not omit required keys.
Use null or [] when unknown.
Do not invent facts not supported by the product name or deterministic markers.

But also:

Real-world product language is messy.
Do not force a raw observed term into a false canonical bucket.
If an existing registry term fits, use it.
If none fits, preserve the raw term and propose a new registry term or alias.
Prompt must include registry snapshot

For every batch, include relevant registry terms:

registry_context: {
  packaging: [...],
  product_form: [...],
  food_category: [...],
  dairy_type: [...]
}

The LLM should be instructed:

Prefer existing registry terms when they accurately fit.
Do not use a registry term if it would be false.
If a raw term is meaningful but not in the registry, include it as proposed_alias or proposed_new_term.
5. Provider structured output

Use xAI structured output if supported.

Try:

response_format: {
  type: "json_schema",
  json_schema: {
    name: "canonical_semantic_v3_batch",
    strict: true,
    schema
  }
}

Fallback:

response_format: { type: "json_object" }

If unsupported, keep prompt-only fallback but log that strict schema enforcement is unavailable.

6. Parser hardening

Parser should:

strip full markdown fences
trim whitespace
parse strict JSON first
if parsing fails, persist raw provider content to a debug artifact
do not silently repair and write uncertain data
optionally attempt repair only into a quarantined candidate, not canonical enrichment

Add error artifact collection/path:

canonical_enrichment_failed_responses

Store:

{
  run_id,
  batch_index,
  product_ids,
  provider,
  model,
  error_type,
  parse_error,
  raw_content_redacted,
  created_at
}

No secrets.

7. Registry update flow

The LLM must not directly activate new canonical terms.

Instead:

LLM proposes registry actions
system validates shape
system writes proposed registry updates
human/deterministic review can activate later

Collections:

semantic_term_registry
semantic_term_registry_proposals

Proposal record:

{
  proposal_id,
  domain,
  action,
  proposed_label,
  proposed_alias,
  existing_term_id,
  parent_term_id,
  evidence_product_ids,
  evidence_terms,
  confidence,
  status: "pending" | "approved" | "rejected" | "merged",
  created_at,
  updated_at
}

After each successful batch:

Read registry_actions
Deduplicate proposals
If high-confidence alias for existing term, write pending proposal
If new term, write pending proposal
Never auto-activate unless explicitly safe and deterministic
8. Backward compatibility

Do not delete v2.

Write v3 records alongside or inside same enrichment store with:

enrichment_version: "canonical_semantic_v3"

Existing cache logic should distinguish v2 and v3.

Add config:

PRICER_ENRICHMENT_VERSION=canonical_semantic_v3

Default can remain v2 until v3 is verified.

9. Validation strategy

Validation should enforce:

strict JSON shape
required fields
correct types
valid registry action structure
confidence range 0..1

But should not reject an item merely because raw real-world terms are unfamiliar.

Bad:

Reject because packaging_raw = "кофичка"

Good:

Accept raw term.
Set registry_match null or tub if supported.
Add proposed_alias or needs_review.

Controlled fields may still exist, but use broad buckets and allow:

unknown
other
needs_review
10. Tests

Add tests for:

Prompt/schema
v3 prompt includes exact schema
v3 prompt includes registry context
prompt says use existing registry terms when accurate
prompt says propose new terms/aliases when needed
prompt says do not force false matches
Parsing
valid structured response parses
markdown fenced JSON parses
malformed JSON is quarantined, not written
raw failed content is persisted redacted
Registry
existing term match writes enrichment
proposed alias writes registry proposal
proposed new term writes registry proposal
duplicate proposals dedupe
LLM cannot directly activate term
Enrichment behavior
кофичка is preserved as raw term
cup can map to tub only if registry supports alias
пакетирано is preserved and marked review/proposed, not blindly mapped
semi-solid is preserved descriptively and mapped only if valid registry term exists
valid sibling items still write if one item fails
11. Implementation order
Step 1 — Read-only design report

Before coding, inspect current:

functions/src/phase15/enrichment.js
functions/src/phase15/enrichment_pilot.js
app/functions/src/phase15/*
tests/phase_15_hyper_rich_enrichment.test.js
docs/PHASE_15_9_SEMANTIC_ENRICHMENT_PILOT.md

Produce a short design note showing:

current v2 shape
proposed v3 shape
registry collection shape
migration/backward compatibility plan
Step 2 — Add registry data model

Implement registry/proposal collections and seed helper.

Step 3 — Add v3 schema and prompt builder

Do not remove v2 prompt.

Step 4 — Add structured output request support

Use xAI response_format where available.

Step 5 — Add v3 validator/parser

Strict shape, flexible vocabulary.

Step 6 — Add registry proposal writer

Only pending proposals, no automatic activation.

Step 7 — Add pilot config switch

Allow:

$env:PRICER_ENRICHMENT_VERSION='canonical_semantic_v3'
Step 8 — Tests/docs

Run:

npm run test:phase15
npm run validate:docs

Update changelog/test registry.

Codex Implementation Prompt
Implement Phase 15 Semantic Registry + Rich Enrichment v3.

Important:
Do not delete v2.
Do not reduce enrichment richness.
Do not force real-world messy values into tiny enums.
This is additive and migration-safe.

We need strict schema shape, flexible semantic vocabulary, and registry-backed normalization.

Goals:
1. Keep raw/descriptive LLM-observed truth.
2. Map to existing canonical registry terms when accurate.
3. Propose new terms/aliases/relationships when no registry term fits.
4. Store broad searchable buckets without losing detail.
5. Prevent malformed JSON and bad writes.
6. Preserve auditability.

Implement:

A. Semantic term registry
- Add semantic_term_registry and semantic_term_registry_proposals support in the runtime data store.
- Seed from existing enum values where appropriate.
- Registry terms need domain, canonical_label, aliases, definition, parent/related links, status, source, evidence, timestamps.
- Proposals must be pending by default. LLM must not directly activate new terms.

B. canonical_semantic_v3 schema
- Add v3 enrichment shape separating:
  raw_terms,
  description,
  normalized/registry matches,
  search buckets,
  confidence,
  needs_review,
  evidence,
  registry_actions.
- Focus on packaging, product_form, category, dairy attributes, quality, storage, quantity.
- Keep v2 untouched.

C. Prompt
- Add v3 prompt builder.
- Prompt must include exact output schema.
- Prompt must include relevant registry snapshot per domain.
- Prompt must say:
  - return exact JSON schema only
  - use existing registry terms when accurate
  - do not force false matches
  - preserve raw real-world terms
  - propose aliases/new terms when needed
  - use null/[] when unknown
  - do not invent unsupported facts

D. Provider request
- Add xAI structured output support using response_format json_schema strict if supported.
- Fall back to json_object if needed.
- Fall back to prompt-only only with explicit warning.

E. Parser/observability
- Parse strict JSON.
- Strip full markdown fences.
- On malformed JSON, do not write enrichment.
- Persist failed raw assistant content redacted to a failed-response artifact/collection.
- Keep error summaries compact.

F. Validation
- Validate strict shape and types.
- Do not reject unknown raw terms.
- Reject impossible shapes, unsupported direct enum fields, wrong product IDs, duplicates.
- Allow item-level rejection.
- Global shape/provider parse errors reject only the affected batch.
- Valid sibling items still write.

G. Registry proposal handling
- After successful v3 validation, process registry_actions.
- Write pending proposals for:
  propose_alias
  propose_new_term
  propose_relationship
- Deduplicate by domain + proposed label/alias + existing term.
- Never auto-activate unless deterministic and explicitly safe.

H. Cache/versioning
- Add support for PRICER_ENRICHMENT_VERSION=canonical_semantic_v3.
- Cache should distinguish v2 vs v3.
- Existing v2 records must remain readable.

I. Tests
Add/update Phase 15 tests:
- v3 prompt includes registry context
- v3 prompt preserves raw messy values
- cup/кофичка can be raw terms without rejection
- пакетирано does not force unsafe packet mapping
- proposed aliases/new terms create pending registry proposals
- malformed JSON is quarantined
- structured output request body includes response_format when enabled
- item-level rejection works
- v2 tests still pass

J. Docs
Update:
- CHANGELOG.md
- docs/PHASE_15_9_SEMANTIC_ENRICHMENT_PILOT.md or create v3 doc
- docs/TEST_REGISTRY.md
- docs/test_registry.json
- docs/test_runs/...

Run:
npm run test:phase15
npm run validate:docs

Before coding, produce a short implementation note confirming exact files to change and any assumptions.
Short version

You want:

strict schema
flexible vocabulary
registry-backed normalization
raw truth preserved
new terms proposed, not silently invented
search buckets generated, not treated as the whole meaning