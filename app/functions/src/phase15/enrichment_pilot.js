const crypto = require('node:crypto');

const {
  DEFAULT_GROK_ENDPOINT,
  DEFAULT_GROK_MODEL,
} = require('../phase6/constants');
const { isRuntimeSafeCanonicalProduct } = require('../phase6/product_validation');
const {
  ENRICHMENT_PROMPT_VERSION,
  CANONICAL_SEMANTIC_V3_VERSION,
  RICH_CANONICAL_ENRICHMENT_VERSION,
  RICH_CANONICAL_PROMPT_VERSION,
  buildCanonicalSemanticV3BatchPrompt,
  buildCanonicalSemanticV3JsonSchema,
  buildRichCanonicalEnrichmentBatchPrompt,
  validateCanonicalSemanticV3BatchResponseDetailed,
  validateRichCanonicalEnrichmentBatchResponseDetailed,
} = require('./enrichment');
const {
  buildFailedEnrichmentResponseRecord,
  buildRegistryContext,
  seedSemanticTermRegistry,
  writeRegistryProposalsFromActions,
} = require('./semantic_registry');
const { buildGroceryQueryExpansion } = require('./search_synonyms');

const PILOT_ENRICHMENT_VERSION = RICH_CANONICAL_ENRICHMENT_VERSION;
const DEFAULT_PILOT_LIMIT = 50;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_ESTIMATED_USD_PER_1K_TOKENS = 0.002;
const LLM_PROVIDER = 'xai';
const HEALTHCHECK_PROMPT_VERSION = 'phase15_enrichment_healthcheck_v1';
const MAX_ERROR_BODY_CHARS = 1200;

const PILOT_GROUPS = Object.freeze({
  milk_dairy_eval: Object.freeze({
    keywords: Object.freeze([
      'milk', 'fresh milk', 'uht milk', 'dairy milk', 'yogurt', 'cheese', 'sirene', 'kashkaval',
      'milka', 'chocolate', 'shampoo', 'milk shampoo', 'baby food', 'infant formula', 'baby formula',
      '\u043c\u043b\u044f\u043a\u043e', '\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e',
      '\u043a\u0438\u0441\u0435\u043b\u043e \u043c\u043b\u044f\u043a\u043e', '\u0441\u0438\u0440\u0435\u043d\u0435',
      '\u043a\u0430\u0448\u043a\u0430\u0432\u0430\u043b', '\u0430\u0434\u0430\u043f\u0442\u0438\u0440\u0430\u043d\u043e \u043c\u043b\u044f\u043a\u043e',
      '\u0448\u0430\u043c\u043f\u043e\u0430\u043d',
    ]),
    label: 'milk_dairy_eval',
    category_hint: 'dairy',
  }),
  bread_bakery_eval: Object.freeze({
    keywords: Object.freeze([
      'bread', 'white bread', 'wholegrain bread', 'whole wheat bread', 'toast bread', 'bakery',
      '\u0445\u043b\u044f\u0431', '\u0431\u044f\u043b \u0445\u043b\u044f\u0431',
      '\u043f\u044a\u043b\u043d\u043e\u0437\u044a\u0440\u043d\u0435\u0441\u0442 \u0445\u043b\u044f\u0431',
      '\u0442\u043e\u0441\u0442\u0435\u0440\u0435\u043d \u0445\u043b\u044f\u0431',
    ]),
    label: 'bread_bakery_eval',
    category_hint: 'bakery',
  }),
  cola_beverage_eval: Object.freeze({
    keywords: Object.freeze([
      'coca cola', 'coca-cola', 'coke', 'cola', 'soft drink', 'soda', 'beverage',
      'collagen', 'chocolate', 'shampoo',
      '\u043a\u043e\u043a\u0430 \u043a\u043e\u043b\u0430', '\u043a\u043e\u043a\u0430-\u043a\u043e\u043b\u0430',
      '\u043a\u043e\u043b\u0430', '\u043a\u043e\u043b\u0430\u0433\u0435\u043d',
      '\u0448\u043e\u043a\u043e\u043b\u0430\u0434', '\u0448\u0430\u043c\u043f\u043e\u0430\u043d',
    ]),
    label: 'cola_beverage_eval',
    category_hint: 'beverages',
  }),
  cookies_snacks_eval: Object.freeze({
    keywords: Object.freeze([
      'cookies', 'cookie', 'biscuits', 'biscuit', 'snacks', 'snack', 'chips', 'crisps',
      'crackers', 'wafer', 'wafers', 'dessert', 'chocolate',
      '\u0431\u0438\u0441\u043a\u0432\u0438\u0442\u0438', '\u043a\u0443\u0440\u0430\u0431\u0438\u0438',
      '\u0441\u043b\u0430\u0434\u043a\u0438', '\u0441\u043d\u0430\u043a\u0441', '\u0447\u0438\u043f\u0441',
      '\u0441\u043e\u043b\u0435\u0442\u0438', '\u043a\u0440\u0435\u043a\u0435\u0440\u0438',
      '\u0432\u0430\u0444\u043b\u0438', '\u0434\u0435\u0441\u0435\u0440\u0442',
      '\u0448\u043e\u043a\u043e\u043b\u0430\u0434',
    ]),
    label: 'cookies_snacks_eval',
    category_hint: 'snacks',
  }),
  personal_care_false_positive_eval: Object.freeze({
    keywords: Object.freeze([
      'shampoo', 'conditioner', 'soap', 'personal care', 'hair care', 'hygiene',
      'milk shampoo', 'cola shampoo', 'collagen',
      '\u0448\u0430\u043c\u043f\u043e\u0430\u043d', '\u0441\u0430\u043f\u0443\u043d',
      '\u0431\u0430\u043b\u0441\u0430\u043c', '\u043a\u043e\u043b\u0430\u0433\u0435\u043d',
    ]),
    label: 'personal_care_false_positive_eval',
    category_hint: 'personal_care',
  }),
  baby_food_eval: Object.freeze({
    keywords: Object.freeze([
      'baby food', 'baby snack', 'baby snacks', 'puree', 'infant formula', 'toddler',
      'baby formula', 'adapted milk', 'aptamil', 'pronutra',
      '\u0431\u0435\u0431\u0435\u0448\u043a\u043e', '\u0431\u0435\u0431\u0435\u0448\u043a\u0430',
      '\u043f\u044e\u0440\u0435', '\u0430\u0434\u0430\u043f\u0442\u0438\u0440\u0430\u043d\u043e \u043c\u043b\u044f\u043a\u043e',
      '\u0431\u0435\u0431\u0435\u0448\u043a\u043e \u043c\u043b\u044f\u043a\u043e', '\u0430\u043f\u0442\u0430\u043c\u0438\u043b',
    ]),
    label: 'baby_food_eval',
    category_hint: 'baby_food',
  }),
  search_quality_eval: Object.freeze({
    keywords: Object.freeze([
      'milk', 'bread', 'cola', 'coke', 'cookies', 'snacks', 'shampoo', 'baby food',
      '\u043c\u043b\u044f\u043a\u043e', '\u0445\u043b\u044f\u0431', '\u043a\u043e\u043b\u0430',
      '\u0431\u0438\u0441\u043a\u0432\u0438\u0442\u0438', '\u0448\u0430\u043c\u043f\u043e\u0430\u043d',
      '\u043f\u044e\u0440\u0435',
    ]),
    label: 'search_quality_eval',
    category_hint: 'mixed',
  }),
  snacks: Object.freeze({
    keywords: Object.freeze([
      'cookies', 'cookie', 'biscuits', 'biscuit', 'snacks', 'snack', 'chips', 'crisps',
      'crackers', 'wafer', 'wafers', 'dessert',
      'бисквити', 'курабии', 'сладки', 'снакс', 'чипс', 'солети', 'крекери', 'вафли', 'десерт',
    ]),
    label: 'cookies_snacks_sweets',
    category_hint: 'snacks',
  }),
  beverages: Object.freeze({
    keywords: Object.freeze([
      'coca cola', 'coca-cola', 'coke', 'cola', 'soft drink', 'soda', 'beverage',
      'кока кола', 'кока-кола', 'кола', 'безалкохолно', 'газирано', 'газирана напитка', 'напитка',
    ]),
    label: 'soft_drinks_cola_beverages',
    category_hint: 'beverages',
  }),
  personal_care: Object.freeze({
    keywords: Object.freeze([
      'shampoo', 'conditioner', 'soap', 'personal care', 'hair care', 'hygiene',
      'шампоан', 'сапун', 'балсам',
    ]),
    label: 'personal_care_false_positive_guard',
    category_hint: 'personal_care',
  }),
  baby_food: Object.freeze({
    keywords: Object.freeze([
      'baby food', 'baby snack', 'baby snacks', 'puree', 'infant formula', 'toddler',
      'baby formula', 'adapted milk', 'aptamil', 'pronutra',
      'бебешко', 'бебешка', 'пюре', 'адаптирано мляко', 'бебешко мляко',
    ]),
    label: 'baby_food_snacks',
    category_hint: 'baby_food',
  }),
});

const QUERY_CATEGORY_GROUPS = Object.freeze({
  baby: Object.freeze(['baby_food']),
  baby_food: Object.freeze(['baby_food']),
  beverages: Object.freeze(['beverages']),
  personal_care: Object.freeze(['personal_care']),
  snacks: Object.freeze(['snacks']),
});

function buildPilotConfig(env = process.env) {
  const providerConfig = buildEnrichmentLlmProviderConfig(env);
  return {
    limit: parsePositiveInteger(env.PRICER_ENRICHMENT_PILOT_LIMIT || env.PRICER_ENRICHMENT_LIMIT, DEFAULT_PILOT_LIMIT),
    query: String(env.PRICER_ENRICHMENT_PILOT_QUERY || '').trim(),
    group: normalizeGroup(env.PRICER_ENRICHMENT_PILOT_GROUP || env.PRICER_ENRICHMENT_PILOT_QUERY),
    dryRun: parseBoolean(env.PRICER_ENRICHMENT_DRY_RUN, true),
    runLlm: parseBoolean(env.PRICER_ENRICHMENT_RUN_LLM, false),
    batchSize: parsePositiveInteger(env.PRICER_ENRICHMENT_PILOT_BATCH_SIZE || env.PRICER_ENRICHMENT_BATCH_SIZE, DEFAULT_BATCH_SIZE),
    now: env.PRICER_ENRICHMENT_PILOT_NOW || new Date().toISOString(),
    provider: providerConfig.provider,
    endpointHost: providerConfig.endpoint_host,
    modelName: providerConfig.model || 'pilot-disabled',
    enrichmentVersion: resolvePilotEnrichmentVersion(env),
    promptVersion: resolvePilotEnrichmentVersion(env) === CANONICAL_SEMANTIC_V3_VERSION
      ? 'canonical_semantic_v3_prompt_v1'
      : RICH_CANONICAL_PROMPT_VERSION,
    estimatedUsdPer1kTokens: Number.parseFloat(env.PRICER_ENRICHMENT_PILOT_USD_PER_1K_TOKENS || '') ||
      DEFAULT_ESTIMATED_USD_PER_1K_TOKENS,
  };
}

function resolvePilotEnrichmentVersion(env = process.env) {
  const requested = String(env.PRICER_ENRICHMENT_VERSION || '').trim();
  if (requested === CANONICAL_SEMANTIC_V3_VERSION) {
    return CANONICAL_SEMANTIC_V3_VERSION;
  }
  return RICH_CANONICAL_ENRICHMENT_VERSION;
}

function resolveEnrichmentEndpoint(env = process.env) {
  return String(env.XAI_GROK_ENDPOINT || env.PRICER_ENRICHMENT_ENDPOINT || DEFAULT_GROK_ENDPOINT || '').trim();
}

function resolveEnrichmentModel(env = process.env) {
  return String(env.XAI_GROK_MODEL || env.PRICER_ENRICHMENT_MODEL || DEFAULT_GROK_MODEL || '').trim();
}

function buildEnrichmentLlmProviderConfig(env = process.env) {
  const endpoint = resolveEnrichmentEndpoint(env);
  const model = resolveEnrichmentModel(env);
  const apiKey = String(env.XAI_API_KEY || '').trim();
  const config = {
    provider: LLM_PROVIDER,
    endpoint,
    endpoint_host: null,
    endpoint_protocol: null,
    endpoint_valid: false,
    endpoint_error: null,
    model,
    api_key_present: Boolean(apiKey),
    fetch_available: typeof globalThis.fetch === 'function',
  };

  try {
    const parsed = new URL(endpoint);
    config.endpoint_host = parsed.host;
    config.endpoint_protocol = parsed.protocol;
    config.endpoint_valid = ['https:', 'http:'].includes(parsed.protocol);
    if (!config.endpoint_valid) {
      config.endpoint_error = `unsupported endpoint protocol: ${parsed.protocol}`;
    }
  } catch (error) {
    config.endpoint_error = error.message;
  }

  return config;
}

async function runCanonicalEnrichmentPilot({
  store,
  env = process.env,
  canonicalEnrichmentBatchClient = null,
  logger = null,
} = {}) {
  if (!store) {
    throw new Error('runCanonicalEnrichmentPilot requires a store');
  }

  const config = buildPilotConfig(env);
  const requestedCollections = ['canonical_products', 'canonical_enrichment_store'];
  if (config.enrichmentVersion === CANONICAL_SEMANTIC_V3_VERSION) {
    requestedCollections.push(
      'semantic_term_registry',
      'semantic_term_registry_proposals',
      'canonical_enrichment_failed_responses'
    );
  }
  const state = await store.loadCollections(requestedCollections);
  let seededRegistryTerms = [];
  if (config.enrichmentVersion === CANONICAL_SEMANTIC_V3_VERSION) {
    seededRegistryTerms = seedSemanticTermRegistry(state, { now: config.now });
  }
  const selection = buildPilotCandidateSelection({
    state,
    limit: config.limit,
    query: config.query,
    group: config.group,
    enrichmentVersion: config.enrichmentVersion,
  });
  const candidates = selection.candidates;
  const promptBatches = chunk(candidates, config.batchSize).map((products) =>
    buildBatchEnrichmentPrompt(products, { state, enrichmentVersion: config.enrichmentVersion })
  );
  const summary = {
    dry_run: config.dryRun,
    real_run_opted_in: !config.dryRun && config.runLlm,
    provider: config.provider,
    endpoint_host: config.endpointHost,
    model: config.modelName,
    enrichment_version: config.enrichmentVersion,
    selected_count: candidates.length,
    skipped_same_cache_count: selection.skipped_same_cache_count,
    batch_count: promptBatches.length,
    limit: config.limit,
    query: config.query || null,
    group: config.group || null,
    selected_products: candidates.map(toCandidateSummary),
    quality_report: selection.quality_report,
    estimated_tokens: estimateTokenCount(promptBatches),
    estimated_cost_usd: 0,
    planned_writes: config.dryRun || !config.runLlm ? 0 : candidates.length,
    actual_writes: 0,
    rejected_count: 0,
    rejected_product_ids: [],
    rejected_items: [],
    validation_warnings: [],
    run_warnings: [],
    errors: [],
    registry_proposal_writes: 0,
    registry_seed_writes: config.dryRun || !config.runLlm ? 0 : seededRegistryTerms.length,
    failed_response_writes: 0,
    touched_collections: requestedCollections,
    write_collections: config.dryRun || !config.runLlm
      ? []
      : config.enrichmentVersion === CANONICAL_SEMANTIC_V3_VERSION
        ? ['canonical_enrichment_store', 'semantic_term_registry', 'semantic_term_registry_proposals', 'canonical_enrichment_failed_responses']
        : ['canonical_enrichment_store'],
  };
  summary.estimated_cost_usd = roundCurrency(
    (summary.estimated_tokens / 1000) * config.estimatedUsdPer1kTokens
  );

  if (config.dryRun || !config.runLlm) {
    if (!config.dryRun && !config.runLlm) {
      summary.errors.push({
        message: 'real enrichment requires PRICER_ENRICHMENT_RUN_LLM=true',
      });
    }
    if (logger) {
      logger(JSON.stringify(summary, null, 2));
    }
    return summary;
  }

  if (config.enrichmentVersion === CANONICAL_SEMANTIC_V3_VERSION) {
    for (const term of seededRegistryTerms) {
      await store.upsertRecord('semantic_term_registry', term);
    }
  }

  const client = canonicalEnrichmentBatchClient || requestCanonicalEnrichmentBatch;
  for (const [batchIndex, batch] of promptBatches.entries()) {
    let validation;
    try {
      const responses = await client({
        prompt: batch.prompt,
        products: batch.products,
        env,
        batchIndex: batchIndex + 1,
        enrichmentVersion: config.enrichmentVersion,
      });
      validation = config.enrichmentVersion === CANONICAL_SEMANTIC_V3_VERSION
        ? validateCanonicalSemanticV3BatchResponseDetailed(responses, { products: batch.products })
        : validateRichCanonicalEnrichmentBatchResponseDetailed(responses, { products: batch.products });
    } catch (error) {
      if (config.enrichmentVersion === CANONICAL_SEMANTIC_V3_VERSION && error.raw_content_redacted) {
        await persistFailedResponseArtifact({
          store,
          state,
          error,
          batch,
          batchIndex: batchIndex + 1,
          config,
        });
        summary.failed_response_writes += 1;
      }
      summary.errors.push(buildBatchErrorReport(error, {
        batchIndex: batchIndex + 1,
        batch,
        env,
      }));
      summary.rejected_count += batch.products.length;
      batch.products.forEach((product) => {
        addRejectedItem(summary, {
          batch_index: batchIndex + 1,
          canonical_product_id: product.canonical_product_id,
          error_type: error.error_type || inferErrorType(error),
          message: error.message,
          reason: 'batch_validation_error',
        });
      });
      continue;
    }

    (validation.rejected || []).forEach((rejected) => {
      summary.rejected_count += 1;
      addRejectedItem(summary, {
        batch_index: batchIndex + 1,
        ...rejected,
      });
    });

    (validation.valid || []).forEach((response) => {
      (response.validation_warnings || []).forEach((warning) => {
        addValidationWarning(summary, {
          batch_index: batchIndex + 1,
          canonical_product_id: response.canonical_product_id,
          ...warning,
        });
      });
    });

    const productById = new Map(batch.products.map((product) => [product.canonical_product_id, product]));
    for (const response of validation.valid || []) {
      const product = productById.get(response.canonical_product_id);
      try {
        const enrichment = {
          ...response.enrichment,
          enrichment_source: response.enrichment?.enrichment_source || 'llm',
          enrichment_version: config.enrichmentVersion,
          canonical_name_hash: response.enrichment?.canonical_name_hash ||
            response.enrichment?.product_identity?.canonical_name_hash ||
            canonicalNameHash(product),
        };
        const record = buildPilotEnrichmentRecord({
          product,
          enrichment,
          config,
        });
        await store.upsertRecord('canonical_enrichment_store', record);
        if (config.enrichmentVersion === CANONICAL_SEMANTIC_V3_VERSION) {
          const proposals = writeRegistryProposalsFromActions(state, {
            actions: response.enrichment.registry_actions || [],
            evidenceProductIds: [response.canonical_product_id],
            now: config.now,
          });
          for (const proposal of proposals) {
            await store.upsertRecord('semantic_term_registry_proposals', proposal);
          }
          summary.registry_proposal_writes += proposals.length;
        }
        summary.actual_writes += 1;
      } catch (error) {
        summary.rejected_count += 1;
        addRejectedItem(summary, {
          batch_index: batchIndex + 1,
          error_type: error.error_type || 'validation_or_write_error',
          canonical_product_id: response.canonical_product_id,
          message: error.message,
          reason: 'write_error',
        });
      }
    }
  }

  return summary;
}

function selectEnrichmentPilotCandidates({
  state,
  limit = DEFAULT_PILOT_LIMIT,
  query = '',
  group = null,
  enrichmentVersion = PILOT_ENRICHMENT_VERSION,
} = {}) {
  return buildPilotCandidateSelection({
    state,
    limit,
    query,
    group,
    enrichmentVersion,
  }).candidates;
}

function buildPilotCandidateSelection({
  state,
  limit = DEFAULT_PILOT_LIMIT,
  query = '',
  group = null,
  enrichmentVersion = PILOT_ENRICHMENT_VERSION,
} = {}) {
  const existingById = new Map((state?.canonical_enrichment_store || [])
    .map((record) => [record.canonical_fingerprint, record]));
  const plan = buildPilotSelectionPlan({ query, group });
  const entries = (state?.canonical_products || [])
    .filter(isRuntimeSafeCanonicalProduct)
    .map((product) => scorePilotCandidate({
      product,
      existing: existingById.get(product.canonical_product_id) || null,
      plan,
      enrichmentVersion,
    }));
  const skippedSameCache = entries.filter((entry) => entry.cacheFresh && entry.candidateMatched);
  const excludedByGuardrail = entries.filter((entry) => entry.candidateMatched && entry.guardrail.excluded);
  const selectedEntries = entries
    .filter((entry) => !entry.cacheFresh && !entry.guardrail.excluded && entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return String(left.product.canonical_product_id).localeCompare(String(right.product.canonical_product_id));
    })
    .slice(0, Math.max(0, limit));
  const candidates = selectedEntries.map((entry) => ({
      ...entry.product,
      pilot_match: {
        score: entry.score,
        groups: entry.groups,
        matched_terms: entry.matchedTerms,
        selection_reasons: entry.selectionReasons,
        existing_enrichment: Boolean(entry.existing),
        canonical_name_hash: canonicalNameHash(entry.product),
        cache_hit_same_name: Boolean(entry.existing?.canonical_name_hash === canonicalNameHash(entry.product)),
        cache_hit_same_version: entry.cacheFresh,
      },
    }));

  return {
    candidates,
    skipped_same_cache_count: skippedSameCache.length,
    quality_report: buildPilotQualityReport({
      selectedCandidates: candidates,
      selectedEntries,
      excludedByGuardrail,
      skippedSameCache,
      plan,
    }),
  };
}

function scorePilotCandidate({
  product,
  existing,
  plan,
  enrichmentVersion = PILOT_ENRICHMENT_VERSION,
}) {
  const evidence = buildPilotCandidateEvidence(product, existing);
  const matchedQueryTerms = plan.query_terms.filter((term) => termMatchesEvidence(term, evidence));
  const matchedConceptTerms = plan.concept_terms.filter((term) => termMatchesEvidence(term, evidence));
  const matchedGroupTerms = plan.group_terms.filter((term) => termMatchesEvidence(term, evidence));
  const matchedTerms = [...new Set([
    ...matchedQueryTerms,
    ...matchedConceptTerms,
    ...matchedGroupTerms,
  ])];
  const matchedGroupKeys = plan.group_keys.filter((key) =>
    PILOT_GROUPS[key].keywords.map(normalizeText).some((term) => termMatchesEvidence(term, evidence))
  );
  const guardrail = evaluatePilotGuardrail({
    evidence,
    matchedTerms,
    matchedGroupKeys,
    plan,
  });
  const candidateMatched = matchedTerms.length > 0 || matchedGroupKeys.length > 0;
  const cacheFresh = isSameVersionNameHashCache(existing, product, enrichmentVersion);
  const selectionReasons = [];
  let score = 0;

  if (matchedQueryTerms.length > 0) {
    score += matchedQueryTerms.length * 12;
    selectionReasons.push('query_term_match');
  }
  if (matchedConceptTerms.length > 0) {
    score += matchedConceptTerms.length * 8;
    selectionReasons.push('concept_alias_match');
  }
  if (matchedGroupTerms.length > 0) {
    score += matchedGroupTerms.length * (plan.has_query ? 2 : 5);
    selectionReasons.push('pilot_group_term_match');
  }
  if (matchedGroupKeys.length > 0) {
    score += matchedGroupKeys.length * (plan.has_query ? 4 : 8);
    selectionReasons.push('pilot_group_match');
  }
  if (guardrail.aligned && candidateMatched) {
    score += 10;
    selectionReasons.push('category_guardrail_alignment');
  }
  if (existing) {
    score += 1;
    selectionReasons.push('existing_enrichment_context');
  }
  if (guardrail.excluded) {
    score = 0;
  }

  return {
    product,
    existing,
    matchedTerms: [...new Set(matchedTerms)].slice(0, 12),
    groups: matchedGroupKeys.map((key) => PILOT_GROUPS[key].label),
    selectionReasons: [...new Set(selectionReasons)],
    guardrail,
    candidateMatched,
    cacheFresh,
    score,
  };
}

function buildPilotSelectionPlan({ query = '', group = null } = {}) {
  const normalizedQuery = normalizeText(query);
  const expansion = buildGroceryQueryExpansion(query);
  const explicitGroup = group && PILOT_GROUPS[group] ? group : null;
  const conceptCategoryHints = expansion.matched_concepts
    .map((concept) => normalizeText(concept.category_hint))
    .filter(Boolean);
  const categoryHints = explicitGroup
    ? [PILOT_GROUPS[explicitGroup].category_hint].filter(Boolean)
    : conceptCategoryHints;
  const inferredGroups = explicitGroup
    ? [explicitGroup]
    : inferPilotGroupKeys({ expansion, normalizedQuery });
  const groupKeys = normalizedQuery || explicitGroup
    ? inferredGroups
    : Object.keys(PILOT_GROUPS);
  const queryTerms = normalizedQuery ? [normalizedQuery] : [];
  const conceptTerms = normalizedQuery
    ? dedupeNormalizedTerms([
      ...expansion.expanded_terms,
      ...expansion.matched_concepts.flatMap((concept) => concept.matched_terms || []),
    ])
    : [];
  const groupTerms = dedupeNormalizedTerms(
    groupKeys.flatMap((key) => PILOT_GROUPS[key].keywords)
  );

  return {
    has_query: Boolean(normalizedQuery),
    normalized_query: normalizedQuery,
    query_terms: dedupeNormalizedTerms(queryTerms),
    concept_terms: conceptTerms,
    group_terms: groupTerms,
    group_keys: groupKeys,
    matched_concepts: expansion.matched_concepts,
    category_hints: [...new Set(categoryHints)],
    explicit_group: explicitGroup,
  };
}

function inferPilotGroupKeys({ expansion, normalizedQuery }) {
  const keys = new Set();
  const normalizedGroup = normalizeGroup(normalizedQuery);
  if (normalizedGroup) {
    keys.add(normalizedGroup);
  }
  expansion.matched_concepts.forEach((concept) => {
    (QUERY_CATEGORY_GROUPS[normalizeText(concept.category_hint)] || []).forEach((key) => keys.add(key));
  });
  return [...keys];
}

function buildPilotCandidateEvidence(product, existing) {
  const enrichment = existing?.enrichment || {};
  const values = [
    product.canonical_display_name,
    product.source_example_name,
    product.canonical_brand,
    product.canonical_product_type,
    product.canonical_category_code,
    enrichment.base_product,
    enrichment.product_type,
    enrichment.product_family,
    enrichment.category,
    enrichment.subcategory,
    enrichment.category_l1,
    enrichment.category_l2,
    enrichment.category_l3,
    enrichment.category_l4,
    enrichment.brand,
    enrichment.brand_normalized,
    enrichment.product_line,
    ...(enrichment.flavor || []),
    ...(enrichment.flavor_terms || []),
    ...(enrichment.search_aliases_bg || []),
    ...(enrichment.search_aliases_en || []),
    ...(enrichment.exclusion_terms || []),
    ...(enrichment.attributes || []),
    ...(enrichment.usage_context || []),
  ].map(normalizeText).filter(Boolean);
  const text = values.join(' ');
  const tokens = new Set(tokenizeText(text));

  return {
    text,
    values,
    tokens,
    enrichment,
  };
}

function evaluatePilotGuardrail({
  evidence,
  plan,
}) {
  const hints = new Set(plan.category_hints);
  const reasons = [];
  let excluded = false;
  let aligned = false;
  const personalCare = hasPersonalCareEvidence(evidence);
  const beverage = hasBeverageEvidence(evidence);
  const snackSweet = hasSnackSweetEvidence(evidence);
  const babyFood = hasBabyFoodEvidence(evidence);
  const dairy = hasDairyEvidence(evidence);
  const collagen = hasCollagenEvidence(evidence);
  const milkIntent = plan.matched_concepts.some((concept) => concept.id === 'milk');

  if (hints.has('dairy')) {
    aligned = dairy;
    if (milkIntent && !hasMilkProductEvidence(evidence)) {
      excluded = true;
      reasons.push('milk_query_requires_milk_product');
    }
    if (personalCare) {
      excluded = true;
      reasons.push('dairy_query_excludes_personal_care');
    }
    if (babyFood) {
      excluded = true;
      reasons.push('dairy_query_excludes_baby_food');
    }
    if (snackSweet && !isChocolateMilkLike(evidence)) {
      excluded = true;
      reasons.push('dairy_query_excludes_snacks_sweets');
    }
  }

  if (hints.has('beverages')) {
    aligned = aligned || beverage;
    if (personalCare) {
      excluded = true;
      reasons.push('beverage_query_excludes_personal_care');
    }
    if (collagen) {
      excluded = true;
      reasons.push('beverage_query_excludes_collagen');
    }
    if (snackSweet && !beverage) {
      excluded = true;
      reasons.push('beverage_query_excludes_sweets');
    }
  }

  if (hints.has('snacks')) {
    aligned = aligned || snackSweet;
  }
  if (hints.has('personal_care')) {
    aligned = aligned || personalCare;
  }
  if (hints.has('baby_food')) {
    aligned = aligned || babyFood;
  }

  return {
    excluded,
    aligned,
    reasons,
    detected_categories: {
      baby_food: babyFood,
      beverage,
      collagen,
      dairy,
      personal_care: personalCare,
      snacks_sweets: snackSweet,
    },
  };
}

function buildPilotQualityReport({
  selectedCandidates,
  selectedEntries,
  excludedByGuardrail,
  skippedSameCache = [],
  plan,
}) {
  const topSelectionReasons = countTopReasons(
    selectedEntries.flatMap((entry) => entry.selectionReasons)
  );
  const wrongCategoryWarnings = selectedEntries
    .filter((entry) => likelyWrongCategory(entry.guardrail, plan))
    .slice(0, 10)
    .map((entry) => ({
      canonical_product_id: entry.product.canonical_product_id,
      canonical_name: entry.product.canonical_display_name || null,
      detected_categories: entry.guardrail.detected_categories,
    }));

  return {
    selected_count: selectedCandidates.length,
    skipped_same_cache_count: skippedSameCache.length,
    skipped_same_cache_examples: skippedSameCache.slice(0, 10).map((entry) => ({
      canonical_product_id: entry.product.canonical_product_id,
      canonical_name: entry.product.canonical_display_name || null,
      canonical_name_hash: canonicalNameHash(entry.product),
      enrichment_version: entry.existing?.enrichment_version || entry.existing?.enrichment?.enrichment_version || null,
    })),
    excluded_by_guardrail_count: excludedByGuardrail.length,
    excluded_examples: excludedByGuardrail.slice(0, 10).map((entry) => ({
      canonical_product_id: entry.product.canonical_product_id,
      canonical_name: entry.product.canonical_display_name || null,
      reason: entry.guardrail.reasons[0] || 'guardrail_excluded',
      matched_terms: entry.matchedTerms,
      detected_categories: entry.guardrail.detected_categories,
    })),
    top_selection_reasons: topSelectionReasons,
    first_20_selected_candidates: selectedCandidates.slice(0, 20).map(toCandidateSummary),
    warnings: wrongCategoryWarnings.length > 0
      ? [{
        code: 'selected_candidates_contain_likely_wrong_categories',
        examples: wrongCategoryWarnings,
      }]
      : [],
  };
}

function likelyWrongCategory(guardrail, plan) {
  const hints = new Set(plan.category_hints);
  if (hints.has('dairy')) {
    return guardrail.detected_categories.personal_care ||
      guardrail.detected_categories.baby_food ||
      (guardrail.detected_categories.snacks_sweets && !guardrail.detected_categories.dairy);
  }
  if (hints.has('beverages')) {
    return guardrail.detected_categories.personal_care ||
      guardrail.detected_categories.collagen ||
      (guardrail.detected_categories.snacks_sweets && !guardrail.detected_categories.beverage);
  }
  return false;
}

function countTopReasons(reasons) {
  const counts = new Map();
  reasons.forEach((reason) => {
    counts.set(reason, (counts.get(reason) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return left.reason.localeCompare(right.reason);
    })
    .slice(0, 10);
}

function termMatchesEvidence(term, evidence) {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) {
    return false;
  }
  const termTokens = tokenizeText(normalizedTerm);
  if (termTokens.length === 0) {
    return false;
  }
  if (termTokens.length === 1) {
    return evidence.tokens.has(termTokens[0]);
  }
  return evidence.values.some((value) => containsWholePhrase(value, normalizedTerm));
}

function containsWholePhrase(value, phrase) {
  const normalizedValue = normalizeText(value);
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedValue || !normalizedPhrase) {
    return false;
  }
  return new RegExp(`(?:^| )${escapeRegex(normalizedPhrase)}(?: |$)`, 'u').test(normalizedValue);
}

function hasDairyEvidence(evidence) {
  const enrichment = evidence.enrichment || {};
  if (normalizeText(enrichment.product_family) === 'milk' || normalizeText(enrichment.base_product) === 'milk') {
    return true;
  }
  return hasAnyToken(evidence, ['milk', 'dairy']) ||
    hasAnyPhrase(evidence, [
      'fresh milk',
      'chocolate milk',
      '\u043c\u043b\u044f\u043a\u043e',
      '\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e',
    ]);
}

function hasMilkProductEvidence(evidence) {
  if (hasNonMilkDairyEvidence(evidence)) {
    return false;
  }
  return hasAnyToken(evidence, ['milk', '\u043c\u043b\u044f\u043a\u043e']) ||
    hasAnyPhrase(evidence, [
      'fresh milk',
      'dairy milk',
      '\u043f\u0440\u044f\u0441\u043d\u043e \u043c\u043b\u044f\u043a\u043e',
    ]);
}

function hasNonMilkDairyEvidence(evidence) {
  return hasAnyToken(evidence, [
    'yogurt',
    'yoghurt',
    'cheese',
    'sirene',
    'kashkaval',
    'curd',
    '\u043a\u0438\u0441\u0435\u043b\u043e',
    '\u0441\u0438\u0440\u0435\u043d\u0435',
    '\u043a\u0430\u0448\u043a\u0430\u0432\u0430\u043b',
    '\u0438\u0437\u0432\u0430\u0440\u0430',
  ]);
}

function hasBeverageEvidence(evidence) {
  const enrichment = evidence.enrichment || {};
  if (enrichment.is_beverage === true) {
    return true;
  }
  if (enrichment.is_beverage === false) {
    return false;
  }
  return hasAnyToken(evidence, ['beverage', 'beverages', 'soda', 'cola', 'coke', 'water', 'juice']) ||
    hasAnyPhrase(evidence, [
      'soft drink',
      'soft drinks',
      'coca cola',
      '\u043a\u043e\u043a\u0430 \u043a\u043e\u043b\u0430',
      '\u043a\u043e\u043b\u0430',
      '\u043d\u0430\u043f\u0438\u0442\u043a\u0430',
    ]);
}

function hasPersonalCareEvidence(evidence) {
  const enrichment = evidence.enrichment || {};
  if (enrichment.is_personal_care === true) {
    return true;
  }
  return hasAnyToken(evidence, [
    'shampoo',
    'conditioner',
    'soap',
    'hygiene',
    '\u0448\u0430\u043c\u043f\u043e\u0430\u043d',
    '\u0431\u0430\u043b\u0441\u0430\u043c',
    '\u0441\u0430\u043f\u0443\u043d',
  ]) || hasAnyPhrase(evidence, ['personal care', 'hair care']);
}

function hasSnackSweetEvidence(evidence) {
  return hasAnyToken(evidence, [
    'biscuit',
    'biscuits',
    'cookie',
    'cookies',
    'snack',
    'snacks',
    'chips',
    'crisps',
    'cracker',
    'crackers',
    'wafer',
    'wafers',
    'dessert',
    'chocolate',
    'milka',
    'roshen',
    '\u0431\u0438\u0441\u043a\u0432\u0438\u0442\u0438',
    '\u043a\u0443\u0440\u0430\u0431\u0438\u0438',
    '\u0441\u043d\u0430\u043a\u0441',
    '\u0447\u0438\u043f\u0441',
    '\u0432\u0430\u0444\u043b\u0438',
    '\u0434\u0435\u0441\u0435\u0440\u0442',
    '\u0448\u043e\u043a\u043e\u043b\u0430\u0434',
  ]);
}

function hasBabyFoodEvidence(evidence) {
  return hasAnyToken(evidence, [
    'baby',
    'infant',
    'toddler',
    'puree',
    'aptamil',
    'pronutra',
    '\u0431\u0435\u0431\u0435\u0448\u043a\u043e',
    '\u0431\u0435\u0431\u0435\u0448\u043a\u0430',
    '\u043f\u044e\u0440\u0435',
    '\u0430\u043f\u0442\u0430\u043c\u0438\u043b',
  ]) || hasAnyPhrase(evidence, [
    'baby food',
    'infant formula',
    'baby formula',
    'adapted milk',
    '\u0430\u0434\u0430\u043f\u0442\u0438\u0440\u0430\u043d\u043e \u043c\u043b\u044f\u043a\u043e',
    '\u0431\u0435\u0431\u0435\u0448\u043a\u043e \u043c\u043b\u044f\u043a\u043e',
  ]);
}

function hasCollagenEvidence(evidence) {
  return hasAnyToken(evidence, ['collagen', '\u043a\u043e\u043b\u0430\u0433\u0435\u043d']);
}

function isChocolateMilkLike(evidence) {
  return hasAnyPhrase(evidence, ['chocolate milk']) ||
    hasAnyPhrase(evidence, ['\u0448\u043e\u043a\u043e\u043b\u0430\u0434\u043e\u0432\u043e \u043c\u043b\u044f\u043a\u043e']);
}

function hasAnyToken(evidence, tokens) {
  return tokens.some((token) => evidence.tokens.has(normalizeText(token)));
}

function hasAnyPhrase(evidence, phrases) {
  return phrases.some((phrase) => evidence.values.some((value) => containsWholePhrase(value, phrase)));
}

function dedupeNormalizedTerms(terms) {
  return [...new Set((terms || []).map(normalizeText).filter(Boolean))];
}

function tokenizeText(value) {
  return normalizeText(value)
    .split(/[^\p{L}\p{N}%]+/u)
    .filter(Boolean);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function buildBatchEnrichmentPrompt(products, {
  state = null,
  enrichmentVersion = RICH_CANONICAL_ENRICHMENT_VERSION,
} = {}) {
  const prompt = enrichmentVersion === CANONICAL_SEMANTIC_V3_VERSION
    ? buildCanonicalSemanticV3BatchPrompt(products, {
      registryContext: buildRegistryContext(state),
    })
    : buildRichCanonicalEnrichmentBatchPrompt(products);
  prompt.pilot_context = products.map((product) => ({
      canonical_product_id: product.canonical_product_id,
      pilot_match: product.pilot_match || null,
    }));
  return {
    prompt,
    products,
  };
}

async function requestCanonicalEnrichmentBatch({
  prompt,
  products,
  env = process.env,
  fetchImpl = globalThis.fetch,
  batchIndex = null,
  enrichmentVersion = resolvePilotEnrichmentVersion(env),
}) {
  const providerConfig = buildEnrichmentLlmProviderConfig(env);
  const apiKey = String(env.XAI_API_KEY || '').trim();
  if (!apiKey) {
    throw enrichProviderError(
      new Error('XAI_API_KEY is required for real pilot enrichment'),
      providerConfig,
      { error_type: 'provider_config_error', batch_index: batchIndex }
    );
  }
  if (!providerConfig.endpoint_valid) {
    throw enrichProviderError(
      new Error(`invalid enrichment endpoint: ${providerConfig.endpoint_error || providerConfig.endpoint}`),
      providerConfig,
      { error_type: 'provider_config_error', batch_index: batchIndex }
    );
  }
  if (!providerConfig.model) {
    throw enrichProviderError(
      new Error('enrichment model is required for real pilot enrichment'),
      providerConfig,
      { error_type: 'provider_config_error', batch_index: batchIndex }
    );
  }
  if (typeof fetchImpl !== 'function') {
    throw enrichProviderError(
      new Error('global fetch is not available for real pilot enrichment'),
      providerConfig,
      { error_type: 'provider_config_error', batch_index: batchIndex }
    );
  }

  let response;
  try {
    response = await fetchImpl(providerConfig.endpoint, {
      method: 'POST',
      headers: buildProviderHeaders(apiKey),
      body: JSON.stringify(buildProviderRequestBody({
        model: providerConfig.model,
        responseFormat: buildProviderResponseFormat({ env, enrichmentVersion }),
        messages: [
          {
            role: 'system',
            content: 'You enrich selected canonical product meaning for search. Return strict JSON only.',
          },
          {
            role: 'user',
            content: JSON.stringify(prompt),
          },
        ],
      })),
    });
  } catch (error) {
    throw enrichProviderError(error, providerConfig, {
      error_type: 'provider_network_error',
      batch_index: batchIndex,
    });
  }

  if (!response.ok) {
    const body = await safeReadResponseBody(response);
    throw enrichProviderError(
      new Error(`pilot enrichment request failed with status ${response.status}`),
      providerConfig,
      {
        error_type: 'provider_http_error',
        batch_index: batchIndex,
        status: response.status,
        status_text: response.statusText || null,
        response_body: body,
      }
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw enrichProviderError(error, providerConfig, {
      error_type: 'provider_response_error',
      batch_index: batchIndex,
    });
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw enrichProviderError(
      new Error('pilot enrichment model response missing content'),
      providerConfig,
      { error_type: 'provider_response_error', batch_index: batchIndex }
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(stripJsonCodeFence(content.trim()));
  } catch (error) {
    const enriched = enrichProviderError(error, providerConfig, {
      error_type: 'provider_response_error',
      batch_index: batchIndex,
    });
    enriched.parse_error = error.message;
    enriched.raw_content_redacted = content.slice(0, 4000);
    throw enriched;
  }
  const productResponses = Array.isArray(parsed?.products) ? parsed.products : parsed;
  if (!Array.isArray(productResponses)) {
    throw enrichProviderError(
      new Error('pilot enrichment response must contain products[]'),
      providerConfig,
      { error_type: 'provider_response_error', batch_index: batchIndex }
    );
  }

  return enrichmentVersion === CANONICAL_SEMANTIC_V3_VERSION ? parsed : productResponses;
}

async function runCanonicalEnrichmentHealthcheck({
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const providerConfig = buildEnrichmentLlmProviderConfig(env);
  const liveRequest = parseBoolean(
    env.PRICER_ENRICHMENT_LLM_HEALTHCHECK_LIVE || env.PRICER_ENRICHMENT_HEALTHCHECK_LIVE,
    false
  );
  const result = {
    ok: false,
    provider: providerConfig.provider,
    endpoint: providerConfig.endpoint,
    endpoint_host: providerConfig.endpoint_host,
    endpoint_protocol: providerConfig.endpoint_protocol,
    endpoint_valid: providerConfig.endpoint_valid,
    model: providerConfig.model,
    api_key_present: providerConfig.api_key_present,
    fetch_available: providerConfig.fetch_available || typeof fetchImpl === 'function',
    live_request_requested: liveRequest,
    live_request_made: false,
    prompt_version: HEALTHCHECK_PROMPT_VERSION,
    errors: [],
  };

  if (!result.endpoint_valid) {
    result.errors.push({
      error_type: 'provider_config_error',
      message: providerConfig.endpoint_error || 'invalid endpoint',
    });
  }
  if (!result.model) {
    result.errors.push({
      error_type: 'provider_config_error',
      message: 'model is required',
    });
  }
  if (!result.api_key_present) {
    result.errors.push({
      error_type: 'provider_config_error',
      message: 'XAI_API_KEY is missing',
    });
  }
  if (!result.fetch_available) {
    result.errors.push({
      error_type: 'provider_config_error',
      message: 'Node fetch is not available',
    });
  }

  if (!liveRequest) {
    result.ok = result.errors.length === 0;
    return result;
  }

  if (result.errors.length > 0) {
    result.ok = false;
    return result;
  }

  try {
    result.live_request_made = true;
    const response = await fetchImpl(providerConfig.endpoint, {
      method: 'POST',
      headers: buildProviderHeaders(String(env.XAI_API_KEY || '').trim()),
      body: JSON.stringify(buildProviderRequestBody({
        model: providerConfig.model,
        maxTokens: 12,
        messages: [
          {
            role: 'system',
            content: 'Return strict JSON only.',
          },
          {
            role: 'user',
            content: 'Return {"ok":true}.',
          },
        ],
      })),
    });
    result.status = response.status;
    result.status_text = response.statusText || null;
    if (!response.ok) {
      result.errors.push({
        ...buildProviderErrorSummary(
          enrichProviderError(
            new Error(`healthcheck request failed with status ${response.status}`),
            providerConfig,
            {
              error_type: 'provider_http_error',
              status: response.status,
              status_text: response.statusText || null,
              response_body: await safeReadResponseBody(response),
            }
          )
        ),
      });
      result.ok = false;
      return result;
    }

    const payload = await response.json();
    result.response_has_content = typeof payload?.choices?.[0]?.message?.content === 'string';
    result.ok = true;
    return result;
  } catch (error) {
    result.errors.push(buildProviderErrorSummary(enrichProviderError(error, providerConfig, {
      error_type: 'provider_network_error',
    })));
    result.ok = false;
    return result;
  }
}

function buildProviderHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

function buildProviderRequestBody({
  model,
  messages,
  maxTokens = null,
  responseFormat = null,
}) {
  return {
    model,
    temperature: 0,
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
    ...(responseFormat ? { response_format: responseFormat } : {}),
    messages,
  };
}

function buildProviderResponseFormat({
  env = process.env,
  enrichmentVersion = RICH_CANONICAL_ENRICHMENT_VERSION,
} = {}) {
  if (String(env.PRICER_ENRICHMENT_STRUCTURED_OUTPUT || '').trim().toLowerCase() === 'false') {
    return { type: 'json_object' };
  }
  if (enrichmentVersion === CANONICAL_SEMANTIC_V3_VERSION) {
    return {
      type: 'json_schema',
      json_schema: {
        name: 'canonical_semantic_v3_batch',
        strict: true,
        schema: buildCanonicalSemanticV3JsonSchema(),
      },
    };
  }
  if (String(env.PRICER_ENRICHMENT_RESPONSE_FORMAT || '').trim().toLowerCase() === 'json_object') {
    return { type: 'json_object' };
  }
  return null;
}

async function safeReadResponseBody(response) {
  try {
    const text = await response.text();
    return truncateErrorBody(text);
  } catch (error) {
    return `<<failed to read response body: ${error.message}>>`;
  }
}

function truncateErrorBody(text) {
  const value = String(text || '');
  if (value.length <= MAX_ERROR_BODY_CHARS) {
    return value;
  }
  return `${value.slice(0, MAX_ERROR_BODY_CHARS)}...<truncated>`;
}

function enrichProviderError(error, providerConfig, extra = {}) {
  const enriched = error instanceof Error ? error : new Error(String(error || 'provider error'));
  enriched.error_type = extra.error_type || enriched.error_type || 'provider_error';
  enriched.provider = providerConfig.provider;
  enriched.endpoint_host = providerConfig.endpoint_host;
  enriched.model = providerConfig.model;
  enriched.batch_index = extra.batch_index ?? enriched.batch_index ?? null;
  if (extra.status !== undefined) {
    enriched.status = extra.status;
  }
  if (extra.status_text !== undefined) {
    enriched.status_text = extra.status_text;
  }
  if (extra.response_body !== undefined) {
    enriched.response_body = extra.response_body;
  }
  return enriched;
}

function addRejectedItem(summary, item) {
  const normalized = {
    canonical_product_id: item.canonical_product_id || null,
    batch_index: item.batch_index ?? null,
    error_type: item.error_type || 'validation_error',
    message: item.message || null,
    field: item.field || null,
    original_value: item.original_value ?? null,
    normalized_value: item.normalized_value ?? null,
    reason: item.reason || 'validation_error',
  };
  summary.rejected_items.push(normalized);
  if (normalized.canonical_product_id && !summary.rejected_product_ids.includes(normalized.canonical_product_id)) {
    summary.rejected_product_ids.push(normalized.canonical_product_id);
  }
  summary.errors.push(normalized);
}

function addValidationWarning(summary, warning) {
  const normalized = {
    canonical_product_id: warning.canonical_product_id || null,
    batch_index: warning.batch_index ?? null,
    field: warning.field || null,
    original_value: warning.original_value ?? null,
    normalized_value: warning.normalized_value ?? null,
    reason: warning.reason || 'validation_warning',
  };
  summary.validation_warnings.push(normalized);
  summary.run_warnings.push(normalized);
}

function buildBatchErrorReport(error, {
  batchIndex,
  batch,
  env,
}) {
  const providerConfig = buildEnrichmentLlmProviderConfig(env);
  return {
    batch_index: batchIndex,
    batch_product_ids: batch.products.map((product) => product.canonical_product_id),
    ...buildProviderErrorSummary(enrichProviderError(error, providerConfig, {
      error_type: error.error_type || inferErrorType(error),
      batch_index: batchIndex,
    })),
  };
}

async function persistFailedResponseArtifact({
  store,
  state,
  error,
  batch,
  batchIndex,
  config,
}) {
  const record = buildFailedEnrichmentResponseRecord({
    runId: config.now,
    batchIndex,
    productIds: batch.products.map((product) => product.canonical_product_id),
    provider: config.provider,
    model: config.modelName,
    errorType: error.error_type || 'provider_response_error',
    parseError: error.parse_error || error.message,
    rawContent: error.raw_content_redacted || '',
    now: config.now,
  });
  state.canonical_enrichment_failed_responses = state.canonical_enrichment_failed_responses || [];
  state.canonical_enrichment_failed_responses.push(record);
  await store.upsertRecord('canonical_enrichment_failed_responses', record);
  return record;
}

function buildProviderErrorSummary(error) {
  return {
    error_type: error.error_type || inferErrorType(error),
    provider: error.provider || LLM_PROVIDER,
    endpoint_host: error.endpoint_host || null,
    model: error.model || null,
    message: error.message,
    error_name: error.name || null,
    error_code: error.code || null,
    cause_name: error.cause?.name || null,
    cause_code: error.cause?.code || null,
    cause_message: error.cause?.message || null,
    status: error.status ?? null,
    status_text: error.status_text ?? null,
    response_body: error.response_body ?? null,
    parse_error: error.parse_error ?? null,
  };
}

function inferErrorType(error) {
  if (error?.status) {
    return 'provider_http_error';
  }
  if (/validation|rich batch|rich enrichment|invalid|missing|unexpected|duplicate|count mismatch/iu.test(error?.message || '')) {
    return 'validation_error';
  }
  if (/fetch failed|network|ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN|UND_ERR/iu.test([
    error?.message,
    error?.code,
    error?.cause?.code,
    error?.cause?.message,
  ].filter(Boolean).join(' '))) {
    return 'provider_network_error';
  }
  return error?.error_type || 'provider_error';
}

function stripJsonCodeFence(content) {
  return content
    .replace(/^```(?:json)?\s*/iu, '')
    .replace(/\s*```$/u, '')
    .trim();
}

function buildPilotEnrichmentRecord({
  product,
  enrichment,
  config,
}) {
  return {
    canonical_fingerprint: product.canonical_product_id,
    canonical_product_id: product.canonical_product_id,
    canonical_name_hash: canonicalNameHash(product),
    enrichment,
    explicit_claim_evidence: [],
    model_name: config.modelName,
    prompt_version: config.promptVersion,
    enrichment_source: 'llm',
    enrichment_version: config.enrichmentVersion || PILOT_ENRICHMENT_VERSION,
    created_at: config.now,
    updated_at: config.now,
  };
}

function canonicalNameHash(product) {
  return crypto
    .createHash('sha256')
    .update([
      product?.canonical_product_id || '',
      product?.canonical_display_name || '',
      product?.source_example_name || '',
    ].join('|'))
    .digest('hex');
}

function isSameVersionNameHashCache(existing, product, enrichmentVersion = PILOT_ENRICHMENT_VERSION) {
  if (!existing || !product?.canonical_product_id) {
    return false;
  }
  const expectedHash = canonicalNameHash(product);
  const existingHash = existing.canonical_name_hash || existing.enrichment?.canonical_name_hash || null;
  const existingVersion = existing.enrichment_version || existing.enrichment?.enrichment_version || null;
  return existingHash === expectedHash && existingVersion === enrichmentVersion;
}

function toCandidateSummary(product) {
  return {
    canonical_product_id: product.canonical_product_id,
    canonical_name: product.canonical_display_name || null,
    source_example_name: product.source_example_name || null,
    canonical_brand: product.canonical_brand || null,
    canonical_product_type: product.canonical_product_type || null,
    pilot_match: product.pilot_match,
  };
}

function estimateTokenCount(promptBatches) {
  const chars = JSON.stringify(promptBatches.map((batch) => batch.prompt)).length;
  return Math.ceil(chars / 4);
}

function normalizeGroup(value) {
  const normalized = normalizeText(value).replace(/\s+/gu, '_');
  if (!normalized) {
    return null;
  }
  if (PILOT_GROUPS[normalized]) {
    return normalized;
  }
  if (['cookies', 'cookie', 'snack', 'snacks', 'chips'].includes(normalized)) {
    return 'snacks';
  }
  if (['cola', 'coca_cola', 'coke', 'soft_drink', 'beverage', 'beverages'].includes(normalized)) {
    return 'cola_beverage_eval';
  }
  if (['shampoo', 'personal_care', 'hair_care'].includes(normalized)) {
    return 'personal_care_false_positive_eval';
  }
  if (['baby', 'baby_food', 'baby_snacks'].includes(normalized)) {
    return 'baby_food_eval';
  }
  if (['milk', 'fresh_milk', 'dairy'].includes(normalized)) {
    return 'milk_dairy_eval';
  }
  if (['bread', 'bakery'].includes(normalized)) {
    return 'bread_bakery_eval';
  }
  return null;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('bg-BG')
    .replace(/[^\p{L}\p{N}%]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  return String(value).trim().toLowerCase() === 'true';
}

function parsePositiveInteger(value, defaultValue) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function roundCurrency(value) {
  return Math.round(value * 1000000) / 1000000;
}

module.exports = {
  PILOT_ENRICHMENT_VERSION,
  PILOT_GROUPS,
  buildBatchEnrichmentPrompt,
  buildEnrichmentLlmProviderConfig,
  buildPilotConfig,
  buildProviderErrorSummary,
  buildProviderResponseFormat,
  canonicalNameHash,
  requestCanonicalEnrichmentBatch,
  resolvePilotEnrichmentVersion,
  runCanonicalEnrichmentHealthcheck,
  runCanonicalEnrichmentPilot,
  selectEnrichmentPilotCandidates,
};
