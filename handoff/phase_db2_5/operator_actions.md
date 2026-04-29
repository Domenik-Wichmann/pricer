# Operator Actions

No operator action is required for DB2.5 fixture tests.

Optional local Postgres migration:

```powershell
$env:DATABASE_URL="postgres://pricer:pricer_dev_password@localhost:5433/pricer_dev"
npm run db:migrate
```

Optional dry-run candidate generation:

```powershell
$env:DATABASE_URL="postgres://pricer:pricer_dev_password@localhost:5433/pricer_dev"
npm run db2_5:generate-usda-candidates -- --dry-run --limit=1000 --batch-size=500
```

Optional sidecar candidate generation:

```powershell
$env:DATABASE_URL="postgres://pricer:pricer_dev_password@localhost:5433/pricer_dev"
npm run db2_5:generate-usda-candidates -- --data-type=foundation_food --data-type=sr_legacy_food
```

This writes only `usda_food_cluster_candidates`; it does not publish to Firestore or map USDA foods to Pricer ingredients.

Optional candidate inspection report:

```powershell
$env:DATABASE_URL="postgres://pricer:pricer_dev_password@localhost:5433/pricer_dev"
npm run db2_5:report-usda-candidates -- --json --limit=100
```

Optional JSON file export:

```powershell
$env:DATABASE_URL="postgres://pricer:pricer_dev_password@localhost:5433/pricer_dev"
npm run db2_5:report-usda-candidates -- --json --out=tmp/usda_cluster_candidate_report.json
```

This report is read-only against Postgres sidecar candidate data.

Optional materialization preview dry-run:

```powershell
$env:DATABASE_URL="postgres://pricer:pricer_dev_password@localhost:5433/pricer_dev"
npm run db2_5:materialize-usda-clusters-preview -- --dry-run --json --limit=1000
```

Optional sidecar preview table write:

```powershell
$env:DATABASE_URL="postgres://pricer:pricer_dev_password@localhost:5433/pricer_dev"
npm run db2_5:materialize-usda-clusters-preview -- --json --limit=1000
```

This writes only `usda_food_clusters` and `usda_food_cluster_members` preview rows. It does not publish nutrition, write ingredient mappings, or affect app runtime behavior.

Optional review queue:

```powershell
$env:DATABASE_URL="postgres://pricer:pricer_dev_password@localhost:5433/pricer_dev"
npm run db2_5:review-usda-cluster -- --list --review-status=pending_review --json
```

Optional review detail:

```powershell
$env:DATABASE_URL="postgres://pricer:pricer_dev_password@localhost:5433/pricer_dev"
npm run db2_5:review-usda-cluster -- --show --cluster-key=<cluster_key> --json
```

Optional review decision:

```powershell
$env:DATABASE_URL="postgres://pricer:pricer_dev_password@localhost:5433/pricer_dev"
npm run db2_5:review-usda-cluster -- --approve --cluster-key=<cluster_key> --reviewed-by=<operator> --reason="reviewed generic cluster"
```

Review decisions affect only proposed USDA cluster sidecar tables and append review history.

Optional ingredient nutrition mapping suggestion dry-run:

```powershell
$env:DATABASE_URL="postgres://pricer:pricer_dev_password@localhost:5433/pricer_dev"
npm run db2_5:suggest-ingredient-nutrition-mappings -- --dry-run --limit=1000 --json
```

Optional sidecar mapping suggestion write:

```powershell
$env:DATABASE_URL="postgres://pricer:pricer_dev_password@localhost:5433/pricer_dev"
npm run db2_5:suggest-ingredient-nutrition-mappings -- --limit=1000
```

This writes only `ingredient_nutrition_mappings` suggestions with `review_status` of `suggested` or `needs_review`. It requires approved USDA clusters and a sidecar-readable `ingredients` relation. It does not approve mappings or publish nutrition to Firestore.

Optional mapping review queue:

```powershell
$env:DATABASE_URL="postgres://pricer:pricer_dev_password@localhost:5433/pricer_dev"
npm run db2_5:review-ingredient-nutrition-mapping -- --list --review-status=suggested --json
```

Optional mapping review decision:

```powershell
$env:DATABASE_URL="postgres://pricer:pricer_dev_password@localhost:5433/pricer_dev"
npm run db2_5:review-ingredient-nutrition-mapping -- --approve --mapping-id=<mapping_id> --reviewed-by=<operator> --reason="reviewed ingredient nutrition bridge"
```

Mapping review decisions affect only Postgres sidecar bridge tables and append review history.
