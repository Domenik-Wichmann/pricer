const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildCanonicalMarkerBackfillPlan,
} = require('../functions/src/phase6/ingest');
const {
  runBackfill,
} = require('../scripts/backfill_canonical_markers_firestore');

function productFixture(id, name, overrides = {}) {
  return {
    canonical_product_id: id,
    canonical_product_key: `stale::${id}`,
    canonical_display_name: name,
    canonical_brand: null,
    canonical_product_type: null,
    canonical_category_code: '65',
    canonical_size_value: null,
    canonical_size_unit: null,
    canonical_attributes_json: JSON.stringify({}),
    source_example_name: name,
    source_product_count: 1,
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

test('canonical marker backfill recomputes Aptamil brand, volume, age, and formula hints', () => {
  const aptamil = '\u041c\u041b\u042f\u041a\u041e APTAMIL PRONUTRA+  4 800 \u0413\u0420 \u041d\u0410\u0414 24 \u041c\u0415\u0421\u0415\u0426\u0410';
  const plan = buildCanonicalMarkerBackfillPlan({
    product: productFixture('cp_aptamil', aptamil, {
      canonical_brand: '\u0413\u0420',
      canonical_product_type: 'fresh_milk',
    }),
    now: '2026-05-05T00:00:00.000Z',
  });
  const attrs = JSON.parse(plan.patch.canonical_attributes_json);

  assert.equal(plan.changed, true);
  assert.equal(plan.patch.canonical_brand, 'APTAMIL');
  assert.equal(plan.patch.canonical_product_type, 'baby_formula');
  assert.notEqual(plan.patch.canonical_brand, '\u0413\u0420');
  assert.equal(attrs.volume_marker, '800g');
  assert.deepEqual(attrs.size_marker, {
    raw_text: '800 \u0433\u0440',
    quantity: 800,
    unit: 'g',
    total_quantity: 800,
    total_unit: 'g',
    pack_count: null,
    unit_quantity: null,
    unit_quantity_unit: null,
    display: '800 g',
    normalized_display: '800 g',
  });
  assert.equal(attrs.age_band_marker, '24+m');
  assert.equal(attrs.stage_marker, 'stage_4');
});

test('canonical marker backfill recomputes Ganchev juice markers without changing identity', () => {
  const examples = [
    'GANCHEV \u0421\u041e\u041a \u042f\u0411\u042a\u041b\u041a\u0410 \u0418 \u0413\u0420\u041e\u0417\u0414\u0415 4+ 750\u041c\u041b',
    'GANCHEV \u0421\u041e\u041a \u042f\u0411\u042a\u041b\u041a\u0410 \u0418 \u041a\u0420\u0423\u0428\u0410 4+ 750\u041c\u041b',
  ];

  examples.forEach((name, index) => {
    const plan = buildCanonicalMarkerBackfillPlan({
      product: productFixture(`cp_ganchev_${index}`, name, {
        canonical_brand: '\u0421\u041e\u041a',
      }),
      now: '2026-05-05T00:00:00.000Z',
    });
    const attrs = JSON.parse(plan.patch.canonical_attributes_json);

    assert.equal(plan.patch.canonical_brand, 'GANCHEV');
    assert.notEqual(plan.patch.canonical_brand, '\u0421\u041e\u041a');
    assert.equal(attrs.volume_marker, '750ml');
    assert.equal(attrs.size_marker.display, '750 ml');
    assert.equal(attrs.size_marker.quantity, 750);
    assert.equal(attrs.size_marker.unit, 'ml');
    assert.equal(attrs.age_band_marker, '4+m');
    assert.equal(plan.patch.canonical_product_id, undefined);
    assert.equal(plan.patch.canonical_product_key, undefined);
  });
});

test('canonical marker backfill normalizes simple gram marker display', () => {
  assertStructuredSizeMarker('TEST 100 \u0433\u0440', {
    display: '100 g',
    quantity: 100,
    unit: 'g',
    total_quantity: 100,
    total_unit: 'g',
  });
});

test('canonical marker backfill normalizes compact Latin gram marker display', () => {
  assertStructuredSizeMarker('TEST 100g', {
    display: '100 g',
    quantity: 100,
    unit: 'g',
    total_quantity: 100,
    total_unit: 'g',
  });
});

test('canonical marker backfill converts decimal comma kilograms to comparable grams', () => {
  assertStructuredSizeMarker('TEST 0,5 \u043a\u0433', {
    display: '500 g',
    quantity: 500,
    unit: 'g',
    total_quantity: 500,
    total_unit: 'g',
  });
});

test('canonical marker backfill converts decimal liters to comparable milliliters', () => {
  assertStructuredSizeMarker('TEST 1.5 \u043b', {
    display: '1500 ml',
    quantity: 1500,
    unit: 'ml',
    total_quantity: 1500,
    total_unit: 'ml',
  });
});

test('canonical marker backfill normalizes multiplication package weight totals', () => {
  assertStructuredSizeMarker('TEST 2x500 \u0433', {
    display: '2 pcs x 500 g / total 1000 g',
    quantity: 500,
    unit: 'g',
    total_quantity: 1000,
    total_unit: 'g',
    pack_count: 2,
    unit_quantity: 500,
    unit_quantity_unit: 'g',
  });
});

test('canonical marker backfill normalizes explicit pcs package volume totals', () => {
  assertStructuredSizeMarker('TEST 6 \u0431\u0440 x 330 \u043c\u043b', {
    display: '6 pcs x 330 ml / total 1980 ml',
    quantity: 330,
    unit: 'ml',
    total_quantity: 1980,
    total_unit: 'ml',
    pack_count: 6,
    unit_quantity: 330,
    unit_quantity_unit: 'ml',
  });
});

test('canonical marker backfill does not invent size markers from bare non-beverage decimals', () => {
  const plan = buildCanonicalMarkerBackfillPlan({
    product: productFixture('cp_tobacco_price_like_decimal', '\u0423\u0418\u041d\u0421\u0422\u041e\u041d 80 \u0411\u041b\u0423 6.70'),
    now: '2026-05-05T00:00:00.000Z',
  });

  assert.equal(plan.recomputed.markers.size_marker, null);
  if (plan.patch.canonical_attributes_json) {
    assert.equal(JSON.parse(plan.patch.canonical_attributes_json).size_marker, undefined);
  }
});

test('canonical marker backfill preserves contextual bare beverage decimals', () => {
  assertStructuredSizeMarker('White wine reserve 0,750', {
    display: '750 ml',
    quantity: 750,
    unit: 'ml',
    total_quantity: 750,
    total_unit: 'ml',
  });
});

test('canonical marker backfill leaves no-op products unchanged', () => {
  const name = 'GANCHEV \u0421\u041e\u041a \u042f\u0411\u042a\u041b\u041a\u0410 \u0418 \u0413\u0420\u041e\u0417\u0414\u0415 4+ 750\u041c\u041b';
  const product = productFixture('cp_noop', name, {
    canonical_brand: 'GANCHEV',
    canonical_attributes_json: JSON.stringify({
      volume_marker: '750ml',
      age_band_marker: '4+m',
      size_marker: {
        raw_text: '750\u043c\u043b',
        quantity: 750,
        unit: 'ml',
        total_quantity: 750,
        total_unit: 'ml',
        pack_count: null,
        unit_quantity: null,
        unit_quantity_unit: null,
        display: '750 ml',
        normalized_display: '750 ml',
      },
    }),
  });

  const plan = buildCanonicalMarkerBackfillPlan({
    product,
    now: '2026-05-05T00:00:00.000Z',
  });

  assert.equal(plan.changed, false);
  assert.deepEqual(plan.patch, {});
});

test('canonical marker backfill dry-run writes nothing and avoids large collections', async () => {
  const firestore = new FakeFirestore({
    prod_canonical_products: [
      productFixture('cp_aptamil', '\u041c\u041b\u042f\u041a\u041e APTAMIL PRONUTRA+  4 800 \u0413\u0420 \u041d\u0410\u0414 24 \u041c\u0415\u0421\u0415\u0426\u0410', {
        canonical_brand: '\u0413\u0420',
      }),
    ],
    prod_canonical_enrichment_store: [
      {
        canonical_fingerprint: 'cp_aptamil',
        enrichment: {
          brand: '\u0413\u0420',
        },
      },
    ],
  });

  const summary = await runBackfill({
    firestore,
    env: {
      PRICER_FIRESTORE_COLLECTION_PREFIX: 'prod',
      PRICER_BACKFILL_DRY_RUN: 'true',
      PRICER_BACKFILL_LIMIT: '10',
      PRICER_BACKFILL_LOG_DIR: 'tmp/test_backfill_logs',
      PRICER_BACKFILL_NOW: '2026-05-05T00:00:00.000Z',
    },
    logger: () => {},
  });

  assert.equal(summary.scanned_count, 1);
  assert.equal(summary.changed_count, 1);
  assert.equal(summary.actual_writes, 0);
  assert.equal(summary.estimated_writes, 2);
  assert.equal(firestore.writeCount, 0);
  assert.deepEqual(firestore.forbiddenCollectionsTouched(), []);
});

test('canonical marker backfill limit mode bounds pagination', async () => {
  const firestore = new FakeFirestore({
    prod_canonical_products: [
      productFixture('cp_a', 'APTAMIL PRONUTRA 4 800 \u0413\u0420 \u041d\u0410\u0414 24 \u041c\u0415\u0421\u0415\u0426\u0410', { canonical_brand: '\u0413\u0420' }),
      productFixture('cp_b', 'GANCHEV \u0421\u041e\u041a \u042f\u0411\u042a\u041b\u041a\u0410 4+ 750\u041c\u041b', { canonical_brand: '\u0421\u041e\u041a' }),
    ],
    prod_canonical_enrichment_store: [],
  });

  const summary = await runBackfill({
    firestore,
    env: {
      PRICER_FIRESTORE_COLLECTION_PREFIX: 'prod',
      PRICER_BACKFILL_DRY_RUN: 'true',
      PRICER_BACKFILL_LIMIT: '1',
      PRICER_BACKFILL_PAGE_SIZE: '1',
      PRICER_BACKFILL_LOG_DIR: 'tmp/test_backfill_logs',
      PRICER_BACKFILL_NOW: '2026-05-05T00:00:00.000Z',
    },
    logger: () => {},
  });

  assert.equal(summary.scanned_count, 1);
});

test('canonical marker backfill real run patches only changed canonical and enrichment docs', async () => {
  const firestore = new FakeFirestore({
    prod_canonical_products: [
      productFixture('cp_aptamil', '\u041c\u041b\u042f\u041a\u041e APTAMIL PRONUTRA+  4 800 \u0413\u0420 \u041d\u0410\u0414 24 \u041c\u0415\u0421\u0415\u0426\u0410', {
        canonical_brand: '\u0413\u0420',
      }),
    ],
    prod_canonical_enrichment_store: [
      {
        canonical_fingerprint: 'cp_aptamil',
        enrichment: {
          brand: '\u0413\u0420',
        },
      },
    ],
  });

  const summary = await runBackfill({
    firestore,
    env: {
      PRICER_FIRESTORE_COLLECTION_PREFIX: 'prod',
      PRICER_BACKFILL_DRY_RUN: 'false',
      PRICER_BACKFILL_LIMIT: '10',
      PRICER_BACKFILL_LOG_DIR: 'tmp/test_backfill_logs',
      PRICER_BACKFILL_NOW: '2026-05-05T00:00:00.000Z',
    },
    logger: () => {},
  });

  const product = firestore.getDoc('prod_canonical_products', 'cp_aptamil');
  const enrichment = firestore.getDoc('prod_canonical_enrichment_store', 'cp_aptamil');

  assert.equal(summary.actual_writes, 2);
  assert.equal(product.canonical_brand, 'APTAMIL');
  assert.equal(enrichment.enrichment.brand, 'APTAMIL');
  assert.deepEqual(firestore.forbiddenCollectionsTouched(), []);
});

class FakeFirestore {
  constructor(initialCollections = {}) {
    this.collections = new Map();
    this.collectionCalls = [];
    this.writeCount = 0;
    Object.entries(initialCollections).forEach(([name, rows]) => {
      this.collections.set(name, new Map(rows.map((row) => [documentIdForRow(row), structuredClone(row)])));
    });
  }

  collection(name) {
    this.collectionCalls.push(name);
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
    return new FakeCollection(this, name);
  }

  batch() {
    const writes = [];
    return {
      update: (ref, patch) => writes.push({ ref, patch }),
      commit: async () => {
        writes.forEach((write) => write.ref.updateSync(write.patch));
      },
    };
  }

  getDoc(collectionName, id) {
    return structuredClone(this.collections.get(collectionName).get(id));
  }

  forbiddenCollectionsTouched() {
    return this.collectionCalls.filter((name) =>
      [
        'raw_price_snapshots',
        'current_product_offers',
        'product_daily_prices',
        'canonical_product_mappings',
        'source_products',
      ].some((forbidden) => name === forbidden || name.endsWith(`_${forbidden}`))
    );
  }
}

function assertStructuredSizeMarker(name, expected) {
  const plan = buildCanonicalMarkerBackfillPlan({
    product: productFixture(`cp_${name}`, name),
    now: '2026-05-05T00:00:00.000Z',
  });
  const attrs = JSON.parse(plan.patch.canonical_attributes_json);
  Object.entries(expected).forEach(([key, value]) => {
    assert.deepEqual(attrs.size_marker[key], value, key);
  });
}

class FakeCollection {
  constructor(firestore, name) {
    this.firestore = firestore;
    this.name = name;
  }

  orderBy() {
    return new FakeQuery(this.firestore, this.name);
  }

  doc(id) {
    return new FakeDocRef(this.firestore, this.name, id);
  }
}

class FakeQuery {
  constructor(firestore, name, options = {}) {
    this.firestore = firestore;
    this.name = name;
    this.options = options;
  }

  limit(value) {
    return new FakeQuery(this.firestore, this.name, {
      ...this.options,
      limit: value,
    });
  }

  startAfter(doc) {
    return new FakeQuery(this.firestore, this.name, {
      ...this.options,
      startAfterId: doc.id,
    });
  }

  async get() {
    const rows = [...this.firestore.collections.get(this.name).entries()]
      .sort(([left], [right]) => left.localeCompare(right));
    const startIndex = this.options.startAfterId
      ? rows.findIndex(([id]) => id === this.options.startAfterId) + 1
      : 0;
    const docs = rows
      .slice(startIndex, startIndex + (this.options.limit || rows.length))
      .map(([id, data]) => new FakeDocSnapshot(
        id,
        structuredClone(data),
        new FakeDocRef(this.firestore, this.name, id)
      ));

    return {
      empty: docs.length === 0,
      docs,
    };
  }
}

class FakeDocRef {
  constructor(firestore, collectionName, id) {
    this.firestore = firestore;
    this.collectionName = collectionName;
    this.id = id;
  }

  async get() {
    const data = this.firestore.collections.get(this.collectionName).get(this.id);
    return new FakeDocSnapshot(this.id, data ? structuredClone(data) : null, this);
  }

  async update(patch) {
    this.updateSync(patch);
  }

  updateSync(patch) {
    const collection = this.firestore.collections.get(this.collectionName);
    const current = collection.get(this.id) || {};
    applyPatch(current, patch);
    collection.set(this.id, current);
    this.firestore.writeCount += 1;
  }
}

class FakeDocSnapshot {
  constructor(id, data, ref) {
    this.id = id;
    this.ref = ref;
    this.exists = Boolean(data);
    this._data = data;
  }

  data() {
    return structuredClone(this._data);
  }
}

function documentIdForRow(row) {
  return row.canonical_product_id || row.canonical_fingerprint;
}

function applyPatch(target, patch) {
  Object.entries(patch).forEach(([key, value]) => {
    const parts = key.split('.');
    let cursor = target;
    for (let index = 0; index < parts.length - 1; index += 1) {
      cursor[parts[index]] = cursor[parts[index]] || {};
      cursor = cursor[parts[index]];
    }
    cursor[parts[parts.length - 1]] = value;
  });
}
