# PHASE 3 IMPLEMENTATION — AI DISAMBIGUATION + SEMANTIC LAYER

## Phase ID
PHASE_3_AI_LAYER

---

## Objective

Extend the deterministic matching system with:

1. AI-based disambiguation (only when needed)
2. Semantic enrichment of products
3. Embedding generation for vector search
4. Feedback collection for future learning

This phase introduces intelligence while preserving:
- determinism
- performance
- cost control

---

## Architectural Principle

The system must follow a **hybrid retrieval model**:

- deterministic matching (Phase 2)
- semantic retrieval (embeddings)
- AI disambiguation (fallback only)

This mirrors modern search systems that combine lexical + semantic retrieval before ranking. :contentReference[oaicite:0]{index=0}

---

## Scope

### In scope
- AI disambiguation for ambiguous queries
- semantic enrichment of products
- embedding generation and storage
- feedback collection
- batch processing jobs

### Out of scope
- UI
- personalization ranking
- SQL/vector sync (Phase 4)
- full semantic query engine

---

## Data Model Extensions

Extend `source_product_enrichment`:

```json
{
  "semantic_tags": ["string"],
  "use_cases": ["string"],
  "attributes": ["string"],

  "embedding": [float],
  "embedding_model": "string",
  "embedding_version": number,

  "semantic_version": number
}
Rules
all fields must be flat (SQL-compatible)
no nested semantic objects
arrays allowed for tags/use_cases
AI Disambiguation Layer
Trigger conditions
if (top_score < 10) → trigger
if (score_gap < 3) → trigger
if (no_matches) → trigger
Input to AI
{
  "query": "...",
  "candidates": [
    {
      "source_product_id": "...",
      "display_en": "...",
      "canonical_en": {...}
    }
  ]
}
Expected output
{
  "best_match_id": "...",
  "confidence": 0.0-1.0,
  "reason": "short explanation"
}
Rules
AI must NOT search database
AI must ONLY rank provided candidates
AI must return structured output only
Semantic Enrichment
Goal

Generate lightweight semantic understanding per product.

Input
display_en + canonical_en.product_type + product_family
Output example
{
  "semantic_tags": ["food", "dairy", "liquid"],
  "use_cases": ["drinking", "cooking"],
  "attributes": ["perishable", "refrigerated"]
}
Constraints
do not over-generate taxonomy
keep tags simple and reusable
prefer small controlled vocabularies
Embedding Generation
Input string
display_en + product_type + product_family + semantic_tags
Storage
{
  "embedding": [...],
  "embedding_model": "text-embedding-3-small",
  "embedding_version": 1
}
Rules
embeddings generated ONCE per product
regenerate only if:
embedding_version outdated
semantic data changed
Feedback Collection
Collection: match_feedback
{
  "query": "...",
  "chosen_product_id": "...",
  "candidate_ids": [...],
  "timestamp": ...
}
Purpose
improve scoring later
identify mismatches
support market gap detection
Batch Jobs
1. Semantic enrichment
upgradeSemanticData()
runs on products missing semantic fields
throttled
2. Embedding generation
generateEmbeddings()
runs after semantic enrichment
respects embedding_version
3. Translation-independent (already exists)
must not interfere with Phase 1.5
Cost Controls
MAX_AI_CALLS_PER_QUERY = 1
MAX_EMBEDDINGS_PER_RUN = 500
MAX_SEMANTIC_ENRICH_PER_RUN = 500
Module Structure
phase3/
  ai_disambiguator.js
  semantic_enricher.js
  embedding_generator.js
  feedback_collector.js
Integration with Phase 2

Modify matcher flow:

result = deterministic_match()

if (result.should_escalate) {
  result = ai_disambiguate(result.candidates)
}
Tests
AI Layer
resolves ambiguous matches correctly
does not override high-confidence matches
Semantic Layer
generates consistent tags
handles missing data safely
Embeddings
stored correctly
versioning works
Feedback
events stored correctly
Acceptance Criteria

Phase 3 complete when:

AI resolves ambiguous matches
semantic fields exist for products
embeddings stored and versioned
feedback collected
no performance regression
cost limits enforced
all tests pass
Implementation Rules
deterministic pipeline must remain primary
AI must be fallback only
no changes to Phase 1 or Phase 2 schema
all new fields must be SQL/export compatible
code must be readable and testable
Deliverables
Phase 3 modules implemented
full test coverage
updated docs/logs
handoff package