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
  const prices = rows.map(getEffectivePrice);
  const products = new Set(rows.map((row) => row.source_product_id));

  return {
    category_code: categoryCode,
    date: targetDate,
    avg_price: round(sum(prices) / Math.max(prices.length, 1)),
    min_price: round(Math.min(...prices)),
    max_price: round(Math.max(...prices)),
    product_count: products.size,
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
  buildCategoryDailyAggregates,
};
