# Next Phase Readiness

DB2 leaves Postgres ready for DB3 Open Food Facts import.

Available foundations:

- DB1 Postgres config, health, and migration tooling
- DB1 source dataset, source file, and import batch metadata
- DB2 USDA macro schema and importer pattern
- fixture-based import test pattern that avoids full-source imports in normal test runs
- mirrored backend exports under both `functions/src` and `app/functions/src`

Recommended DB3 scope:

- Open Food Facts raw/product/barcode import into Postgres sidecar tables
- barcode and packaged-product normalization
- product enrichment candidate records
- no app-facing runtime publishing until a later reviewed read-model phase
