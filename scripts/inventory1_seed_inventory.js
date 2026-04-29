const fs = require('node:fs');
const path = require('node:path');

const {
  addInventoryItem,
  buildInventoryIdentityKey,
  buildUserInventoryId,
  createPostgresPool,
  getIngredientByKey,
  getUserFoodProfileByUserId,
  getUserInventoryByUserId,
  getOrCreateUserInventoryByUserId,
  isPostgresConfigured,
  listInventoryItems,
  runPostgresMigrations,
  updateInventoryItemQuantity,
} = require('../functions/src');

const DEFAULT_INVENTORY_SEED_ITEMS = Object.freeze([
  Object.freeze({
    ingredientKey: 'rice',
    displayName: 'Rice',
    quantityGrams: 500,
    quantityUnits: null,
    unit: 'g',
    storageType: 'pantry',
    perishabilityClass: 'long',
    lastUpdatedSource: 'manual',
  }),
  Object.freeze({
    ingredientKey: 'chicken_breast',
    displayName: 'Chicken breast',
    quantityGrams: 200,
    quantityUnits: null,
    unit: 'g',
    storageType: 'fridge',
    perishabilityClass: 'short',
    lastUpdatedSource: 'manual',
  }),
  Object.freeze({
    ingredientKey: 'soy_sauce',
    productName: 'Soy sauce',
    displayName: 'Soy sauce',
    quantityGrams: null,
    quantityUnits: 1,
    unit: 'bottle',
    storageType: 'pantry',
    perishabilityClass: 'long',
    lastUpdatedSource: 'manual',
  }),
  Object.freeze({
    ingredientKey: 'yogurt',
    productName: 'Yogurt',
    displayName: 'Yogurt',
    quantityGrams: 300,
    quantityUnits: null,
    unit: 'g',
    storageType: 'fridge',
    perishabilityClass: 'short',
    lastUpdatedSource: 'manual',
  }),
]);

async function seedInventoryForUser(client, options = {}) {
  const userId = requiredString(options.userId || options.user_id, 'user_id');
  const dryRun = Boolean(options.dryRun || options.dry_run);
  const inventory = dryRun
    ? await resolveDryRunInventory(client, userId)
    : await getOrCreateUserInventoryByUserId(client, { userId });
  const items = buildDefaultSeedItems();
  const report = {
    dry_run: dryRun,
    user_id: userId,
    inventory_id: inventory.inventory_id,
    events_seen: items.length,
    events_written: 0,
    merged_items: 0,
    active_items_after_seed: 0,
    errors: [],
    items: [],
  };

  let existingItems = await listInventoryItems(client, {
    inventoryId: inventory.inventory_id,
    includeEmpty: true,
    limit: 5000,
  });

  for (const seedItem of items) {
    const ingredient = seedItem.ingredientKey
      ? await getIngredientByKey(client, seedItem.ingredientKey)
      : null;
    const payload = {
      userId,
      ingredientId: ingredient ? ingredient.ingredient_id : null,
      ingredientKey: ingredient ? ingredient.ingredient_key : seedItem.ingredientKey,
      ingredientKeySnapshot: ingredient ? ingredient.ingredient_key : seedItem.ingredientKey,
      productNameSnapshot: seedItem.productName || null,
      quantityGrams: seedItem.quantityGrams,
      quantityUnits: seedItem.quantityUnits,
      unit: seedItem.unit,
      storageType: seedItem.storageType,
      perishabilityClass: seedItem.perishabilityClass,
      estimatedRemainingRatio: 1,
      lastUpdatedSource: seedItem.lastUpdatedSource,
    };
    const existing = findSeedMatch(existingItems, payload);
    if (dryRun) {
      report.items.push({
        ...payload,
        inventory_item_id: existing ? existing.inventory_item_id : null,
        mode: existing ? 'update' : 'insert',
      });
      if (existing) report.merged_items += 1;
      continue;
    }

    const stored = existing
      ? await updateInventoryItemQuantity(client, {
        inventoryItemId: existing.inventory_item_id,
        ingredientId: payload.ingredientId,
        ingredientKey: payload.ingredientKey,
        quantityGrams: payload.quantityGrams,
        quantityUnits: payload.quantityUnits,
        unit: payload.unit,
        estimatedRemainingRatio: payload.estimatedRemainingRatio,
        lastUpdatedSource: payload.lastUpdatedSource,
      })
      : await addInventoryItem(client, payload);

    if (existing) report.merged_items += 1;
    report.events_written += 1;
    report.items.push(stored);
    existingItems = replaceInventoryItem(existingItems, stored);
  }

  const activeItems = dryRun
    ? report.items
    : await listInventoryItems(client, {
      inventoryId: inventory.inventory_id,
      includeEmpty: false,
      limit: 5000,
    });
  report.active_items_after_seed = activeItems.length;
  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPostgresConfigured(process.env)) {
    console.log('Postgres is not configured. Set DATABASE_URL or POSTGRES_* before running INVENTORY1 inventory seeding.');
    return;
  }

  const pool = createPostgresPool();
  try {
    const client = await pool.connect();
    try {
      await runPostgresMigrations({ client });
      const report = await seedInventoryForUser(client, args);
      if (args.out) {
        fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
        fs.writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);
      }
      console.log(args.json || args.out ? JSON.stringify(report, null, 2) : human(report));
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

function buildDefaultSeedItems() {
  return DEFAULT_INVENTORY_SEED_ITEMS.map((item) => ({ ...item }));
}

async function resolveDryRunInventory(client, userId) {
  const profile = await getUserFoodProfileByUserId(client, userId);
  if (!profile) {
    throw new Error('User food profile not found.');
  }
  return (
    await getUserInventoryByUserId(client, userId)
  ) || {
    inventory_id: buildUserInventoryId(userId),
    profile_id: profile.profile_id,
    user_id: userId,
    inventory_key: null,
  };
}

function findSeedMatch(items = [], payload = {}) {
  const targetIdentity = buildInventoryIdentityKey({
    ingredient_id: payload.ingredientId,
    ingredient_key_snapshot: payload.ingredientKeySnapshot,
    product_name_snapshot: payload.productNameSnapshot,
  });
  return (items || []).find((item) => (
    buildInventoryIdentityKey(item) === targetIdentity
    && normalizeUnit(item.unit) === normalizeUnit(payload.unit)
    && normalizeUnit(item.storage_type) === normalizeUnit(payload.storageType)
    && normalizeUnit(item.perishability_class) === normalizeUnit(payload.perishabilityClass)
  )) || null;
}

function replaceInventoryItem(items = [], stored) {
  const next = (items || []).filter((item) => item.inventory_item_id !== stored.inventory_item_id);
  next.push(stored);
  return next;
}

function parseArgs(argv) {
  const args = {
    userId: null,
    dryRun: false,
    json: false,
    out: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--json') args.json = true;
    else if (arg.startsWith('--user-id=')) args.userId = arg.slice('--user-id='.length);
    else if (arg === '--user-id') args.userId = argv[++index];
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg === '--out') args.out = argv[++index];
  }

  return args;
}

function human(report) {
  return [
    'INVENTORY1 User Inventory Seed',
    `Dry run: ${report.dry_run}`,
    `User: ${report.user_id}`,
    `Inventory: ${report.inventory_id}`,
    `Events seen: ${report.events_seen}`,
    `Events written: ${report.events_written}`,
    `Merged items: ${report.merged_items}`,
    `Active items after seed: ${report.active_items_after_seed}`,
    `Errors: ${report.errors.length}`,
  ].join('\n');
}

function normalizeUnit(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function requiredString(value, fieldName) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }
  return normalized;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_INVENTORY_SEED_ITEMS,
  buildDefaultSeedItems,
  human,
  parseArgs,
  seedInventoryForUser,
};
