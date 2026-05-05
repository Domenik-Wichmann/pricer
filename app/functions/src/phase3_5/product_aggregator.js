function buildProductDailyPrices({ snapshots, targetDate }) {
  const groups = new Map();

  for (const snapshot of snapshots) {
    const groupKey = snapshot.source_product_id;
    const existing = groups.get(groupKey) || [];
    existing.push(snapshot);
    groups.set(groupKey, existing);
  }

  return [...groups.entries()]
    .map(([sourceProductId, rows]) => buildProductAggregateRow({
      sourceProductId,
      rows,
      targetDate,
    }))
    .sort((left, right) => left.source_product_id.localeCompare(right.source_product_id));
}

function buildProductAggregateRow({ sourceProductId, rows, targetDate }) {
  // Product groups are usually much smaller than categories, but the publisher
  // runs this before category aggregation. Use the same bounded-stack scan so a
  // pathological source product cannot crash the latest publish build path.
  let totalPrice = 0;
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  const stores = new Set();

  for (const row of rows) {
    const price = getEffectivePrice(row);
    totalPrice += price;
    minPrice = Math.min(minPrice, price);
    maxPrice = Math.max(maxPrice, price);
    stores.add(`${row.locality_code}|${row.store_name_raw}`);
  }

  return {
    source_product_id: sourceProductId,
    date: targetDate,
    price_avg: round(totalPrice / Math.max(rows.length, 1)),
    price_min: round(minPrice),
    price_max: round(maxPrice),
    store_count: stores.size,
    snapshot_count: rows.length,
  };
}

function getEffectivePrice(row) {
  return row.promo_price > 0 && row.promo_price < row.retail_price
    ? row.promo_price
    : row.retail_price;
}

function round(value) {
  return Number(value.toFixed(4));
}

module.exports = {
  buildProductDailyPrices,
};
