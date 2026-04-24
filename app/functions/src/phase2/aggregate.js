function aggregateCurrentPrices({
  sourceProductIds,
  rawPriceSnapshots,
  sourceProducts,
}) {
  const productIndex = new Map(sourceProducts.map((row) => [row.source_product_id, row]));
  const latestByProduct = new Map();

  for (const row of rawPriceSnapshots) {
    if (!sourceProductIds.includes(row.source_product_id)) {
      continue;
    }

    const existing = latestByProduct.get(row.source_product_id);
    if (!existing || compareSnapshotRecency(row, existing) > 0) {
      latestByProduct.set(row.source_product_id, row);
    }
  }

  const storeResults = [...latestByProduct.values()]
    .map((snapshot) => {
      const sourceProduct = productIndex.get(snapshot.source_product_id);
      const effectivePrice = snapshot.promo_price > 0 && snapshot.promo_price < snapshot.retail_price
        ? snapshot.promo_price
        : snapshot.retail_price;

      return {
        source_product_id: snapshot.source_product_id,
        store_name_raw: snapshot.store_name_raw,
        locality_code: snapshot.locality_code,
        snapshot_date: snapshot.snapshot_date,
        retail_price: snapshot.retail_price,
        promo_price: snapshot.promo_price,
        effective_price: effectivePrice,
        product_name_raw: sourceProduct ? sourceProduct.latest_product_name_raw : snapshot.product_name_raw,
      };
    })
    .sort((left, right) => left.effective_price - right.effective_price || left.store_name_raw.localeCompare(right.store_name_raw));

  return {
    cheapest: storeResults[0] || null,
    stores: storeResults,
  };
}

function compareSnapshotRecency(left, right) {
  if (left.snapshot_date !== right.snapshot_date) {
    return left.snapshot_date.localeCompare(right.snapshot_date);
  }

  return left.ingested_at.localeCompare(right.ingested_at);
}

module.exports = {
  aggregateCurrentPrices,
};
