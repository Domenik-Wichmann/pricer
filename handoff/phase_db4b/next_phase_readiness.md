# DB4B Next Phase Readiness

DB4B is ready for a later review/approval workflow over `recipe_nutrition_profile_candidates`.

Expected next-phase anchors:
- `recipe_nutrition_profile_candidates` is the preview table for recipe nutrition review.
- Approved ingredient nutrition must continue to flow through `ingredient_nutrition_profiles`, not direct USDA recipe mappings.
- Recipes with missing ingredient nutrition are still useful candidates when at least one valid ingredient profile exists; the missing counts and ids should guide review.
- Runtime publishing remains intentionally absent until a dedicated phase defines the app-facing recipe nutrition read model.
