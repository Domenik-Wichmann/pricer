const USDA_CLUSTER_RULES_VERSION = 'db2_5_usda_cluster_rules_v1';
const USDA_CLUSTER_GENERATION_METHOD = 'deterministic_foundation_sr_legacy_v1';
const CLUSTERABLE_DATA_TYPES = new Set(['foundation_food', 'sr_legacy_food']);

function buildUsdaClusterCandidate(food, {
  sourceVersion = '2025-12-18',
  hasMacroData = true,
} = {}) {
  const normalizedFood = normalizeFoodInput(food);
  if (!CLUSTERABLE_DATA_TYPES.has(normalizedFood.source_data_type)) {
    return null;
  }

  const parsed = parseUsdaFoodDescription(normalizedFood.source_description, {
    dataType: normalizedFood.source_data_type,
    foodCategoryId: normalizedFood.source_food_category_id,
  });
  const score = scoreRepresentativeCandidate({
    parsed,
    dataType: normalizedFood.source_data_type,
    hasMacroData,
  });
  const hardBoundarySignature = buildHardBoundarySignature(parsed.qualifiers);
  const candidateKey = buildCandidateKey(parsed.core_food_normalized, hardBoundarySignature);

  return {
    candidate_id: `usda_cluster_candidate:${normalizedFood.source_fdc_id}:${USDA_CLUSTER_RULES_VERSION}`,
    candidate_key: candidateKey,
    core_food_name: parsed.core_food_name,
    core_food_normalized: parsed.core_food_normalized,
    source_fdc_id: normalizedFood.source_fdc_id,
    source_description: normalizedFood.source_description,
    source_data_type: normalizedFood.source_data_type,
    source_food_category_id: normalizedFood.source_food_category_id,
    parsed_qualifiers_json: parsed.qualifiers,
    hard_boundary_signature: hardBoundarySignature,
    representative_score: score.score,
    representative_score_json: score,
    confidence: score.confidence,
    review_status: score.review_status,
    generation_method: USDA_CLUSTER_GENERATION_METHOD,
    rules_version: USDA_CLUSTER_RULES_VERSION,
    source_version: sourceVersion,
  };
}

function parseUsdaFoodDescription(description, {
  dataType = null,
  foodCategoryId = null,
} = {}) {
  const descriptionNormalized = normalizeText(description);
  const segments = splitUsdaDescription(descriptionNormalized);
  const qualifiers = extractQualifiers(descriptionNormalized, segments, {
    dataType,
    foodCategoryId,
  });

  // USDA descriptions are usually "core, qualifier, qualifier". The first
  // segment is useful, but categories like "Rice, white..." and "Milk, whole..."
  // need a small deterministic lookahead so the cluster key is not too broad.
  const coreFoodName = extractCoreFoodName(segments, qualifiers);
  const coreFoodNormalized = slugify(coreFoodName);

  return {
    description_normalized: descriptionNormalized,
    segments,
    core_food_name: coreFoodName,
    core_food_normalized: coreFoodNormalized,
    qualifiers,
  };
}

function extractQualifiers(description, segments, {
  dataType,
  foodCategoryId,
}) {
  const qualifiers = {
    source_data_type: normalizeText(dataType),
    food_category_id: nullableString(foodCategoryId),
    state: null,
    form: null,
    processing_level: 'generic',
    cooking_method: null,
    preservation_method: null,
    species_or_variety: null,
    cut_or_part: null,
    fat_level: null,
    skin_state: null,
    bone_state: null,
    breading_state: null,
    sweetened_status: null,
    salted_status: null,
    drained_status: null,
    liquid_state: null,
    grain_form: null,
    grain_state: null,
    milk_fat_level: null,
    ambiguity_flags: [],
    hard_boundary_tokens: [],
  };

  if (containsAny(description, [' raw'])) qualifiers.state = 'raw';
  if (containsAny(description, [' cooked', 'pre-cooked'])) qualifiers.state = 'cooked';
  if (containsAny(description, [' dried', 'freeze-dried'])) {
    qualifiers.state = 'dried';
    qualifiers.preservation_method = 'dried';
  }
  if (containsAny(description, [' frozen'])) qualifiers.preservation_method = 'frozen';
  if (containsAny(description, [' canned'])) qualifiers.preservation_method = 'canned';
  if (containsAny(description, ['juice'])) qualifiers.form = 'juice';
  if (containsAny(description, ['applesauce', ' sauce'])) qualifiers.form = qualifiers.form || 'sauce';
  if (containsAny(description, ['pie filling', 'pie fillings'])) qualifiers.form = 'pie_filling';
  const isGrainLike = containsAny(description, ['rice', 'grain', 'flour', 'pasta', 'noodles', 'wheat', 'oats', 'barley']);
  if (containsAny(description, [' flour']) || segments[0] === 'flour') {
    qualifiers.form = 'flour';
    qualifiers.grain_form = 'flour';
  }
  if (isGrainLike && containsAny(description, [' kernel', 'kernels', 'grain'])) qualifiers.grain_form = qualifiers.grain_form || 'kernel';
  if (isGrainLike && containsAny(description, [' dry, raw', ' dry ', 'dried'])) qualifiers.grain_state = 'dry';
  if (isGrainLike && containsAny(description, [' cooked'])) qualifiers.grain_state = qualifiers.grain_state || 'cooked';
  if (isGrainLike && containsAny(description, ['raw'])) qualifiers.grain_state = qualifiers.grain_state || 'raw';

  qualifiers.cooking_method = firstMatched(description, [
    ['pan-fried', 'pan_fried'],
    ['fried', 'fried'],
    ['baked', 'baked'],
    ['boiled', 'boiled'],
    ['braised', 'braised'],
    ['grilled', 'grilled'],
    ['broiled', 'broiled'],
    ['roasted', 'roasted'],
    ['microwaved', 'microwaved'],
  ]);

  if (containsAny(description, ['unsweetened', 'no sugar added', 'without sugar'])) qualifiers.sweetened_status = 'unsweetened';
  if (containsAny(description, ['sweetened', 'sugar added', 'with sugar']) && qualifiers.sweetened_status !== 'unsweetened') {
    qualifiers.sweetened_status = 'sweetened';
  }
  if (containsAny(description, ['without salt', 'without added salt', 'no salt added', 'unsalted'])) qualifiers.salted_status = 'unsalted';
  if (containsAny(description, ['with salt', 'salt added', 'sodium added', 'regular pack']) && qualifiers.salted_status !== 'unsalted') {
    qualifiers.salted_status = 'salted';
  }
  if (containsAny(description, ['drained and rinsed'])) qualifiers.drained_status = 'drained_rinsed';
  if (containsAny(description, ['drained solids', 'drained,', ' drained']) && !qualifiers.drained_status) qualifiers.drained_status = 'drained';
  if (containsAny(description, ['solids and liquids'])) {
    qualifiers.drained_status = 'solids_and_liquids';
    qualifiers.liquid_state = 'solids_and_liquids';
  }
  if (containsAny(description, ['without skin', 'skinless', 'skin not eaten'])) qualifiers.skin_state = 'without_skin';
  if (containsAny(description, ['with skin', 'skin eaten'])) qualifiers.skin_state = 'with_skin';
  if (containsAny(description, ['boneless'])) qualifiers.bone_state = 'boneless';
  if (containsAny(description, ['bone-in', 'bone in'])) qualifiers.bone_state = 'bone_in';
  if (containsAny(description, ['breaded', 'breading'])) qualifiers.breading_state = 'breaded';

  qualifiers.milk_fat_level = extractMilkFatLevel(description);
  qualifiers.fat_level = qualifiers.milk_fat_level || extractFatLevel(description);
  qualifiers.cut_or_part = extractCutOrPart(description, segments);
  qualifiers.species_or_variety = extractSpeciesOrVariety(description, segments);
  qualifiers.processing_level = inferProcessingLevel(description, qualifiers);

  if (containsAny(description, [' nfs', ' ns ', 'not specified', 'ns as to'])) {
    qualifiers.ambiguity_flags.push('not_further_specified');
  }
  if (containsAny(description, ['restaurant,', 'fast food', 'prepared', 'entree'])) {
    qualifiers.ambiguity_flags.push('prepared_or_restaurant');
  }

  qualifiers.hard_boundary_tokens = buildHardBoundaryTokens(qualifiers);
  return qualifiers;
}

function extractCoreFoodName(segments, qualifiers) {
  const first = segments[0] || 'unknown';
  const second = segments[1] || '';
  const third = segments[2] || '';

  if (first === 'apples' || first === 'apple') {
    if (qualifiers.form === 'juice') return 'apple juice';
    if (qualifiers.form === 'sauce') return 'applesauce';
    if (qualifiers.form === 'pie_filling') return 'apple pie filling';
    return qualifiers.species_or_variety ? `apple ${qualifiers.species_or_variety}` : 'apple';
  }
  if (first === 'rice' || first === 'wild rice') {
    const color = ['white', 'brown', 'black', 'red'].find((token) => segments.includes(token) || second.includes(token));
    const grain = first === 'wild rice' ? 'wild rice' : [color, 'rice'].filter(Boolean).join(' ');
    return qualifiers.form === 'flour' ? `${grain} flour` : grain;
  }
  if (first === 'flour' && second.includes('rice')) {
    const color = ['white', 'brown', 'black', 'red', 'glutinous'].find((token) => segments.includes(token) || third.includes(token));
    return [color, 'rice flour'].filter(Boolean).join(' ');
  }
  if (first === 'milk') {
    return qualifiers.milk_fat_level ? `milk ${qualifiers.milk_fat_level}` : 'milk';
  }
  if (first === 'mushrooms' || first === 'mushroom') {
    return qualifiers.species_or_variety ? `mushroom ${qualifiers.species_or_variety}` : 'mushroom';
  }
  if (first === 'chicken') {
    return qualifiers.cut_or_part ? `chicken ${qualifiers.cut_or_part}` : 'chicken';
  }
  if (first === 'beans') {
    const beanType = [second, third].filter((segment) => segment && !isQualifierSegment(segment)).join(' ');
    return beanType ? `beans ${beanType}` : 'beans';
  }
  return first;
}

function scoreRepresentativeCandidate({ parsed, dataType, hasMacroData }) {
  let score = 0;
  const reasons = [];
  if (dataType === 'foundation_food') {
    score += 50;
    reasons.push('foundation_food');
  }
  if (dataType === 'sr_legacy_food') {
    score += 35;
    reasons.push('sr_legacy_food');
  }
  if (hasMacroData) {
    score += 20;
    reasons.push('macro_data_present');
  }
  if (parsed.qualifiers.state === 'raw') {
    score += 10;
    reasons.push('raw_simple_default');
  }
  if (parsed.segments.length <= 5) {
    score += 8;
    reasons.push('simple_description');
  }
  if (parsed.qualifiers.salted_status === 'salted') {
    score -= 8;
    reasons.push('added_salt_penalty');
  }
  if (parsed.qualifiers.sweetened_status === 'sweetened') {
    score -= 8;
    reasons.push('added_sugar_penalty');
  }
  if (parsed.qualifiers.breading_state === 'breaded') {
    score -= 12;
    reasons.push('breaded_penalty');
  }
  if (parsed.qualifiers.ambiguity_flags.length > 0) {
    score -= 15;
    reasons.push('ambiguous_description_penalty');
  }

  const confidence = score >= 75 ? 'high' : score >= 55 ? 'medium' : 'low';
  return {
    score,
    reasons,
    has_macro_data: Boolean(hasMacroData),
    confidence,
    review_status: confidence === 'high' ? 'candidate' : 'needs_review',
  };
}

function buildHardBoundarySignature(qualifiers) {
  return qualifiers.hard_boundary_tokens.join('|') || 'generic';
}

function buildHardBoundaryTokens(qualifiers) {
  return [
    boundary('form', qualifiers.form),
    boundary('state', qualifiers.state),
    boundary('cook', qualifiers.cooking_method),
    boundary('preserve', qualifiers.preservation_method),
    boundary('grain_form', qualifiers.grain_form),
    boundary('grain_state', qualifiers.grain_state),
    boundary('milk_fat', qualifiers.milk_fat_level),
    boundary('fat', qualifiers.fat_level),
    boundary('skin', qualifiers.skin_state),
    boundary('bone', qualifiers.bone_state),
    boundary('breaded', qualifiers.breading_state),
    boundary('sweet', qualifiers.sweetened_status),
    boundary('salt', qualifiers.salted_status),
    boundary('drained', qualifiers.drained_status),
    boundary('cut', qualifiers.cut_or_part),
    boundary('species', qualifiers.species_or_variety),
  ].filter(Boolean);
}

function buildCandidateKey(coreFoodNormalized, hardBoundarySignature) {
  return `${coreFoodNormalized}__${slugify(hardBoundarySignature)}`;
}

function normalizeFoodInput(food) {
  return {
    source_fdc_id: Number(food.source_fdc_id || food.fdc_id),
    source_description: String(food.source_description || food.description || '').trim(),
    source_data_type: normalizeText(food.source_data_type || food.data_type),
    source_food_category_id: nullableString(food.source_food_category_id || food.food_category_id),
  };
}

function splitUsdaDescription(description) {
  const segments = [];
  let current = '';
  let parenDepth = 0;
  for (const char of description) {
    if (char === '(') parenDepth += 1;
    if (char === ')') parenDepth = Math.max(0, parenDepth - 1);
    if (char === ',' && parenDepth === 0) {
      pushSegment(segments, current);
      current = '';
    } else {
      current += char;
    }
  }
  pushSegment(segments, current);
  return segments;
}

function pushSegment(segments, value) {
  const normalized = normalizeText(value);
  if (normalized) segments.push(normalized);
}

function extractMilkFatLevel(description) {
  if (containsAny(description, ['whole, 3.25% milkfat', 'whole milk', 'milk, whole'])) return 'whole_3_25';
  if (containsAny(description, ['reduced fat', '2% milkfat'])) return 'reduced_fat_2';
  if (containsAny(description, ['lowfat', '1% milkfat'])) return 'lowfat_1';
  if (containsAny(description, ['nonfat', 'fat free', 'skim'])) return 'nonfat_skim';
  return null;
}

function extractFatLevel(description) {
  if (containsAny(description, ['lean only'])) return 'lean_only';
  if (containsAny(description, ['lean and fat'])) return 'lean_and_fat';
  if (containsAny(description, ['fat-free', 'fat free'])) return 'fat_free';
  return null;
}

function extractCutOrPart(description, segments) {
  const cuts = ['breast', 'thigh', 'drumstick', 'wing', 'loin', 'tenderloin', 'round', 'shoulder', 'leg'];
  return cuts.find((cut) => segments.includes(cut) || description.includes(` ${cut}`)) || null;
}

function extractSpeciesOrVariety(description, segments) {
  const appleVariety = ['red delicious', 'honeycrisp', 'granny smith', 'gala', 'fuji'].find((item) => description.includes(item));
  if (appleVariety) return appleVariety;
  const mushroomVariety = ['shiitake', 'white button', 'oyster', 'portabella', 'king oyster', 'enoki', 'crimini', "lion's mane"].find((item) => description.includes(item));
  if (mushroomVariety) return mushroomVariety;
  return null;
}

function inferProcessingLevel(description, qualifiers) {
  if (qualifiers.form === 'juice' || qualifiers.form === 'sauce' || qualifiers.form === 'pie_filling') return 'processed';
  if (qualifiers.breading_state || containsAny(description, ['nugget', 'tenders', 'restaurant'])) return 'prepared';
  if (qualifiers.preservation_method) return 'preserved';
  return 'generic';
}

function isQualifierSegment(segment) {
  return containsAny(segment, ['raw', 'cooked', 'canned', 'drained', 'with salt', 'without salt', 'sodium added', 'sugar added']);
}

function firstMatched(description, pairs) {
  const match = pairs.find(([needle]) => description.includes(needle));
  return match ? match[1] : null;
}

function containsAny(value, needles) {
  return needles.some((needle) => value.includes(needle));
}

function boundary(name, value) {
  return value ? `${name}:${value}` : null;
}

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function nullableString(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function slugify(value) {
  return normalizeText(value)
    .replace(/%/g, ' percent ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

module.exports = {
  CLUSTERABLE_DATA_TYPES,
  USDA_CLUSTER_GENERATION_METHOD,
  USDA_CLUSTER_RULES_VERSION,
  buildCandidateKey,
  buildHardBoundarySignature,
  buildUsdaClusterCandidate,
  parseUsdaFoodDescription,
  scoreRepresentativeCandidate,
  splitUsdaDescription,
};
