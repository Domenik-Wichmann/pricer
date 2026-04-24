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
  const prices = rows.map(getEffectivePrice);
  const stores = new Set(rows.map((row) => `${row.locality_code}|${row.store_name_raw}`));

  return {
    source_product_id: sourceProductId,
    date: targetDate,
    price_avg: round(sum(prices) / Math.max(prices.length, 1)),
    price_min: round(Math.min(...prices)),
    price_max: round(Math.max(...prices)),
    store_count: stores.size,
    snapshot_count: rows.length,
  };
}

function getEffectivePrice(row) {
  return row.promo_price > 0 && row.promo_price < row.retail_price
    ? row.promo_price
    : row.retail_price;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function round(value) {
  return Number(value.toFixed(4));
}

module.exports = {
  buildProductDailyPrices,
};
