const fs = require('fs');
const path = require('path');

const { SOURCE_HEADERS } = require('./constants');
const { buildEnrichment, detectNameDrift } = require('./enrichment');
const { computeSnapshotId, computeSourceProductId } = require('./ids');

async function importDailySnapshotFile({
  store,
  filePath,
  snapshotDate,
  ingestedAt = new Date().toISOString(),
}) {
  const fileContents = fs.readFileSync(filePath, 'utf8');
  return importDailySnapshotText({
    store,
    sourceText: fileContents,
    sourceFileName: path.basename(filePath),
    snapshotDate,
    ingestedAt,
  });
}

async function importDailySnapshotText({
  store,
  sourceText,
  sourceFileName = 'inline.tsv',
  snapshotDate,
  ingestedAt = new Date().toISOString(),
}) {
  const rows = parseSnapshotRows(sourceText);
  const state = await store.load();

  const snapshotIndex = new Map(state.raw_price_snapshots.map((row) => [row.snapshot_id, row]));
  const productIndex = new Map(state.source_products.map((row) => [row.source_product_id, row]));
  const enrichmentIndex = new Map(state.source_product_enrichment.map((row) => [row.source_product_id, row]));
  const seenToday = new Set();

  let createdProducts = 0;
  let updatedProducts = 0;
  let enrichmentRuns = 0;

  rows.forEach((row, rowIndex) => {
    const snapshotRecord = buildRawSnapshotRecord({
      sourceRow: row,
      snapshotDate,
      sourceFileName,
      rowNumber: rowIndex + 2,
      ingestedAt,
    });

    snapshotIndex.set(snapshotRecord.snapshot_id, snapshotRecord);
    seenToday.add(snapshotRecord.source_product_id);

    const existingProduct = productIndex.get(snapshotRecord.source_product_id);
    if (!existingProduct) {
      const sourceProduct = buildSourceProductRecord(snapshotRecord, ingestedAt);
      productIndex.set(sourceProduct.source_product_id, sourceProduct);
      createdProducts += 1;

      enrichmentIndex.set(
        sourceProduct.source_product_id,
        buildEnrichmentRecord({
          sourceProduct,
          productNameRaw: sourceProduct.latest_product_name_raw,
          categoryCode: sourceProduct.category_code,
          ingestedAt,
          existingEnrichment: enrichmentIndex.get(sourceProduct.source_product_id) || null,
        })
      );
      enrichmentRuns += 1;
      return;
    }

    const drift = detectNameDrift(existingProduct.latest_product_name_raw, snapshotRecord.product_name_raw);
    const nextProduct = {
      ...existingProduct,
      latest_product_name_raw: snapshotRecord.product_name_raw,
      latest_snapshot_id: snapshotRecord.snapshot_id,
      last_seen_date: snapshotDate,
      is_active: true,
      needs_revalidation: existingProduct.needs_revalidation || drift.needsRevalidation,
      updated_at: ingestedAt,
      drift_level: drift.driftLevel === 'none' ? existingProduct.drift_level : drift.driftLevel,
    };
    productIndex.set(nextProduct.source_product_id, nextProduct);
    updatedProducts += 1;

    const shouldReenrich = !enrichmentIndex.has(nextProduct.source_product_id) || nextProduct.needs_revalidation;
    if (shouldReenrich) {
      enrichmentIndex.set(
        nextProduct.source_product_id,
        buildEnrichmentRecord({
          sourceProduct: nextProduct,
          productNameRaw: snapshotRecord.product_name_raw,
          categoryCode: snapshotRecord.category_code,
          ingestedAt,
          existingEnrichment: enrichmentIndex.get(nextProduct.source_product_id) || null,
        })
      );
      nextProduct.needs_revalidation = false;
      nextProduct.last_enriched_at = ingestedAt;
      nextProduct.updated_at = ingestedAt;
      productIndex.set(nextProduct.source_product_id, nextProduct);
      enrichmentRuns += 1;
    }
  });

  for (const sourceProduct of productIndex.values()) {
    if (sourceProduct.last_seen_date !== snapshotDate) {
      sourceProduct.is_active = false;
      sourceProduct.updated_at = ingestedAt;
    }
  }

  const nextState = {
    raw_price_snapshots: sortByKey([...snapshotIndex.values()], 'snapshot_id'),
    source_products: sortByKey([...productIndex.values()], 'source_product_id'),
    source_product_enrichment: sortByKey([...enrichmentIndex.values()], 'source_product_id'),
  };

  await store.save(nextState);

  return {
    imported_rows: rows.length,
    created_products: createdProducts,
    updated_products: updatedProducts,
    enrichment_runs: enrichmentRuns,
    seen_today: seenToday.size,
    state: nextState,
  };
}

function parseSnapshotRows(sourceText) {
  const lines = sourceText
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return [];
  }

  const headers = lines[0].split('\t');
  return lines.slice(1).map((line) => {
    const columns = line.split('\t');
    const raw = {};
    headers.forEach((header, index) => {
      raw[header] = columns[index] ?? '';
    });

    return {
      locality_code_raw: raw[SOURCE_HEADERS.localityCode] ?? '',
      store_name_raw: raw[SOURCE_HEADERS.storeNameRaw] ?? '',
      product_name_raw: raw[SOURCE_HEADERS.productNameRaw] ?? '',
      product_code_raw: raw[SOURCE_HEADERS.productCode] ?? '',
      category_code_raw: raw[SOURCE_HEADERS.categoryCode] ?? '',
      retail_price_raw: raw[SOURCE_HEADERS.retailPrice] ?? '',
      promo_price_raw: raw[SOURCE_HEADERS.promoPrice] ?? '',
      raw_source_row: raw,
    };
  });
}

function buildRawSnapshotRecord({ sourceRow, snapshotDate, sourceFileName, rowNumber, ingestedAt }) {
  const localityCode = sourceRow.locality_code_raw.trim();
  const storeNameRaw = sourceRow.store_name_raw.trim();
  const productNameRaw = sourceRow.product_name_raw.trim();
  const productCode = sourceRow.product_code_raw.trim();
  const categoryCode = sourceRow.category_code_raw.trim();
  const retailPrice = normalizePrice(sourceRow.retail_price_raw, { blankToZero: false });
  const promoPrice = normalizePrice(sourceRow.promo_price_raw, { blankToZero: true });
  const sourceProductId = computeSourceProductId({
    localityCode,
    storeNameRaw,
    productCode,
    categoryCode,
  });

  return {
    snapshot_id: computeSnapshotId({
      snapshotDate,
      localityCode,
      storeNameRaw,
      productCode,
      categoryCode,
    }),
    source_product_id: sourceProductId,
    snapshot_date: snapshotDate,
    locality_code: localityCode,
    store_name_raw: storeNameRaw,
    product_name_raw: productNameRaw,
    product_code: productCode,
    category_code: categoryCode,
    retail_price: retailPrice,
    promo_price: promoPrice,
    retail_price_raw: sourceRow.retail_price_raw,
    promo_price_raw: sourceRow.promo_price_raw,
    raw_source_row: sourceRow.raw_source_row,
    source_file_name: sourceFileName,
    row_number: rowNumber,
    ingested_at: ingestedAt,
  };
}

function buildSourceProductRecord(snapshotRecord, ingestedAt) {
  return {
    source_product_id: snapshotRecord.source_product_id,
    locality_code: snapshotRecord.locality_code,
    store_name_raw: snapshotRecord.store_name_raw,
    product_code: snapshotRecord.product_code,
    category_code: snapshotRecord.category_code,
    latest_product_name_raw: snapshotRecord.product_name_raw,
    first_seen_date: snapshotRecord.snapshot_date,
    last_seen_date: snapshotRecord.snapshot_date,
    is_active: true,
    needs_revalidation: false,
    latest_snapshot_id: snapshotRecord.snapshot_id,
    drift_level: 'none',
    created_at: ingestedAt,
    updated_at: ingestedAt,
    last_enriched_at: ingestedAt,
  };
}

function buildEnrichmentRecord({ sourceProduct, productNameRaw, categoryCode, ingestedAt }) {
  const existingEnrichment = arguments[0].existingEnrichment || null;
  return {
    source_product_id: sourceProduct.source_product_id,
    enriched_at: ingestedAt,
    enrichment_version: 'phase1.5-deterministic-v1',
    based_on_product_name_raw: productNameRaw,
    ...buildEnrichment({
      productNameRaw,
      categoryCode,
      existingEnrichment,
    }),
  };
}

function normalizePrice(rawValue, { blankToZero }) {
  const trimmed = rawValue.trim();
  if (trimmed === '') {
    return blankToZero ? 0 : null;
  }

  return Number.parseFloat(trimmed.replace(',', '.'));
}

function sortByKey(items, key) {
  return items.sort((left, right) => left[key].localeCompare(right[key]));
}

module.exports = {
  buildRawSnapshotRecord,
  importDailySnapshotFile,
  importDailySnapshotText,
  normalizePrice,
  parseSnapshotRows,
};
