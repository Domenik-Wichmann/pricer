async function getProductHistory({
  store,
  sourceProductId,
}) {
  const state = await store.load();
  return state.product_daily_prices
    .filter((row) => row.source_product_id === sourceProductId)
    .sort((left, right) => left.date.localeCompare(right.date));
}

async function getCategoryTrends({
  store,
  categoryCode,
}) {
  const state = await store.load();
  return state.category_daily_aggregates
    .filter((row) => row.category_code === categoryCode)
    .sort((left, right) => left.date.localeCompare(right.date));
}

module.exports = {
  getCategoryTrends,
  getProductHistory,
};
