const crypto = require('node:crypto');

const CANONICAL_SEMANTIC_V3_VERSION = 'canonical_semantic_v3';
const CANONICAL_SEMANTIC_V3_PROMPT_VERSION = 'canonical_semantic_v3_prompt_v1';

const SEMANTIC_REGISTRY_DOMAINS = Object.freeze([
  'packaging',
  'product_form',
  'food_category',
  'dairy_type',
  'milk_source',
  'quality_tier',
  'storage_type',
  'flavor',
  'dietary_claim',
  'material',
  'preparation_state',
]);

const REGISTRY_ACTIONS = Object.freeze([
  'use_existing',
  'propose_alias',
  'propose_new_term',
  'propose_relationship',
  'needs_review',
]);

const PROPOSAL_ACTIONS = Object.freeze([
  'propose_alias',
  'propose_new_term',
  'propose_relationship',
]);

const DEFAULT_REGISTRY_SEED_TERMS = Object.freeze([
  termSeed('packaging', 'bottle', ['bottle'], 'Rigid container with a narrow neck, typically for liquids.'),
  termSeed('packaging', 'carton', ['carton'], 'Folded paperboard or laminated carton, often used for milk or juice.'),
  termSeed('packaging', 'bag', ['bag'], 'Flexible bag container.'),
  termSeed('packaging', 'box', ['box'], 'Rigid or semi-rigid box container.'),
  termSeed('packaging', 'can', ['can', 'tin'], 'Sealed metal can.'),
  termSeed('packaging', 'jar', ['jar'], 'Rigid jar with a lid, usually glass or plastic.'),
  termSeed('packaging', 'tube', ['tube'], 'Squeezable tube container.'),
  termSeed('packaging', 'packet', ['packet', 'sachet'], 'Small sealed packet or sachet.', { status: 'active' }),
  termSeed('packaging', 'wrapper', ['wrapper'], 'Wrapper around a bar, snack, or bakery item.'),
  termSeed('packaging', 'tray', ['tray'], 'Tray packaging, often with film or wrap.'),
  termSeed('packaging', 'roll', ['roll'], 'Roll format packaging or product presentation.'),
  termSeed('packaging', 'blister', ['blister'], 'Blister pack.'),
  termSeed('packaging', 'tub', ['tub', 'cup', '\u043a\u043e\u0444\u0438\u0447\u043a\u0430'], 'Rigid or semi-rigid open-top container, often used for yogurt, dairy, dips, or spreads.'),
  termSeed('product_form', 'liquid', ['liquid'], 'Pourable liquid product form.'),
  termSeed('product_form', 'solid', ['solid'], 'Solid product form.'),
  termSeed('product_form', 'powder', ['powder'], 'Powdered product form.'),
  termSeed('product_form', 'gel', ['gel'], 'Gel product form.'),
  termSeed('product_form', 'cream', ['cream'], 'Cream product form.'),
  termSeed('product_form', 'paste', ['paste'], 'Paste product form.'),
  termSeed('product_form', 'spray', ['spray'], 'Spray product form.'),
  termSeed('product_form', 'tablet', ['tablet'], 'Tablet product form.'),
  termSeed('product_form', 'capsule', ['capsule'], 'Capsule product form.'),
  termSeed('product_form', 'granules', ['granules'], 'Granulated product form.'),
  termSeed('product_form', 'frozen', ['frozen'], 'Frozen product form or state.'),
  termSeed('product_form', 'semi-solid', ['semi-solid', 'semi solid'], 'Semi-solid texture that should not be forced into solid, cream, gel, or paste without evidence.', { status: 'proposed' }),
  termSeed('food_category', 'dairy', ['dairy', 'milk products'], 'Milk-derived and dairy products.'),
  termSeed('food_category', 'beverages', ['beverages', 'drinks'], 'Drinkable products.'),
  termSeed('food_category', 'snacks', ['snacks'], 'Snack foods.'),
  termSeed('food_category', 'bakery', ['bakery'], 'Bread and baked goods.'),
  termSeed('food_category', 'sweets', ['sweets', 'desserts'], 'Sweet foods and desserts.'),
  termSeed('dairy_type', 'milk', ['milk', '\u043c\u043b\u044f\u043a\u043e'], 'Milk as a dairy beverage or ingredient.'),
  termSeed('dairy_type', 'yogurt', ['yogurt', 'yoghurt', '\u043a\u0438\u0441\u0435\u043b\u043e \u043c\u043b\u044f\u043a\u043e'], 'Cultured yogurt.'),
  termSeed('dairy_type', 'cheese', ['cheese'], 'Cheese.'),
  termSeed('dairy_type', 'sirene', ['sirene', '\u0441\u0438\u0440\u0435\u043d\u0435'], 'Bulgarian brined white cheese.'),
  termSeed('dairy_type', 'kashkaval', ['kashkaval', '\u043a\u0430\u0448\u043a\u0430\u0432\u0430\u043b'], 'Yellow cheese common in Bulgaria.'),
  termSeed('milk_source', 'cow', ['cow'], 'Cow milk source.'),
  termSeed('milk_source', 'sheep', ['sheep'], 'Sheep milk source.'),
  termSeed('milk_source', 'goat', ['goat'], 'Goat milk source.'),
  termSeed('milk_source', 'mixed', ['mixed'], 'Mixed animal milk source.'),
  termSeed('milk_source', 'plant_based', ['plant based', 'plant-based'], 'Plant-based milk alternative source.'),
  termSeed('quality_tier', 'premium', ['premium'], 'Premium quality or positioning.'),
  termSeed('quality_tier', 'budget', ['budget'], 'Budget quality or positioning.'),
  termSeed('quality_tier', 'standard', ['standard'], 'Standard quality or positioning.'),
  termSeed('quality_tier', 'economy', ['economy'], 'Economy quality or positioning.'),
  termSeed('quality_tier', 'mid-tier', ['mid-tier', 'mid tier'], 'Mid-tier quality or positioning.'),
  termSeed('storage_type', 'shelf_stable', ['shelf stable', 'ambient'], 'Shelf-stable storage.'),
  termSeed('storage_type', 'refrigerated', ['refrigerated', 'fresh'], 'Requires or implies chilled storage.'),
  termSeed('storage_type', 'frozen', ['frozen'], 'Frozen storage.'),
  termSeed('flavor', 'plain', ['plain', 'natural'], 'Plain or unflavored variant.'),
  termSeed('flavor', 'chocolate', ['chocolate', '\u0448\u043e\u043a\u043e\u043b\u0430\u0434'], 'Chocolate flavor.'),
  termSeed('flavor', 'vanilla', ['vanilla'], 'Vanilla flavor.'),
  termSeed('flavor', 'strawberry', ['strawberry'], 'Strawberry flavor.'),
  termSeed('dietary_claim', 'organic', ['organic', 'bio', '\u0431\u0438\u043e'], 'Organic or bio claim.'),
  termSeed('dietary_claim', 'vegan', ['vegan'], 'Vegan claim.'),
  termSeed('dietary_claim', 'vegetarian', ['vegetarian'], 'Vegetarian claim.'),
  termSeed('dietary_claim', 'gluten_free', ['gluten free', 'gluten-free'], 'Gluten-free claim.'),
  termSeed('dietary_claim', 'lactose_free', ['lactose free', 'lactose-free'], 'Lactose-free claim.'),
  termSeed('dietary_claim', 'sugar_free', ['sugar free', 'sugar-free'], 'Sugar-free claim.'),
  termSeed('material', 'plastic', ['plastic'], 'Plastic material.'),
  termSeed('material', 'glass', ['glass'], 'Glass material.'),
  termSeed('material', 'paperboard', ['paperboard', 'carton board'], 'Paperboard material.'),
  termSeed('material', 'metal', ['metal', 'aluminum', 'steel'], 'Metal material.'),
  termSeed('preparation_state', 'ready_to_eat', ['ready to eat', 'ready-to-eat'], 'Ready to eat without preparation.'),
  termSeed('preparation_state', 'requires_cooking', ['requires cooking', 'cook before eating'], 'Requires cooking.'),
  termSeed('preparation_state', 'fresh', ['fresh'], 'Fresh state.'),
  termSeed('preparation_state', 'uht', ['uht'], 'Ultra-high-temperature processed state.'),
]);

function termSeed(domain, canonicalLabel, aliases, definition, overrides = {}) {
  return Object.freeze({
    domain,
    canonical_label: canonicalLabel,
    display_label: overrides.display_label || canonicalLabel,
    definition,
    aliases,
    parent_term_id: overrides.parent_term_id || null,
    related_term_ids: overrides.related_term_ids || [],
    status: overrides.status || 'active',
    source: overrides.source || 'seed',
    confidence: overrides.confidence ?? 1,
    evidence_examples: overrides.evidence_examples || [],
  });
}

function buildSeedSemanticTermRegistry({ now = new Date().toISOString() } = {}) {
  return DEFAULT_REGISTRY_SEED_TERMS.map((seed) => ({
    term_id: createSemanticTermId(seed.domain, seed.canonical_label),
    domain: seed.domain,
    canonical_label: normalizeRegistryLabel(seed.canonical_label),
    display_label: seed.display_label,
    definition: seed.definition,
    aliases: dedupeStrings(seed.aliases),
    parent_term_id: seed.parent_term_id,
    related_term_ids: dedupeStrings(seed.related_term_ids),
    status: seed.status,
    source: seed.source,
    confidence: clampConfidence(seed.confidence),
    evidence_examples: seed.evidence_examples,
    created_at: now,
    updated_at: now,
  }));
}

function seedSemanticTermRegistry(state, { now = new Date().toISOString() } = {}) {
  state.semantic_term_registry = state.semantic_term_registry || [];
  const existingIds = new Set(state.semantic_term_registry.map((record) => record.term_id));
  const created = [];
  buildSeedSemanticTermRegistry({ now }).forEach((record) => {
    if (!existingIds.has(record.term_id)) {
      state.semantic_term_registry.push(record);
      existingIds.add(record.term_id);
      created.push(record);
    }
  });
  state.semantic_term_registry.sort((left, right) => left.term_id.localeCompare(right.term_id));
  return created;
}

function buildRegistryContext(state, {
  domains = SEMANTIC_REGISTRY_DOMAINS,
  limitPerDomain = 40,
} = {}) {
  const domainSet = new Set(domains);
  const rows = [
    ...buildSeedSemanticTermRegistry({ now: 'seed' }),
    ...(state?.semantic_term_registry || []),
  ];
  const byId = new Map();
  rows.forEach((row) => {
    if (domainSet.has(row.domain) && ['active', 'proposed'].includes(row.status)) {
      byId.set(row.term_id, row);
    }
  });
  const grouped = {};
  domains.forEach((domain) => {
    grouped[domain] = [];
  });
  [...byId.values()]
    .sort((left, right) => `${left.domain}:${left.canonical_label}`.localeCompare(`${right.domain}:${right.canonical_label}`))
    .forEach((row) => {
      if (grouped[row.domain] && grouped[row.domain].length < limitPerDomain) {
        grouped[row.domain].push({
          term_id: row.term_id,
          canonical_label: row.canonical_label,
          display_label: row.display_label || row.canonical_label,
          aliases: dedupeStrings(row.aliases),
          definition: row.definition || null,
          status: row.status,
        });
      }
    });
  return grouped;
}

function createSemanticTermId(domain, label) {
  return `sem_${normalizeRegistryLabel(domain)}_${normalizeRegistryLabel(label)}`.replace(/[^a-z0-9_]+/gu, '_');
}

function createSemanticProposalId(proposal) {
  return `semprop_${shortHash([
    proposal.domain,
    proposal.action,
    proposal.existing_term_id || '',
    proposal.proposed_label || '',
    proposal.proposed_alias || '',
    proposal.parent_term_id || '',
  ].join('|'))}`;
}

function writeRegistryProposalsFromActions(state, {
  actions = [],
  evidenceProductIds = [],
  now = new Date().toISOString(),
} = {}) {
  state.semantic_term_registry_proposals = state.semantic_term_registry_proposals || [];
  const existingByKey = new Map(
    state.semantic_term_registry_proposals.map((proposal) => [proposalDedupKey(proposal), proposal])
  );
  const written = [];

  actions.forEach((action) => {
    const normalized = normalizeRegistryAction(action);
    if (!normalized || !PROPOSAL_ACTIONS.includes(normalized.action)) {
      return;
    }
    const proposal = {
      proposal_id: '',
      domain: normalized.domain,
      action: normalized.action,
      proposed_label: normalized.proposed_label,
      proposed_alias: normalized.proposed_alias,
      existing_term_id: normalized.existing_term_id,
      parent_term_id: normalized.parent_term_id,
      evidence_product_ids: dedupeStrings([
        ...evidenceProductIds,
        ...(normalized.evidence_product_ids || []),
      ]),
      evidence_terms: dedupeStrings(normalized.evidence_terms || normalized.evidence || []),
      confidence: normalized.confidence,
      status: 'pending',
      created_at: now,
      updated_at: now,
    };
    proposal.proposal_id = createSemanticProposalId(proposal);
    const key = proposalDedupKey(proposal);
    if (existingByKey.has(key)) {
      return;
    }
    existingByKey.set(key, proposal);
    state.semantic_term_registry_proposals.push(proposal);
    written.push(proposal);
  });

  state.semantic_term_registry_proposals.sort((left, right) => left.proposal_id.localeCompare(right.proposal_id));
  return written;
}

function normalizeRegistryAction(action) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    return null;
  }
  const normalized = {
    action: normalizeRegistryLabel(action.action),
    domain: normalizeRegistryLabel(action.domain),
    existing_term_id: normalizeNullableString(action.existing_term_id),
    proposed_label: normalizeNullableString(action.proposed_label),
    proposed_alias: normalizeNullableString(action.proposed_alias),
    parent_term_id: normalizeNullableString(action.parent_term_id),
    confidence: clampConfidence(action.confidence),
    evidence: normalizeEvidence(action.evidence),
    evidence_product_ids: dedupeStrings(action.evidence_product_ids),
    evidence_terms: dedupeStrings(action.evidence_terms),
    reason: normalizeNullableString(action.reason),
  };
  if (!REGISTRY_ACTIONS.includes(normalized.action) || !SEMANTIC_REGISTRY_DOMAINS.includes(normalized.domain)) {
    return null;
  }
  return normalized;
}

function proposalDedupKey(proposal) {
  return [
    proposal.domain,
    proposal.action,
    normalizeNullableString(proposal.existing_term_id) || '',
    normalizeNullableString(proposal.proposed_label) || '',
    normalizeNullableString(proposal.proposed_alias) || '',
    normalizeNullableString(proposal.parent_term_id) || '',
  ].join('|');
}

function buildFailedEnrichmentResponseRecord({
  runId,
  batchIndex,
  productIds = [],
  provider = 'xai',
  model = null,
  errorType = 'provider_response_error',
  parseError = null,
  rawContent = '',
  now = new Date().toISOString(),
} = {}) {
  const rawContentRedacted = redactProviderContent(rawContent);
  return {
    failed_response_id: `enrich_fail_${shortHash([
      runId || '',
      batchIndex ?? '',
      productIds.join(','),
      rawContentRedacted,
      now,
    ].join('|'))}`,
    run_id: runId || null,
    batch_index: batchIndex ?? null,
    product_ids: dedupeStrings(productIds),
    provider,
    model,
    error_type: errorType,
    parse_error: parseError ? String(parseError).slice(0, 500) : null,
    raw_content_redacted: rawContentRedacted,
    created_at: now,
  };
}

function redactProviderContent(content) {
  return String(content || '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gu, 'Bearer [REDACTED]')
    .replace(/"api[_-]?key"\s*:\s*"[^"]+"/giu, '"api_key":"[REDACTED]"')
    .replace(/xai-[A-Za-z0-9._-]+/gu, '[REDACTED_KEY]')
    .slice(0, 4000);
}

function normalizeRegistryLabel(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\p{L}]+/gu, '_')
    .replace(/^_+|_+$/gu, '');
}

function normalizeNullableString(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().replace(/\s+/gu, ' ');
  return normalized || null;
}

function normalizeEvidence(value) {
  if (Array.isArray(value)) {
    return dedupeStrings(value);
  }
  const scalar = normalizeNullableString(value);
  return scalar ? [scalar] : [];
}

function dedupeStrings(values) {
  const seen = new Set();
  const result = [];
  (Array.isArray(values) ? values : []).forEach((value) => {
    if (typeof value !== 'string') {
      return;
    }
    const normalized = value.trim().replace(/\s+/gu, ' ');
    const key = normalized.toLowerCase();
    if (normalized && !seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  });
  return result;
}

function clampConfidence(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return Math.round(value * 10000) / 10000;
}

function shortHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20);
}

module.exports = {
  CANONICAL_SEMANTIC_V3_PROMPT_VERSION,
  CANONICAL_SEMANTIC_V3_VERSION,
  DEFAULT_REGISTRY_SEED_TERMS,
  REGISTRY_ACTIONS,
  SEMANTIC_REGISTRY_DOMAINS,
  buildFailedEnrichmentResponseRecord,
  buildRegistryContext,
  buildSeedSemanticTermRegistry,
  createSemanticProposalId,
  createSemanticTermId,
  normalizeRegistryAction,
  redactProviderContent,
  seedSemanticTermRegistry,
  writeRegistryProposalsFromActions,
};
