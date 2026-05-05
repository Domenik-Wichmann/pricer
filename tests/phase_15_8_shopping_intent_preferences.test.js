const assert = require('node:assert/strict');

const {
  InMemoryDataBackboneStore,
  PRODUCT_FAMILY_DEFINITIONS,
  handleResolveShoppingIntentRequest,
  resolveShoppingIntent,
  upsertUserProductFamilyPreference,
} = require('../app/functions/src');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test('seeded product families include the required grocery foundations', () => {
  const familyIds = new Set(PRODUCT_FAMILY_DEFINITIONS.map((family) => family.family_id));
  [
    'yogurt',
    'milk',
    'bread',
    'sirene',
    'kashkaval',
    'juice',
    'coffee',
    'rice',
    'pasta',
    'oil',
    'eggs',
    'chicken',
  ].forEach((familyId) => {
    assert.equal(familyIds.has(familyId), true, `${familyId} should be seeded`);
  });
});

test('yogurt asks for style before fat, size, and brand', async () => {
  const result = await resolveShoppingIntent({
    text: 'yogurt',
  });

  assert.equal(result.status, 'needs_clarification');
  assert.equal(result.selected_family.family_id, 'yogurt');
  assert.equal(result.missing_attributes[0].attribute_id, 'style');
  assert.equal(result.missing_attributes[1].attribute_id, 'fat_percent');
  assert.equal(result.clarification_questions[0].attribute_id, 'style');
  assert.deepEqual(
    result.clarification_questions[0].options.map((option) => option.value_id),
    ['plain', 'greek', 'drinkable', 'flavored']
  );
});

test('juice clarifies flavor first', async () => {
  const result = await resolveShoppingIntent({
    text: 'juice',
  });

  assert.equal(result.status, 'needs_clarification');
  assert.equal(result.selected_family.family_id, 'juice');
  assert.equal(result.clarification_questions[0].attribute_id, 'flavor');
  assert.deepEqual(
    result.clarification_questions[0].options.map((option) => option.value_id),
    ['orange', 'apple', 'multifruit', 'cherry', 'grape']
  );
});

test('broad cheese resolves to family ambiguity instead of a canonical product merge', async () => {
  const result = await resolveShoppingIntent({
    text: 'cheese',
  });

  assert.equal(result.status, 'family_ambiguous');
  assert.equal(result.selected_family, null);
  const familyIds = result.possible_families.map((family) => family.family_id);
  assert.equal(familyIds.includes('sirene'), true);
  assert.equal(familyIds.includes('kashkaval'), true);
  assert.equal(familyIds.includes('cream_cheese'), true);
  assert.equal(result.clarification_questions[0].attribute_id, 'family_id');
});

test('exact sirene selects the sirene family despite cream-cheese partial overlap', async () => {
  const result = await resolveShoppingIntent({
    text: '\u0441\u0438\u0440\u0435\u043d\u0435',
  });

  assert.equal(result.status, 'needs_clarification');
  assert.equal(result.selected_family.family_id, 'sirene');
});

test('bread clarifies bread type with white wholegrain toast and sliced options', async () => {
  const result = await resolveShoppingIntent({
    text: 'bread',
  });

  assert.equal(result.status, 'needs_clarification');
  assert.equal(result.selected_family.family_id, 'bread');
  assert.equal(result.clarification_questions[0].attribute_id, 'type');
  const optionIds = result.clarification_questions[0].options.map((option) => option.value_id);
  ['white', 'wholegrain', 'toast', 'sliced'].forEach((optionId) => {
    assert.equal(optionIds.includes(optionId), true);
  });
});

test('high-confidence user family preferences return deterministic suggested defaults', async () => {
  const store = new InMemoryDataBackboneStore();
  const ownerContext = {
    owner_id: 'user_123',
    owner_type: 'user',
  };
  const upsert = await upsertUserProductFamilyPreference({
    store,
    ownerContext,
    preference: {
      family_id: 'yogurt',
      preferred_attributes: {
        style: 'greek',
        fat_percent: '2',
        size: '500g',
      },
      preferred_brands: ['Brand A'],
      avoided_brands: ['Brand B'],
      confidence: 0.91,
      source: 'explicit_user_choice',
      last_confirmed_at: '2026-05-03T10:00:00.000Z',
    },
    updatedAt: '2026-05-03T10:00:00.000Z',
  });
  assert.equal(upsert.status, 200);

  const result = await resolveShoppingIntent({
    store,
    text: 'yogurt',
    ownerContext,
  });

  assert.equal(result.status, 'ready_for_product_selection');
  assert.equal(result.clarification_questions.length, 0);
  assert.equal(result.suggested_defaults.style.value_id, 'greek');
  assert.equal(result.suggested_defaults.fat_percent.value_id, '2');
  assert.equal(result.suggested_defaults.size.value_id, '500g');
  assert.equal(result.preference.source, 'explicit_user_choice');
});

test('low-confidence preferences do not suppress clarification', async () => {
  const store = new InMemoryDataBackboneStore();
  const ownerContext = {
    owner_id: 'user_456',
    owner_type: 'user',
  };
  await upsertUserProductFamilyPreference({
    store,
    ownerContext,
    preference: {
      family_id: 'juice',
      preferred_attributes: {
        flavor: 'orange',
      },
      confidence: 0.4,
      source: 'inferred_repeated_choices',
    },
    updatedAt: '2026-05-03T11:00:00.000Z',
  });

  const result = await resolveShoppingIntent({
    store,
    text: 'juice',
    ownerContext,
  });

  assert.equal(result.status, 'needs_clarification');
  assert.equal(result.suggested_defaults.flavor, undefined);
  assert.equal(result.clarification_questions[0].attribute_id, 'flavor');
});

test('resolver endpoint accepts API aliases and returns admin-friendly response shape', async () => {
  const response = await handleResolveShoppingIntentRequest({
    body: {
      query: 'ignored alias',
      text: 'yogurt',
      owner_id: 'admin_preview_user',
      existing_preference: {
        family_id: 'yogurt',
        preferred_attributes: {
          style: 'greek',
          fat_percent: '2',
          size: '500g',
        },
        confidence: 0.93,
        source: 'explicit_user_choice',
      },
      selected_attributes: {},
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ready_for_product_selection');
  assert.equal(response.body.selected_family.family_id, 'yogurt');
  assert.equal(response.body.suggested_defaults.style.value_id, 'greek');
  assert.equal(response.body.preference_record.owner_id, 'admin_preview_user');
  assert.equal(response.body.preference_record.family_id, 'yogurt');
});

test('resolver endpoint uses scoped preference reads and never full-loads Firestore-like stores', async () => {
  const calls = [];
  const scopedStore = {
    async queryCollection(collectionName, query) {
      calls.push({ collectionName, query });
      assert.equal(collectionName, 'user_product_family_preferences');
      return [];
    },
    async load() {
      throw new Error('full load must not be called');
    },
    async save() {
      throw new Error('full save must not be called');
    },
  };

  const response = await handleResolveShoppingIntentRequest({
    store: scopedStore,
    body: {
      term: 'yogurt',
      owner_context: {
        owner_id: 'scoped_user',
        owner_type: 'user',
      },
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'needs_clarification');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].query.fieldName, 'preference_id');
  assert.match(calls[0].query.value, /^upfp_/u);
});

async function run() {
  let failed = 0;

  for (const entry of tests) {
    try {
      await entry.fn();
      console.log(`PASS ${entry.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${entry.name}`);
      console.error(error.stack);
    }
  }

  console.log(`\nPhase 15.8 shopping intent tests: ${tests.length - failed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
