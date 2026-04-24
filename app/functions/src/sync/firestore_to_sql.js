async function syncFirestoreToSQL({
  store,
}) {
  const state = await store.load();

  state.sql_products = upsertRows({
    existingRows: state.sql_products,
    nextRows: state.source_products.map((product) => ({
      source_product_id: product.source_product_id,
      locality_code: product.locality_code,
      store_name_raw: product.store_name_raw,
      product_code: product.product_code,
      category_code: product.category_code,
      latest_product_name_raw: product.latest_product_name_raw,
      is_active: product.is_active,
      last_seen_date: product.last_seen_date,
    })),
    keyFields: ['source_product_id'],
  });

  state.sql_product_prices_daily = upsertRows({
    existingRows: state.sql_product_prices_daily,
    nextRows: state.product_daily_prices.map((row) => ({
      source_product_id: row.source_product_id,
      date: row.date,
      price_avg: row.price_avg,
      price_min: row.price_min,
      price_max: row.price_max,
      store_count: row.store_count,
      snapshot_count: row.snapshot_count,
    })),
    keyFields: ['source_product_id', 'date'],
  });

  state.sql_category_aggregates = upsertRows({
    existingRows: state.sql_category_aggregates,
    nextRows: state.category_daily_aggregates.map((row) => ({
      category_code: row.category_code,
      date: row.date,
      avg_price: row.avg_price,
      min_price: row.min_price,
      max_price: row.max_price,
      product_count: row.product_count,
      snapshot_count: row.snapshot_count,
    })),
    keyFields: ['category_code', 'date'],
  });

  await store.save(state);

  return {
    sql_products: state.sql_products.length,
    sql_product_prices_daily: state.sql_product_prices_daily.length,
    sql_category_aggregates: state.sql_category_aggregates.length,
    state,
  };
}

function upsertRows({ existingRows, nextRows, keyFields }) {
  const index = new Map(existingRows.map((row) => [buildKey(row, keyFields), row]));
  for (const row of nextRows) {
    index.set(buildKey(row, keyFields), row);
  }

  return [...index.values()];
}

function buildKey(row, keyFields) {
  return keyFields.map((field) => row[field]).join('|');
}

module.exports = {
  syncFirestoreToSQL,
};
