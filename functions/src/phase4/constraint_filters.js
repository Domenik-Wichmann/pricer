function applyConstraintFilters({ rows, parsedQuery }) {
  let nextRows = [...rows];

  if (parsedQuery.constraints_price_max !== null) {
    nextRows = nextRows.filter((row) => row.current_price <= parsedQuery.constraints_price_max);
  }

  if (parsedQuery.constraints_location) {
    nextRows = nextRows.filter((row) => normalize(row.location_label).includes(parsedQuery.constraints_location));
  }

  if (parsedQuery.category_code) {
    nextRows = nextRows.filter((row) => row.category_code === parsedQuery.category_code);
  }

  if (parsedQuery.product_type) {
    nextRows = nextRows.filter((row) => row.product_type === parsedQuery.product_type || row.product_family === parsedQuery.product_type);
  }

  return nextRows;
}

function normalize(value) {
  return (value || '').normalize('NFKC').toLowerCase();
}

module.exports = {
  applyConstraintFilters,
};
