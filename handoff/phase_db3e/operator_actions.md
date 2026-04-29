# DB3E Operator Actions

No manual operator action is required for tests.

For a real local Postgres run, apply migrations before using the DB3E CLIs:

```powershell
npm run db:migrate
```

Preview generation example:

```powershell
npm run db3e:generate-product-ingredient-candidates -- --dry-run --product="product:apple_1kg|Fresh apple 1kg" --ingredient=apple --json
```

Review example:

```powershell
npm run db3e:review-product-ingredient-mapping -- --ingredient=apple --product=product:apple_1kg --review-status=approved --mapping-type=exact_match --reviewed-by=operator --reason="reviewed purchasable equivalent"
```
