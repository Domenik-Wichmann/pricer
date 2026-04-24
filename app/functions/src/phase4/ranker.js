function rankQueryResults({ rows, rankByPrice = false }) {
  const prices = rows.map((row) => row.current_price);
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;

  return rows
    .map((row) => {
      const priceScore = minPrice !== null && row.current_price > 0
        ? Number((minPrice / row.current_price).toFixed(4))
        : 0;
      const availabilityScore = row.store_count && row.store_count > 0
        ? Math.min(row.store_count / 10, 1)
        : 0.2;
      const rank_score = Number((
        (row.match_score || 0) +
        (rankByPrice ? priceScore * 0.6 : priceScore * 0.3) +
        availabilityScore * 0.2
      ).toFixed(4));

      return {
        ...row,
        price_score: priceScore,
        availability_score: availabilityScore,
        rank_score,
      };
    })
    .sort((left, right) => right.rank_score - left.rank_score || left.current_price - right.current_price);
}

module.exports = {
  rankQueryResults,
};
