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
  SEMANTIC_REGISTRY_DOMAINS,
  buildFailedEnrichmentResponseRecord,
  buildRegistryContext,
  seedSemanticTermRegistry,
  writeTaxonomyTermProposals,
  writeRegistryProposalsFromActions,
} = require('./semantic_registry');
const { buildGroceryQueryExpansion } = require('./search_synonyms');

const PILOT_ENRICHMENT_VERSION = RICH_CANONICAL_ENRICHMENT_VERSION;
const DEFAULT_PILOT_LIMIT = 50;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_V3_BATCH_SIZE = 5;
const DEFAULT_ESTIMATED_USD_PER_1K_TOKENS = 0.002;
const LLM_PROVIDER = 'xai';
const HEALTHCHECK_PROMPT_VERSION = 'phase15_enrichment_healthcheck_v1';
const MAX_ERROR_BODY_CHARS = 1200;
const DEFAULT_LLM_MAX_RETRIES = 3;
const DEFAULT_LLM_RETRY_BASE_MS = 750;
const DEFAULT_LLM_RETRY_MAX_MS = 8000;
const DEFAULT_LLM_REQUEST_TIMEOUT_MS = 300000;
const DEFAULT_REQUEST_BLOAT_CHAR_THRESHOLD = 100000;
const DEFAULT_REGISTRY_CONTEXT_MAX_TERMS_PER_DOMAIN = 12;
const DEFAULT_REGISTRY_CONTEXT_MAX_TOTAL_TERMS = 48;
const RETRYABLE_HTTP_STATUSES = Object.freeze([408, 425, 429, 500, 502, 503, 504]);

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
  const enrichmentVersion = resolvePilotEnrichmentVersion(env);
  const defaultBatchSize = enrichmentVersion === CANONICAL_SEMANTIC_V3_VERSION
    ? DEFAULT_V3_BATCH_SIZE
    : DEFAULT_BATCH_SIZE;
  return {
    limit: parsePositiveInteger(env.PRICER_ENRICHMENT_PILOT_LIMIT || env.PRICER_ENRICHMENT_LIMIT, DEFAULT_PILOT_LIMIT),
    query: String(env.PRICER_ENRICHMENT_PILOT_QUERY || '').trim(),
    group: normalizeGroup(env.PRICER_ENRICHMENT_PILOT_GROUP || env.PRICER_ENRICHMENT_PILOT_QUERY),
    dryRun: parseBoolean(env.PRICER_ENRICHMENT_DRY_RUN, true),
    runLlm: parseBoolean(env.PRICER_ENRICHMENT_RUN_LLM, false),
    batchSize: parsePositiveInteger(env.PRICER_ENRICHMENT_PILOT_BATCH_SIZE || env.PRICER_ENRICHMENT_BATCH_SIZE, defaultBatchSize),
    now: env.PRICER_ENRICHMENT_PILOT_NOW || new Date().toISOString(),
    provider: providerConfig.provider,
    endpointHost: providerConfig.endpoint_host,
    modelName: providerConfig.model || 'pilot-disabled',
    enrichmentVersion,
    promptVersion: enrichmentVersion === CANONICAL_SEMANTIC_V3_VERSION
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
  const selectionWarnings = selection.evidence_warnings || [];
  const candidates = selection.candidates;
  const promptBatches = chunk(candidates, config.batchSize).map((products) =>
    buildBatchEnrichmentPrompt(products, { state, env, enrichmentVersion: config.enrichmentVersion })
  );
  const responseFormat = buildProviderResponseFormat({ env, enrichmentVersion: config.enrichmentVersion });
  const promptMetrics = summarizePromptBatches(promptBatches, {
    responseFormat,
    model: config.modelName,
  });
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
    prompt_char_count: promptMetrics.prompt_char_count,
    request_body_char_count: promptMetrics.request_body_char_count,
    estimated_prompt_tokens: promptMetrics.estimated_prompt_tokens,
    estimated_request_tokens: promptMetrics.estimated_request_tokens,
    estimated_tokens: promptMetrics.estimated_request_tokens,
    registry_context_term_count: promptMetrics.registry_context_term_count,
    registry_context_domains: promptMetrics.registry_context_domains,
    json_schema_char_count: promptMetrics.json_schema_char_count,
    per_batch_token_estimate: promptMetrics.per_batch_token_estimate,
    response_format_json_schema_included: promptMetrics.response_format_json_schema_included,
    total_request_count: promptMetrics.total_request_count,
    estimated_cost_usd: 0,
    planned_writes: config.dryRun || !config.runLlm ? 0 : candidates.length,
    actual_writes: 0,
    rejected_count: 0,
    rejected_product_ids: [],
    rejected_items: [],
    validation_warnings: [],
    run_warnings: [...selectionWarnings],
    errors: [],
    registry_proposal_writes: 0,
    registry_seed_writes: config.dryRun || !config.runLlm ? 0 : seededRegistryTerms.length,
    failed_response_writes: 0,
    provider_attempt_count: 0,
    retry_count: 0,
    retryable_error_count: 0,
    provider_attempt_history: [],
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
      recordProviderAttemptHistory(summary, {
        batchIndex: batchIndex + 1,
        batch,
        carrier: responses,
      });
      try {
        validation = config.enrichmentVersion === CANONICAL_SEMANTIC_V3_VERSION
          ? validateCanonicalSemanticV3BatchResponseDetailed(responses, { products: batch.products })
          : validateRichCanonicalEnrichmentBatchResponseDetailed(responses, { products: batch.products });
      } catch (error) {
        if (config.enrichmentVersion === CANONICAL_SEMANTIC_V3_VERSION && typeof responses === 'string') {
          error.error_type = error.error_type || 'provider_response_error';
          error.parse_error = error.parse_error || error.message;
          error.raw_content_redacted = responses.slice(0, 4000);
        }
        throw error;
      }
    } catch (error) {
      recordProviderAttemptHistory(summary, {
        batchIndex: batchIndex + 1,
        batch,
        carrier: error,
      });
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
          repairStatus: response.enrichment_repair_status || 'clean',
          repairWarnings: response.repair_warnings || [],
          discardedFields: response.discarded_fields || [],
        });
        await store.upsertRecord('canonical_enrichment_store', record);
        if (config.enrichmentVersion === CANONICAL_SEMANTIC_V3_VERSION) {
          const proposals = writeRegistryProposalsFromActions(state, {
            actions: response.enrichment.registry_actions || [],
            evidenceProductIds: [response.canonical_product_id],
            now: config.now,
          });
          const taxonomyProposals = writeTaxonomyTermProposals(state, {
            taxonomyClassification: response.enrichment.taxonomy_classification,
            evidenceProductIds: [response.canonical_product_id],
            now: config.now,
          });
          for (const proposal of [...proposals, ...taxonomyProposals]) {
            await store.upsertRecord('semantic_term_registry_proposals', proposal);
          }
          summary.registry_proposal_writes += proposals.length + taxonomyProposals.length;
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
  const evidenceWarnings = [];
  const entries = (state?.canonical_products || [])
    .filter(isRuntimeSafeCanonicalProduct)
    .map((product) => scorePilotCandidate({
      product,
      existing: existingById.get(product.canonical_product_id) || null,
      plan,
      enrichmentVersion,
      evidenceWarnings,
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
    evidence_warnings: evidenceWarnings,
  };
}

function scorePilotCandidate({
  product,
  existing,
  plan,
  enrichmentVersion = PILOT_ENRICHMENT_VERSION,
  evidenceWarnings = null,
}) {
  const evidence = buildPilotCandidateEvidence(product, existing, {
    warnings: evidenceWarnings,
  });
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
  const queryTerms = normalizedQuery
    ? [normalizedQuery, ...tokenizeText(normalizedQuery)]
    : [];
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

function buildPilotCandidateEvidence(product, existing, {
  warnings = null,
} = {}) {
  const enrichment = existing?.enrichment || {};
  const values = [];
  const warningContext = {
    canonical_product_id: product?.canonical_product_id || existing?.canonical_product_id || existing?.canonical_fingerprint || null,
  };

  addScalarEvidence(values, product.canonical_display_name);
  addScalarEvidence(values, product.source_example_name);
  addScalarEvidence(values, product.canonical_brand);
  addScalarEvidence(values, product.canonical_product_type);
  addScalarEvidence(values, product.canonical_category_code);

  [
    'base_product',
    'product_type',
    'product_family',
    'category',
    'subcategory',
    'category_l1',
    'category_l2',
    'category_l3',
    'category_l4',
    'brand',
    'brand_normalized',
    'product_line',
    'dairy_type',
    'milk_source',
    'beverage_type',
  ].forEach((field) => {
    if (isV3ObjectField(enrichment, field)) {
      return;
    }
    addScalarEvidence(values, enrichment[field], {
      warnings,
      field,
      warningContext,
    });
  });

  [
    'flavor',
    'flavor_terms',
    'search_aliases_bg',
    'search_aliases_en',
    'exclusion_terms',
    'usage_context',
    'synonym_terms',
    'negative_match_hints',
    'do_not_match_queries',
    'should_match_queries',
    'category_path',
  ].forEach((field) => addArrayEvidence(values, enrichment[field], {
    warnings,
    field,
    warningContext,
  }));

  addV2OrV3AttributesEvidence(values, enrichment.attributes, {
    warnings,
    warningContext,
  });
  addV3TaxonomyEvidence(values, enrichment.taxonomy_classification, {
    warnings,
    warningContext,
  });
  addV3CategoryEvidence(values, enrichment.category, {
    warnings,
    warningContext,
  });
  addV3SemanticSectionEvidence(values, enrichment.packaging, 'packaging', {
    warnings,
    warningContext,
  });
  addV3SemanticSectionEvidence(values, enrichment.product_form, 'product_form', {
    warnings,
    warningContext,
  });
  addV3SemanticUsageProfileEvidence(values, enrichment.semantic_usage_profile, {
    warnings,
    warningContext,
  });
  addV3SemanticEmbeddingSummaryEvidence(values, enrichment.semantic_embedding_summary, {
    warnings,
    warningContext,
  });
  addRegistryActionEvidence(values, enrichment.registry_actions, {
    warnings,
    warningContext,
  });

  const normalizedValues = values.map(normalizeText).filter(Boolean);
  const text = normalizedValues.join(' ');
  const tokens = new Set(tokenizeText(text));

  return {
    text,
    values: normalizedValues,
    tokens,
    enrichment,
  };
}

function isV3ObjectField(enrichment, field) {
  return enrichment?.schema_version === CANONICAL_SEMANTIC_V3_VERSION &&
    enrichment[field] &&
    typeof enrichment[field] === 'object' &&
    !Array.isArray(enrichment[field]);
}

function addScalarEvidence(values, value, {
  warnings = null,
  field = null,
  warningContext = {},
} = {}) {
  if (value === undefined || value === null || value === '') {
    return;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    values.push(String(value));
    return;
  }
  addEvidenceShapeWarning(warnings, {
    ...warningContext,
    field,
    reason: 'unexpected_scalar_evidence_shape',
    observed_type: Array.isArray(value) ? 'array' : typeof value,
  });
}

function addArrayEvidence(values, value, {
  warnings = null,
  field = null,
  warningContext = {},
} = {}) {
  if (value === undefined || value === null) {
    return;
  }
  if (!Array.isArray(value)) {
    addEvidenceShapeWarning(warnings, {
      ...warningContext,
      field,
      reason: 'unexpected_array_evidence_shape',
      observed_type: typeof value,
    });
    return;
  }
  value.forEach((entry) => addScalarEvidence(values, entry, {
    warnings,
    field,
    warningContext,
  }));
}

function addV2OrV3AttributesEvidence(values, attributes, {
  warnings = null,
  warningContext = {},
} = {}) {
  if (attributes === undefined || attributes === null) {
    return;
  }
  if (Array.isArray(attributes)) {
    addArrayEvidence(values, attributes, {
      warnings,
      field: 'attributes',
      warningContext,
    });
    return;
  }
  if (typeof attributes !== 'object') {
    addEvidenceShapeWarning(warnings, {
      ...warningContext,
      field: 'attributes',
      reason: 'unexpected_attributes_shape',
      observed_type: typeof attributes,
    });
    return;
  }

  addNestedObjectEvidence(values, attributes.dairy, 'attributes.dairy', {
    warnings,
    warningContext,
  });
  addNestedObjectEvidence(values, attributes.beverage, 'attributes.beverage', {
    warnings,
    warningContext,
  });
  addNestedObjectEvidence(values, attributes.storage, 'attributes.storage', {
    warnings,
    warningContext,
  });
  addNestedObjectEvidence(values, attributes.quantity, 'attributes.quantity', {
    warnings,
    warningContext,
  });
  addArrayEvidence(values, attributes.nutrition_claims, {
    warnings,
    field: 'attributes.nutrition_claims',
    warningContext,
  });
  addArrayEvidence(values, attributes.dietary_claims, {
    warnings,
    field: 'attributes.dietary_claims',
    warningContext,
  });
  addArrayEvidence(values, attributes.flavor_terms, {
    warnings,
    field: 'attributes.flavor_terms',
    warningContext,
  });
  addArrayEvidence(values, attributes.preparation_state, {
    warnings,
    field: 'attributes.preparation_state',
    warningContext,
  });
}

function addNestedObjectEvidence(values, objectValue, field, {
  warnings = null,
  warningContext = {},
} = {}) {
  if (objectValue === undefined || objectValue === null) {
    return;
  }
  if (Array.isArray(objectValue) || typeof objectValue !== 'object') {
    addEvidenceShapeWarning(warnings, {
      ...warningContext,
      field,
      reason: 'unexpected_object_evidence_shape',
      observed_type: Array.isArray(objectValue) ? 'array' : typeof objectValue,
    });
    return;
  }
  Object.entries(objectValue).forEach(([key, value]) => {
    addScalarEvidence(values, key);
    if (Array.isArray(value)) {
      addArrayEvidence(values, value, { warnings, field, warningContext });
      return;
    }
    if (value && typeof value === 'object') {
      addNestedObjectEvidence(values, value, `${field}.${key}`, { warnings, warningContext });
      return;
    }
    addScalarEvidence(values, value, { warnings, field, warningContext });
  });
}

function addV3CategoryEvidence(values, category, {
  warnings = null,
  warningContext = {},
} = {}) {
  if (category === undefined || category === null || typeof category === 'string') {
    return;
  }
  if (Array.isArray(category) || typeof category !== 'object') {
    addEvidenceShapeWarning(warnings, {
      ...warningContext,
      field: 'category',
      reason: 'unexpected_category_shape',
      observed_type: Array.isArray(category) ? 'array' : typeof category,
    });
    return;
  }
  addArrayEvidence(values, category.raw_terms, { warnings, field: 'category.raw_terms', warningContext });
  addArrayEvidence(values, category.category_path_raw, { warnings, field: 'category.category_path_raw', warningContext });
  addArrayEvidence(values, category.proposed_terms, { warnings, field: 'category.proposed_terms', warningContext });
  addArrayEvidence(values, category.search_buckets, { warnings, field: 'category.search_buckets', warningContext });
  addRegistryMatchArrayEvidence(values, category.registry_matches, 'category.registry_matches', {
    warnings,
    warningContext,
  });
}

function addV3TaxonomyEvidence(values, taxonomy, {
  warnings = null,
  warningContext = {},
} = {}) {
  if (taxonomy === undefined || taxonomy === null) {
    return;
  }
  if (Array.isArray(taxonomy) || typeof taxonomy !== 'object') {
    addEvidenceShapeWarning(warnings, {
      ...warningContext,
      field: 'taxonomy_classification',
      reason: 'unexpected_taxonomy_classification_shape',
      observed_type: Array.isArray(taxonomy) ? 'array' : typeof taxonomy,
    });
    return;
  }
  addArrayEvidence(values, taxonomy.taxonomy_path_raw, { warnings, field: 'taxonomy_classification.taxonomy_path_raw', warningContext });
  addArrayEvidence(values, taxonomy.taxonomy_path_labels, { warnings, field: 'taxonomy_classification.taxonomy_path_labels', warningContext });
  addScalarEvidence(values, taxonomy.primary_taxonomy_label, { warnings, field: 'taxonomy_classification.primary_taxonomy_label', warningContext });
  addArrayEvidence(values, taxonomy.raw_category_terms, { warnings, field: 'taxonomy_classification.raw_category_terms', warningContext });
  addRegistryMatchArrayEvidence(values, taxonomy.registry_matches, 'taxonomy_classification.registry_matches', {
    warnings,
    warningContext,
  });
  if (Array.isArray(taxonomy.proposed_terms)) {
    taxonomy.proposed_terms.forEach((term) => {
      if (!term || typeof term !== 'object' || Array.isArray(term)) {
        return;
      }
      addScalarEvidence(values, term.proposed_label, { warnings, field: 'taxonomy_classification.proposed_terms.proposed_label', warningContext });
      addScalarEvidence(values, term.parent_label, { warnings, field: 'taxonomy_classification.proposed_terms.parent_label', warningContext });
      addArrayEvidence(values, term.aliases, { warnings, field: 'taxonomy_classification.proposed_terms.aliases', warningContext });
      addArrayEvidence(values, term.evidence, { warnings, field: 'taxonomy_classification.proposed_terms.evidence', warningContext });
    });
  }
  addArrayEvidence(values, taxonomy.evidence, { warnings, field: 'taxonomy_classification.evidence', warningContext });
}

function addV3SemanticSectionEvidence(values, section, field, {
  warnings = null,
  warningContext = {},
} = {}) {
  if (section === undefined || section === null || typeof section === 'string') {
    addScalarEvidence(values, section);
    return;
  }
  if (Array.isArray(section) || typeof section !== 'object') {
    addEvidenceShapeWarning(warnings, {
      ...warningContext,
      field,
      reason: 'unexpected_semantic_section_shape',
      observed_type: Array.isArray(section) ? 'array' : typeof section,
    });
    return;
  }
  addArrayEvidence(values, section.raw_terms, { warnings, field: `${field}.raw_terms`, warningContext });
  addScalarEvidence(values, section.description, { warnings, field: `${field}.description`, warningContext });
  addRegistryMatchEvidence(values, section.registry_match, `${field}.registry_match`, { warnings, warningContext });
  addArrayEvidence(values, section.proposed_aliases, { warnings, field: `${field}.proposed_aliases`, warningContext });
  addScalarEvidence(values, section.proposed_new_term, { warnings, field: `${field}.proposed_new_term`, warningContext });
  addScalarEvidence(values, section.search_bucket, { warnings, field: `${field}.search_bucket`, warningContext });
  addArrayEvidence(values, section.evidence, { warnings, field: `${field}.evidence`, warningContext });
}

function addV3SemanticUsageProfileEvidence(values, profile, {
  warnings = null,
  warningContext = {},
} = {}) {
  if (profile === undefined || profile === null) {
    return;
  }
  if (Array.isArray(profile) || typeof profile !== 'object') {
    addEvidenceShapeWarning(warnings, {
      ...warningContext,
      field: 'semantic_usage_profile',
      reason: 'unexpected_semantic_usage_profile_shape',
      observed_type: Array.isArray(profile) ? 'array' : typeof profile,
    });
    return;
  }
  [
    'cuisine_contexts',
    'culinary_roles',
    'dish_roles',
    'meal_contexts',
    'common_uses',
    'preparation_contexts',
    'pairing_suggestions',
    'substitute_terms',
    'consumer_search_intents',
    'not_for',
    'evidence',
  ].forEach((field) => addArrayEvidence(values, profile[field], {
    warnings,
    field: `semantic_usage_profile.${field}`,
    warningContext,
  }));

  const flavorProfile = profile.flavor_profile;
  if (flavorProfile === undefined || flavorProfile === null) {
    return;
  }
  if (Array.isArray(flavorProfile) || typeof flavorProfile !== 'object') {
    addEvidenceShapeWarning(warnings, {
      ...warningContext,
      field: 'semantic_usage_profile.flavor_profile',
      reason: 'unexpected_flavor_profile_shape',
      observed_type: Array.isArray(flavorProfile) ? 'array' : typeof flavorProfile,
    });
    return;
  }
  addArrayEvidence(values, flavorProfile.primary_tastes, {
    warnings,
    field: 'semantic_usage_profile.flavor_profile.primary_tastes',
    warningContext,
  });
  addArrayEvidence(values, flavorProfile.descriptors, {
    warnings,
    field: 'semantic_usage_profile.flavor_profile.descriptors',
    warningContext,
  });
  addScalarEvidence(values, flavorProfile.intensity, {
    warnings,
    field: 'semantic_usage_profile.flavor_profile.intensity',
    warningContext,
  });
}

function addV3SemanticEmbeddingSummaryEvidence(values, summary, {
  warnings = null,
  warningContext = {},
} = {}) {
  if (summary === undefined || summary === null) {
    return;
  }
  if (Array.isArray(summary) || typeof summary !== 'object') {
    addEvidenceShapeWarning(warnings, {
      ...warningContext,
      field: 'semantic_embedding_summary',
      reason: 'unexpected_semantic_embedding_summary_shape',
      observed_type: Array.isArray(summary) ? 'array' : typeof summary,
    });
    return;
  }
  addScalarEvidence(values, summary.summary, {
    warnings,
    field: 'semantic_embedding_summary.summary',
    warningContext,
  });
  addScalarEvidence(values, summary.summary_language, {
    warnings,
    field: 'semantic_embedding_summary.summary_language',
    warningContext,
  });
  addArrayEvidence(values, summary.included_aspects, {
    warnings,
    field: 'semantic_embedding_summary.included_aspects',
    warningContext,
  });
  addArrayEvidence(values, summary.evidence, {
    warnings,
    field: 'semantic_embedding_summary.evidence',
    warningContext,
  });
}

function addRegistryMatchArrayEvidence(values, matches, field, {
  warnings = null,
  warningContext = {},
} = {}) {
  if (matches === undefined || matches === null) {
    return;
  }
  if (!Array.isArray(matches)) {
    addEvidenceShapeWarning(warnings, {
      ...warningContext,
      field,
      reason: 'unexpected_registry_matches_shape',
      observed_type: typeof matches,
    });
    return;
  }
  matches.forEach((match) => addRegistryMatchEvidence(values, match, field, { warnings, warningContext }));
}

function addRegistryMatchEvidence(values, match, field, {
  warnings = null,
  warningContext = {},
} = {}) {
  if (match === undefined || match === null) {
    return;
  }
  if (Array.isArray(match) || typeof match !== 'object') {
    addEvidenceShapeWarning(warnings, {
      ...warningContext,
      field,
      reason: 'unexpected_registry_match_shape',
      observed_type: Array.isArray(match) ? 'array' : typeof match,
    });
    return;
  }
  addScalarEvidence(values, match.domain, { warnings, field: `${field}.domain`, warningContext });
  addScalarEvidence(values, match.term_id, { warnings, field: `${field}.term_id`, warningContext });
  addScalarEvidence(values, match.canonical_label, { warnings, field: `${field}.canonical_label`, warningContext });
  addArrayEvidence(values, match.evidence, { warnings, field: `${field}.evidence`, warningContext });
}

function addRegistryActionEvidence(values, actions, {
  warnings = null,
  warningContext = {},
} = {}) {
  if (actions === undefined || actions === null) {
    return;
  }
  if (!Array.isArray(actions)) {
    addEvidenceShapeWarning(warnings, {
      ...warningContext,
      field: 'registry_actions',
      reason: 'unexpected_registry_actions_shape',
      observed_type: typeof actions,
    });
    return;
  }
  actions.forEach((action) => {
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      addEvidenceShapeWarning(warnings, {
        ...warningContext,
        field: 'registry_actions',
        reason: 'unexpected_registry_action_shape',
        observed_type: Array.isArray(action) ? 'array' : typeof action,
      });
      return;
    }
    [
      'action',
      'domain',
      'existing_term_id',
      'proposed_label',
      'proposed_alias',
      'parent_term_id',
      'reason',
    ].forEach((field) => addScalarEvidence(values, action[field], {
      warnings,
      field: `registry_actions.${field}`,
      warningContext,
    }));
    addArrayEvidence(values, action.evidence, { warnings, field: 'registry_actions.evidence', warningContext });
  });
}

function addEvidenceShapeWarning(warnings, warning) {
  if (!Array.isArray(warnings)) {
    return;
  }
  const normalized = {
    canonical_product_id: warning.canonical_product_id || null,
    field: warning.field || null,
    reason: warning.reason || 'unexpected_enrichment_evidence_shape',
    observed_type: warning.observed_type || null,
  };
  const key = JSON.stringify(normalized);
  if (!warnings.some((entry) => JSON.stringify(entry) === key)) {
    warnings.push(normalized);
  }
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
  env = process.env,
  enrichmentVersion = RICH_CANONICAL_ENRICHMENT_VERSION,
} = {}) {
  const prompt = enrichmentVersion === CANONICAL_SEMANTIC_V3_VERSION
    ? buildCanonicalSemanticV3BatchPrompt(products, {
      registryContext: buildRelevantV3RegistryContext(products, state, env),
      includeResponseJsonSchema: false,
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

function buildRelevantV3RegistryContext(products = [], state = null, env = process.env) {
  const relevantText = buildRegistryRelevantText(products);
  const domains = inferRelevantRegistryDomains(products, relevantText);
  return buildRegistryContext(state, {
    domains,
    limitPerDomain: parsePositiveInteger(
      env.PRICER_REGISTRY_CONTEXT_MAX_TERMS_PER_DOMAIN,
      DEFAULT_REGISTRY_CONTEXT_MAX_TERMS_PER_DOMAIN
    ),
    maxTotalTerms: parsePositiveInteger(
      env.PRICER_REGISTRY_CONTEXT_MAX_TOTAL_TERMS,
      DEFAULT_REGISTRY_CONTEXT_MAX_TOTAL_TERMS
    ),
    relevantText,
    proposedMode: 'relevant',
  });
}

function compactPromptForProviderRequest(prompt, {
  responseFormat = null,
  enrichmentVersion = RICH_CANONICAL_ENRICHMENT_VERSION,
} = {}) {
  if (
    enrichmentVersion !== CANONICAL_SEMANTIC_V3_VERSION ||
    responseFormat?.type !== 'json_schema' ||
    !prompt ||
    typeof prompt !== 'object' ||
    Array.isArray(prompt) ||
    !prompt.response_json_schema
  ) {
    return prompt;
  }
  const strictOutputRules = Array.isArray(prompt.strict_output_rules)
    ? prompt.strict_output_rules.map((rule) =>
      String(rule).includes('exactly this JSON schema')
        ? 'Follow the provided response_format json_schema exactly.'
        : rule
    )
    : ['Follow the provided response_format json_schema exactly.'];
  return {
    ...prompt,
    strict_output_rules: strictOutputRules,
    semantic_usage_profile_guidance: prompt.semantic_usage_profile_guidance
      ? {
        ...prompt.semantic_usage_profile_guidance,
        conservative_examples: undefined,
      }
      : undefined,
    semantic_embedding_summary_guidance: prompt.semantic_embedding_summary_guidance
      ? {
        ...prompt.semantic_embedding_summary_guidance,
        examples: undefined,
      }
      : undefined,
    response_shape: {
      products: [{
        canonical_product_id: 'string; must exactly match one input id',
        enrichment: 'canonical_semantic_v3 object matching the provided response_format json_schema',
      }],
    },
    response_schema_transport: 'response_format.json_schema',
    response_json_schema: undefined,
  };
}

function inferRelevantRegistryDomains(products = [], relevantText = '') {
  const text = normalizeText(relevantText);
  const domains = new Set([
    'product_taxonomy',
    'product_category',
    'food_category',
    'packaging',
    'product_form',
    'storage_type',
    'quality_tier',
  ]);
  const groupKeys = new Set();
  products.forEach((product) => {
    (product?.pilot_match?.groups || []).forEach((group) => groupKeys.add(normalizeGroup(group) || normalizeText(group)));
  });
  const hasGroup = (...keys) => keys.some((key) => groupKeys.has(key));
  const hasText = (pattern) => pattern.test(text);

  if (
    hasGroup('milk_dairy_eval') ||
    hasText(/\b(milk|dairy|yogurt|yoghurt|cheese|sirene|kashkaval|butter|cream)\b/u) ||
    hasText(/мляко|кисело|сирене|кашкавал/u)
  ) {
    domains.add('dairy_type');
    domains.add('milk_source');
  }
  if (
    hasGroup('cola_beverage_eval', 'beverages') ||
    hasText(/\b(cola|coke|coca|beverage|drink|soda|juice|water|coffee|tea)\b/u) ||
    hasText(/кола|напитка|сок|вода/u)
  ) {
    domains.add('flavor');
  }
  if (hasText(/\b(chocolate|vanilla|strawberry|plain|natural|flavor|flavour)\b/u) || hasText(/шоколад|ванилия|ягода/u)) {
    domains.add('flavor');
  }
  if (
    hasText(/\b(organic|bio|vegan|vegetarian|gluten|lactose|sugar free|diet)\b/u) ||
    hasText(/био|веган|глутен|лактоза|захар/u)
  ) {
    domains.add('dietary_claim');
  }
  if (hasText(/\b(plastic|glass|paper|paperboard|metal|aluminum|steel)\b/u) || hasText(/пласт|стък|метал/u)) {
    domains.add('material');
  }
  if (hasText(/\b(fresh|uht|frozen|ready|cook|cooking|ambient|refrigerated)\b/u) || hasText(/прясно|замраз|готов|охлад/u)) {
    domains.add('preparation_state');
  }

  return SEMANTIC_REGISTRY_DOMAINS.filter((domain) => domains.has(domain));
}

function buildRegistryRelevantText(products = []) {
  return products.map((product) => [
    product?.canonical_display_name,
    product?.source_example_name,
    product?.canonical_brand,
    product?.canonical_product_type,
    product?.canonical_category_code,
    ...(product?.pilot_match?.groups || []),
    ...(product?.pilot_match?.matched_terms || []),
    ...(product?.pilot_match?.selection_reasons || []),
  ].filter(Boolean).join(' ')).join(' ');
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

  const responseFormat = buildProviderResponseFormat({ env, enrichmentVersion });
  const outboundPrompt = compactPromptForProviderRequest(prompt, {
    responseFormat,
    enrichmentVersion,
  });
  const requestBody = buildProviderRequestBody({
    model: providerConfig.model,
    responseFormat,
    messages: [
      {
        role: 'system',
        content: 'You enrich selected canonical product meaning for search. Return strict JSON only.',
      },
      {
        role: 'user',
        content: JSON.stringify(outboundPrompt),
      },
    ],
  });
  const requestMetrics = summarizeProviderRequestBody(requestBody, {
    prompt: outboundPrompt,
    responseFormat,
  });
  const providerResult = await requestProviderChatCompletionWithRetry({
    providerConfig,
    apiKey,
    requestBody,
    requestMetrics,
    env,
    fetchImpl,
    batchIndex,
  });
  const { response, attemptMetadata } = providerResult;

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    const enriched = enrichProviderError(error, providerConfig, {
      error_type: 'provider_response_error',
      batch_index: batchIndex,
    });
    attachAttemptMetadata(enriched, attemptMetadata);
    throw enriched;
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    const enriched = enrichProviderError(
      new Error('pilot enrichment model response missing content'),
      providerConfig,
      { error_type: 'provider_response_error', batch_index: batchIndex }
    );
    attachAttemptMetadata(enriched, attemptMetadata);
    throw enriched;
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
    attachAttemptMetadata(enriched, attemptMetadata);
    throw enriched;
  }
  const productResponses = Array.isArray(parsed?.products) ? parsed.products : parsed;
  if (!Array.isArray(productResponses)) {
    const enriched = enrichProviderError(
      new Error('pilot enrichment response must contain products[]'),
      providerConfig,
      { error_type: 'provider_response_error', batch_index: batchIndex }
    );
    attachAttemptMetadata(enriched, attemptMetadata);
    throw enriched;
  }

  const result = enrichmentVersion === CANONICAL_SEMANTIC_V3_VERSION ? parsed : productResponses;
  attachAttemptMetadata(result, attemptMetadata);
  attachRequestMetrics(result, requestMetrics);
  return result;
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
    const enrichmentVersion = resolvePilotEnrichmentVersion(env);
    const responseFormat = buildProviderResponseFormat({ env, enrichmentVersion });
    const providerResult = await requestProviderChatCompletionWithRetry({
      providerConfig,
      apiKey: String(env.XAI_API_KEY || '').trim(),
      env,
      fetchImpl,
      batchIndex: 'healthcheck',
      requestBody: buildProviderRequestBody({
        model: providerConfig.model,
        maxTokens: responseFormat?.type === 'json_schema' ? 256 : 12,
        responseFormat,
        messages: [
          {
            role: 'system',
            content: 'Return strict JSON only.',
          },
          {
            role: 'user',
            content: responseFormat?.type === 'json_schema'
              ? 'Return {"products":[]}.'
              : 'Return {"ok":true}.',
          },
        ],
      }),
    });
    const { response, attemptMetadata } = providerResult;
    result.enrichment_version = enrichmentVersion;
    result.response_format_type = responseFormat?.type || null;
    result.provider_attempt_count = attemptMetadata.provider_attempt_count;
    result.retry_count = attemptMetadata.retry_count;
    result.retryable_error_count = attemptMetadata.retryable_error_count;
    result.attempt_history = attemptMetadata.attempt_history;
    result.status = response.status;
    result.status_text = response.statusText || null;
    const payload = await response.json();
    result.response_has_content = typeof payload?.choices?.[0]?.message?.content === 'string';
    result.ok = true;
    return result;
  } catch (error) {
    result.errors.push(buildProviderErrorSummary(enrichProviderError(error, providerConfig, {
      error_type: error.error_type || inferErrorType(error),
    })));
    result.ok = false;
    return result;
  }
}

function buildProviderHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Connection: 'close',
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

async function requestProviderChatCompletionWithRetry({
  providerConfig,
  apiKey,
  requestBody,
  requestMetrics = null,
  env = process.env,
  fetchImpl = globalThis.fetch,
  batchIndex = null,
} = {}) {
  const retryConfig = buildLlmRetryConfig(env);
  const bodyText = JSON.stringify(requestBody);
  const metrics = requestMetrics || summarizeProviderRequestBody(requestBody);
  const bloatThreshold = parsePositiveInteger(
    env.PRICER_LLM_REQUEST_BLOAT_CHAR_THRESHOLD,
    DEFAULT_REQUEST_BLOAT_CHAR_THRESHOLD
  );
  const attemptHistory = [];
  let lastError = null;
  const maxAttempts = retryConfig.maxRetries + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptStartedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort(new Error(`provider request timed out after ${retryConfig.requestTimeoutMs}ms`));
    }, retryConfig.requestTimeoutMs);
    let response = null;
    try {
      response = await fetchImpl(providerConfig.endpoint, {
        method: 'POST',
        headers: buildProviderHeaders(apiKey),
        body: bodyText,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        attemptHistory.push({
          attempt,
          success: true,
          status: response.status,
          retryable: false,
          duration_ms: Date.now() - attemptStartedAt,
          ...metricsForAttempt(metrics),
        });
        return {
          response,
          attemptMetadata: buildAttemptMetadata(attemptHistory),
        };
      }

      const body = await safeReadResponseBody(response);
      const retryable = isRetryableHttpFailure(response.status, body);
      const error = enrichProviderError(
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
      if (metrics.request_body_char_count >= bloatThreshold && retryable) {
        error.error_type = 'possible_local_request_bloat';
        error.request_size_classification = 'possible_local_request_bloat';
      }
      lastError = error;
      const canRetry = retryable && attempt <= retryConfig.maxRetries;
      attemptHistory.push(buildAttemptHistoryEntry({
        attempt,
        error,
        retryable,
        retry_after_ms: canRetry ? computeRetryDelayMs(attempt, retryConfig) : null,
        duration_ms: Date.now() - attemptStartedAt,
        requestMetrics: metrics,
      }));
      if (canRetry) {
        await sleep(attemptHistory[attemptHistory.length - 1].retry_after_ms);
        continue;
      }
      throw finalizeProviderAttemptError(error, attemptHistory);
    } catch (error) {
      clearTimeout(timeout);
      if (response && error?.attempt_history) {
        throw error;
      }
      const enriched = enrichProviderError(error, providerConfig, {
        error_type: 'provider_network_error',
        batch_index: batchIndex,
      });
      if (isAbortLikeError(error)) {
        enriched.timed_out = true;
        enriched.timeout_ms = retryConfig.requestTimeoutMs;
      }
      if (metrics.request_body_char_count >= bloatThreshold) {
        enriched.error_type = 'possible_local_request_bloat';
        enriched.request_size_classification = 'possible_local_request_bloat';
      }
      const retryable = isRetryableNetworkFailure(enriched);
      const retryLimit = isEnotfoundError(enriched) ? Math.min(1, retryConfig.maxRetries) : retryConfig.maxRetries;
      const canRetry = retryable && attempt <= retryLimit;
      lastError = enriched;
      attemptHistory.push(buildAttemptHistoryEntry({
        attempt,
        error: enriched,
        retryable,
        retry_after_ms: canRetry ? computeRetryDelayMs(attempt, retryConfig) : null,
        duration_ms: Date.now() - attemptStartedAt,
        requestMetrics: metrics,
      }));
      if (canRetry) {
        await sleep(attemptHistory[attemptHistory.length - 1].retry_after_ms);
        continue;
      }
      throw finalizeProviderAttemptError(enriched, attemptHistory);
    }
  }

  throw finalizeProviderAttemptError(lastError || new Error('provider request failed'), attemptHistory);
}

function buildLlmRetryConfig(env = process.env) {
  return {
    maxRetries: parseNonNegativeInteger(env.PRICER_LLM_MAX_RETRIES, DEFAULT_LLM_MAX_RETRIES),
    retryBaseMs: parseNonNegativeInteger(env.PRICER_LLM_RETRY_BASE_MS, DEFAULT_LLM_RETRY_BASE_MS),
    retryMaxMs: parsePositiveInteger(env.PRICER_LLM_RETRY_MAX_MS, DEFAULT_LLM_RETRY_MAX_MS),
    requestTimeoutMs: parsePositiveInteger(env.PRICER_LLM_REQUEST_TIMEOUT_MS, DEFAULT_LLM_REQUEST_TIMEOUT_MS),
  };
}

function buildAttemptMetadata(attemptHistory) {
  return {
    attempt_history: attemptHistory,
    provider_attempt_count: attemptHistory.length,
    retry_count: Math.max(0, attemptHistory.length - 1),
    retryable_error_count: attemptHistory.filter((entry) => entry.retryable && !entry.success).length,
  };
}

function buildAttemptHistoryEntry({
  attempt,
  error,
  retryable,
  retry_after_ms,
  duration_ms = null,
  requestMetrics = null,
}) {
  return {
    attempt,
    success: false,
    error_type: error.error_type || inferErrorType(error),
    message: error.message,
    status: error.status ?? null,
    status_text: error.status_text ?? null,
    error_name: error.name || null,
    error_code: error.code || null,
    cause_name: error.cause?.name || null,
    cause_code: error.cause?.code || null,
    cause_message: error.cause?.message || null,
    timed_out: Boolean(error.timed_out),
    retryable: Boolean(retryable),
    retry_after_ms,
    duration_ms,
    request_size_classification: error.request_size_classification || null,
    ...metricsForAttempt(requestMetrics),
  };
}

function finalizeProviderAttemptError(error, attemptHistory) {
  const enriched = error instanceof Error ? error : new Error(String(error || 'provider request failed'));
  attachAttemptMetadata(enriched, buildAttemptMetadata(attemptHistory));
  if (attemptHistory.some((entry) => entry.retryable)) {
    enriched.exhausted_retries = true;
    enriched.error_type = attemptHistory.some((entry) => entry.error_type === 'possible_local_request_bloat')
      ? 'possible_local_request_bloat'
      : 'provider_network_error';
  }
  return enriched;
}

function metricsForAttempt(requestMetrics = null) {
  if (!requestMetrics) {
    return {};
  }
  return {
    prompt_char_count: requestMetrics.prompt_char_count ?? null,
    request_body_char_count: requestMetrics.request_body_char_count ?? null,
    estimated_prompt_tokens: requestMetrics.estimated_prompt_tokens ?? null,
    estimated_request_tokens: requestMetrics.estimated_request_tokens ?? null,
    registry_context_term_count: requestMetrics.registry_context_term_count ?? null,
    registry_context_domains: requestMetrics.registry_context_domains || [],
    json_schema_char_count: requestMetrics.json_schema_char_count ?? null,
    response_format_json_schema_included: Boolean(requestMetrics.response_format_json_schema_included),
  };
}

function attachAttemptMetadata(target, metadata) {
  if (!target || !metadata) {
    return target;
  }
  Object.defineProperties(target, {
    attempt_history: {
      value: metadata.attempt_history || [],
      enumerable: false,
      configurable: true,
    },
    provider_attempt_count: {
      value: metadata.provider_attempt_count || 0,
      enumerable: false,
      configurable: true,
    },
    retry_count: {
      value: metadata.retry_count || 0,
      enumerable: false,
      configurable: true,
    },
    retryable_error_count: {
      value: metadata.retryable_error_count || 0,
      enumerable: false,
      configurable: true,
    },
  });
  return target;
}

function isRetryableHttpFailure(status, body = '') {
  if (RETRYABLE_HTTP_STATUSES.includes(status)) {
    return true;
  }
  if (status === 409) {
    return /retryable|try again|temporar|conflict_retryable/iu.test(String(body || ''));
  }
  return false;
}

function isRetryableNetworkFailure(error) {
  if (isAbortLikeError(error)) {
    return true;
  }
  const text = [
    error?.message,
    error?.name,
    error?.code,
    error?.cause?.name,
    error?.cause?.code,
    error?.cause?.message,
  ].filter(Boolean).join(' ');
  return /UND_ERR_SOCKET|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|SocketError|socket hang up|network/iu.test(text);
}

function isAbortLikeError(error) {
  const text = [
    error?.message,
    error?.name,
    error?.code,
    error?.cause?.name,
    error?.cause?.code,
    error?.cause?.message,
  ].filter(Boolean).join(' ');
  return /AbortError|aborted|timed out|timeout/iu.test(text);
}

function isEnotfoundError(error) {
  const text = [
    error?.code,
    error?.cause?.code,
    error?.message,
    error?.cause?.message,
  ].filter(Boolean).join(' ');
  return /ENOTFOUND/iu.test(text);
}

function computeRetryDelayMs(attempt, retryConfig) {
  const exponential = retryConfig.retryBaseMs * (2 ** Math.max(0, attempt - 1));
  const capped = Math.min(retryConfig.retryMaxMs, exponential);
  const jitter = capped * (0.25 + Math.random() * 0.5);
  return Math.max(0, Math.round(jitter));
}

function sleep(ms) {
  if (!ms || ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function recordProviderAttemptHistory(summary, {
  batchIndex,
  batch,
  carrier,
}) {
  const attemptHistory = carrier?.attempt_history;
  if (!Array.isArray(attemptHistory) || attemptHistory.length === 0) {
    return;
  }
  const providerAttemptCount = carrier.provider_attempt_count || attemptHistory.length;
  const retryCount = carrier.retry_count ?? Math.max(0, attemptHistory.length - 1);
  const retryableErrorCount = carrier.retryable_error_count ??
    attemptHistory.filter((entry) => entry.retryable && !entry.success).length;
  summary.provider_attempt_count += providerAttemptCount;
  summary.retry_count += retryCount;
  summary.retryable_error_count += retryableErrorCount;
  summary.provider_attempt_history.push({
    batch_index: batchIndex,
    product_ids: batch.products.map((product) => product.canonical_product_id),
    provider_attempt_count: providerAttemptCount,
    retry_count: retryCount,
    retryable_error_count: retryableErrorCount,
    exhausted_retries: Boolean(carrier.exhausted_retries),
    attempts: attemptHistory,
  });
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
    timed_out: Boolean(error.timed_out),
    timeout_ms: error.timeout_ms ?? null,
    exhausted_retries: Boolean(error.exhausted_retries),
    provider_attempt_count: error.provider_attempt_count ?? null,
    retry_count: error.retry_count ?? null,
    retryable_error_count: error.retryable_error_count ?? null,
    attempt_history: Array.isArray(error.attempt_history) ? error.attempt_history : [],
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
  repairStatus = 'clean',
  repairWarnings = [],
  discardedFields = [],
}) {
  const needsHumanReview = repairStatus !== 'clean' || Boolean(enrichment?.needs_human_review);
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
    enrichment_repair_status: repairStatus,
    repair_warnings: repairWarnings,
    discarded_fields: discardedFields,
    needs_human_review: needsHumanReview,
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

function summarizePromptBatches(promptBatches = [], {
  responseFormat = null,
  model = 'pilot-disabled',
} = {}) {
  const batchMetrics = promptBatches.map((batch) => {
    const requestBody = buildProviderRequestBody({
      model,
      responseFormat,
      messages: [
        {
          role: 'system',
          content: 'You enrich selected canonical product meaning for search. Return strict JSON only.',
        },
        {
          role: 'user',
          content: JSON.stringify(batch.prompt),
        },
      ],
    });
    return summarizeProviderRequestBody(requestBody, {
      prompt: batch.prompt,
      responseFormat,
    });
  });
  const domainSet = new Set();
  batchMetrics.forEach((metrics) => {
    (metrics.registry_context_domains || []).forEach((domain) => domainSet.add(domain));
  });
  return {
    prompt_char_count: sumBy(batchMetrics, 'prompt_char_count'),
    request_body_char_count: sumBy(batchMetrics, 'request_body_char_count'),
    estimated_prompt_tokens: sumBy(batchMetrics, 'estimated_prompt_tokens'),
    estimated_request_tokens: sumBy(batchMetrics, 'estimated_request_tokens'),
    registry_context_term_count: sumBy(batchMetrics, 'registry_context_term_count'),
    registry_context_domains: [...domainSet].sort(),
    json_schema_char_count: batchMetrics.length > 0 ? batchMetrics[0].json_schema_char_count : 0,
    per_batch_token_estimate: batchMetrics.map((metrics, index) => ({
      batch_index: index + 1,
      prompt_char_count: metrics.prompt_char_count,
      request_body_char_count: metrics.request_body_char_count,
      estimated_prompt_tokens: metrics.estimated_prompt_tokens,
      estimated_request_tokens: metrics.estimated_request_tokens,
      registry_context_term_count: metrics.registry_context_term_count,
      registry_context_domains: metrics.registry_context_domains,
      json_schema_char_count: metrics.json_schema_char_count,
      response_format_json_schema_included: metrics.response_format_json_schema_included,
    })),
    response_format_json_schema_included: batchMetrics.some((metrics) => metrics.response_format_json_schema_included),
    total_request_count: promptBatches.length,
  };
}

function summarizeProviderRequestBody(requestBody, {
  prompt = null,
  responseFormat = null,
} = {}) {
  const promptText = JSON.stringify(prompt ?? {});
  const requestBodyText = JSON.stringify(requestBody ?? {});
  const jsonSchema = responseFormat?.type === 'json_schema'
    ? responseFormat.json_schema?.schema
    : null;
  const registryContext = prompt?.registry_context || {};
  const registryDomains = Object.keys(registryContext)
    .filter((domain) => Array.isArray(registryContext[domain]) && registryContext[domain].length > 0)
    .sort();
  return {
    prompt_char_count: prompt ? promptText.length : 0,
    request_body_char_count: requestBodyText.length,
    estimated_prompt_tokens: prompt ? Math.ceil(promptText.length / 4) : 0,
    estimated_request_tokens: Math.ceil(requestBodyText.length / 4),
    registry_context_term_count: countRegistryContextTerms(registryContext),
    registry_context_domains: registryDomains,
    json_schema_char_count: jsonSchema ? JSON.stringify(jsonSchema).length : 0,
    response_format_json_schema_included: responseFormat?.type === 'json_schema',
  };
}

function attachRequestMetrics(target, metrics) {
  if (!target || !metrics) {
    return target;
  }
  Object.defineProperties(target, {
    request_metrics: {
      value: metrics,
      enumerable: false,
      configurable: true,
    },
  });
  return target;
}

function countRegistryContextTerms(registryContext = {}) {
  return Object.values(registryContext || {}).reduce((total, terms) =>
    total + (Array.isArray(terms) ? terms.length : 0), 0);
}

function sumBy(items, field) {
  return items.reduce((total, item) => total + (Number.isFinite(item?.[field]) ? item[field] : 0), 0);
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

function parseNonNegativeInteger(value, defaultValue) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultValue;
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
  buildLlmRetryConfig,
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
