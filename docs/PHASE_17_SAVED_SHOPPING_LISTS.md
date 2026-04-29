Implement Phase 17.0: Saved Shopping Lists (Basic Persistence + Reuse).

GOAL:
Add a simple persistence layer for user shopping lists so users can:

* save a list
* update it
* re-run resolution and optimization on demand

This is the first **user retention feature**.

---

## CONTEXT

Already implemented:

* Product API (15.2)
* Shopping-list resolver (15.3)
* Basket planner (15.4)
* Price lookup (16.0)
* Single + multi-store optimizer (16.1–16.2)
* Explanation layer (16.3)
* Convenience scoring (16.4)
* Metrics + analytics + health (16.5–16.7)

Now we persist input.

---

## CRITICAL RULES

* DO NOT persist canonical products
* DO NOT persist optimization results
* DO NOT mutate existing pipeline logic
* Lists store only user input
* Pipeline is re-run fresh each time

---

## FEATURES TO IMPLEMENT

## 1. Storage model

Add:

`saved_lists_store`

Record:

```json id="d0yzwx"
{
  "list_id": "sl_...",
  "name": "Weekly groceries",
  "items": [
    { "text": "milk" },
    { "text": "10 eggs" }
  ],
  "created_at": "...",
  "updated_at": "..."
}
```

No user auth yet — treat as anonymous/global or simple store.

---

## 2. Core service functions

Add:

* `createSavedList(name, items)`
* `getSavedList(list_id)`
* `listSavedLists()`
* `updateSavedList(list_id, updates)`
* `deleteSavedList(list_id)`

Keep simple:

* no pagination needed yet
* no permissions layer yet

---

## 3. API endpoints

Add:

### Create

`POST /lists`

```json id="5y1q0g"
{
  "name": "Weekly groceries",
  "items": ["milk", "10 eggs"]
}
```

### Read all

`GET /lists`

### Read one

`GET /lists/:id`

### Update

`PATCH /lists/:id`

### Delete

`DELETE /lists/:id`

---

## 4. Run list through pipeline

Add endpoint:

`POST /lists/:id/optimize`

Flow:

1. load saved list
2. call resolver
3. call basket planner
4. call optimizer
5. return full result

Do NOT cache results.

---

## 5. Input normalization

Support both:

```json
["milk", "eggs"]
```

and:

```json
[{ "text": "milk" }]
```

Normalize internally to object format.

---

## 6. Tests

Add tests for:

1. create list
2. get list
3. update list
4. delete list
5. list all lists
6. optimize saved list
7. invalid id handling
8. empty list validation
9. no mutation of canonical/enrichment/price layers

---

## 7. Docs

Document:

* saved list schema
* endpoints
* relation to optimizer
* stateless pipeline behavior

---

## OUTPUT FORMAT

Return:

1. files changed
2. concise diff summary
3. commands run
4. test results
5. endpoints added
6. storage schema
7. what remains for user accounts / auth / personalization

SUCCESS CRITERIA:

* users can save lists
* lists can be re-used for optimization
* no interference with existing pipeline
* deterministic behavior preserved
* tests pass

---

## IMPLEMENTATION STATUS

Implemented on April 24, 2026.

Runtime additions:

* `saved_lists_store`
* `createSavedList(...)`
* `getSavedList(...)`
* `listSavedLists(...)`
* `updateSavedList(...)`
* `deleteSavedList(...)`
* `optimizeSavedList(...)`

API endpoints:

* `POST /lists`
* `GET /lists`
* `GET /lists/:id`
* `PATCH /lists/:id`
* `DELETE /lists/:id`
* `POST /lists/:id/optimize`

Storage behavior:

* Lists store user input only: `list_id`, `name`, normalized `items`, `created_at`, and `updated_at`.
* Items are normalized to `{ "text": "..." }`.
* Optimization results are not stored.
* Canonical products, enrichment, prices, basket plans, and optimizer outputs are not mutated.
* Saved-list optimization reruns resolver, planner, price lookup, and optimizer fresh on every request.

Future work:

* user accounts and list ownership
* auth and permissions
* sharing/collaboration
* personalization and list history
