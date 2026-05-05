function buildCategoryDailyAggregates({ snapshots, targetDate }) {
  const groups = new Map();

  for (const snapshot of snapshots) {
    const groupKey = snapshot.category_code;
    const existing = groups.get(groupKey) || [];
    existing.push(snapshot);
    groups.set(groupKey, existing);
  }

  return [...groups.entries()]
    .map(([categoryCode, rows]) => buildCategoryAggregateRow({
      categoryCode,
      rows,
      targetDate,
    }))
    .sort((left, right) => left.category_code.localeCompare(right.category_code));
}

function buildCategoryAggregateRow({ categoryCode, rows, targetDate }) {
  // Real daily snapshots can place hundreds of thousands of rows in one
  // category. Keep this as an explicit loop so min/max are calculated with a
  // bounded call stack instead of spreading a huge price array into Math.min.
  let totalPrice = 0;
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  const products = new Set();

  for (const row of rows) {
    const price = getEffectivePrice(row);
    totalPrice += price;
    minPrice = Math.min(minPrice, price);
    maxPrice = Math.max(maxPrice, price);
    products.add(row.source_product_id);
  }

  return {
    category_code: categoryCode,
    date: targetDate,
    avg_price: round(totalPrice / Math.max(rows.length, 1)),
    min_price: round(minPrice),
    max_price: round(maxPrice),
    product_count: products.size,
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
  buildCategoryDailyAggregates,
};
