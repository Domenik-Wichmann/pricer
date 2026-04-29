const RECIPE_EXTRACTION_PROMPT_VERSION = 'db5b_extract_recipe_v1';

function buildRecipeExtractionPrompt({
  rawText,
  language = null,
  sourceName = null,
  sourceUrl = null,
} = {}) {
  return {
    prompt_version: RECIPE_EXTRACTION_PROMPT_VERSION,
    task: 'Extract one recipe from raw source text into the exact JSON object shape requested.',
    hard_rules: [
      'Return strict JSON only: no markdown, no code fences, no prose, and no comments.',
      'Do not invent ingredients, steps, yields, times, or Bulgarian text when the source does not support them; use null or [] where unknown.',
      'Use stable snake_case keys for proposed_recipe_key and proposed_ingredient_key.',
      'All numeric quantities must be numbers or null.',
      'All confidence values must be numbers from 0 to 1 or null.',
      'Keep raw source wording in *_original fields.',
    ],
    output_shape: {
      recipe: {
        proposed_recipe_key: 'string',
        title_original: 'string or null',
        title_en: 'string or null',
        title_bg: 'string or null',
        description: 'string or null',
        servings: 'number or null',
        yield_quantity: 'number or null',
        yield_unit: 'string or null',
        cuisine_tags: [],
        region_tags: [],
        dietary_tags: [],
        meal_type_tags: [],
        feeling_tags: [],
        flavor_profile: {},
        texture_profile: {},
        difficulty_level: 'string or null',
        budget_level: 'string or null',
        prep_time_minutes: 'number or null',
        cook_time_minutes: 'number or null',
        rest_time_minutes: 'number or null',
        total_time_minutes: 'number or null',
        confidence: 'number or null',
      },
      ingredients: [
        {
          raw_line: 'string or null',
          ingredient_name_original: 'string or null',
          ingredient_name_en: 'string or null',
          ingredient_name_bg: 'string or null',
          proposed_ingredient_key: 'string',
          quantity: 'number or null',
          unit: 'string or null',
          quantity_grams: 'number or null',
          preparation_note: 'string or null',
          optional: 'boolean',
          sort_order: 'number',
          confidence: 'number or null',
        },
      ],
      steps: [
        {
          step_number: 'number',
          instruction_original: 'string or null',
          instruction_en: 'string or null',
          instruction_bg: 'string or null',
          duration_minutes: 'number or null',
          temperature_c: 'number or null',
          state_change_summary: 'string or null',
          confidence: 'number or null',
        },
      ],
      tools: [
        {
          key: 'string',
          name_en: 'string or null',
          name_bg: 'string or null',
          confidence: 'number or null',
          evidence_text: 'string or null',
        },
      ],
      methods: [
        {
          key: 'string',
          name_en: 'string or null',
          name_bg: 'string or null',
          confidence: 'number or null',
          evidence_text: 'string or null',
        },
      ],
      tags: [
        {
          tag_type: 'string',
          tag_key: 'string',
          tag_value: 'string or null',
          confidence: 'number or null',
          evidence_text: 'string or null',
        },
      ],
      state_changes: [
        {
          state_change_key: 'string',
          ingredient_name: 'string or null',
          from_state: 'string or null',
          to_state: 'string or null',
          confidence: 'number or null',
          evidence_text: 'string or null',
        },
      ],
      substitution_hints: [
        {
          substitution_key: 'string',
          original_ingredient_name: 'string or null',
          substitute_ingredient_name: 'string or null',
          reason: 'string or null',
          confidence: 'number or null',
          evidence_text: 'string or null',
        },
      ],
      quality_signals: [
        {
          signal_key: 'string',
          signal_name: 'string or null',
          signal_value: 'string or null',
          severity: 'string or null',
          confidence: 'number or null',
          evidence_text: 'string or null',
        },
      ],
    },
    source: {
      language,
      source_name: sourceName,
      source_url: sourceUrl,
      raw_text: rawText || '',
    },
  };
}

module.exports = {
  RECIPE_EXTRACTION_PROMPT_VERSION,
  buildRecipeExtractionPrompt,
};
