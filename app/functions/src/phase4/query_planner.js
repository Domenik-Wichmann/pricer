function buildQueryPlan(parsedQuery) {
  return {
    parsed_query: parsedQuery,
    use_matcher: parsedQuery.intent !== 'category' || Boolean(parsedQuery.brand),
    use_ai_fallback: true,
    use_aggregates: true,
    apply_price_filter: parsedQuery.constraints_price_max !== null,
    apply_location_filter: parsedQuery.constraints_location !== null,
    apply_category_filter: Boolean(parsedQuery.category_code || parsedQuery.product_type),
    rank_by_price: parsedQuery.intent === 'cheap',
  };
}

module.exports = {
  buildQueryPlan,
};
