Implement Phase 17.1: Persistent Saved Lists + Ownership Prep.

GOAL:
Upgrade Phase 17 saved shopping lists from simple/global in-memory persistence toward production-ready persistent, owner-scoped storage.

This phase should prepare for real users/auth without requiring full auth UI yet.

---

## CONTEXT

Already implemented:

* Phase 17 saved shopping lists
* `saved_lists_store`
* routes:

  * `POST /lists`
  * `GET /lists`
  * `GET /lists/:id`
  * `PATCH /lists/:id`
  * `DELETE /lists/:id`
  * `POST /lists/:id/optimize`

Current limitation:

* saved lists are simple/global/in-memory style
* no ownership boundary yet

---

## CRITICAL RULES

* DO NOT build UI
* DO NOT require full Firebase Auth client flow yet
* DO NOT change optimizer behavior
* DO NOT persist optimization outputs
* DO NOT store price lookup / resolver / metrics outputs in saved lists
* Saved lists still store user input only

---

## FEATURES TO IMPLEMENT

## 1. Schema upgrade

Extend saved list records with ownership fields:

```json
{
  "list_id": "sl_...",
  "owner_id": "anonymous_or_user_id",
  "owner_type": "anonymous" | "user" | "system",
  "name": "Weekly groceries",
  "items": [
    { "text": "milk" }
  ],
  "created_at": "...",
  "updated_at": "..."
}
```

Defaults:

* if no owner provided:

  * `owner_id = "anonymous"`
  * `owner_type = "anonymous"`

---

## 2. Service-level ownership filtering

Update service helpers:

* `createSavedList(ownerContext, name, items)`
* `getSavedList(ownerContext, list_id)`
* `listSavedLists(ownerContext)`
* `updateSavedList(ownerContext, list_id, updates)`
* `deleteSavedList(ownerContext, list_id)`
* `optimizeSavedList(ownerContext, list_id, options)`

Behavior:

* owners can only see/update/delete their own lists
* system owner may optionally access all if needed for tests/admin
* missing owner defaults to anonymous

---

## 3. Request owner extraction

Add a small helper:

`resolveOwnerContextFromRequest(req)`

For now support:

* header `x-pricer-owner-id`
* header `x-pricer-owner-type`
* default anonymous

Do not require auth token validation yet.

This is prep for real auth later.

---

## 4. Persistent store compatibility

Use existing store abstraction so this works with:

* memory/json mode
* Firestore mode if existing store supports collection writes

Do not create a totally separate persistence path unless necessary.

---

## 5. API behavior

Routes stay the same.

But now:

* create attaches owner
* list returns only owner’s lists
* get/update/delete/optimize enforce ownership

If list not found or not owned:

* return bounded not-found response
* do not leak whether another owner has it

---

## 6. Migration/backward compatibility

Handle old list records without owner fields:

* treat as `anonymous`
* do not crash

---

## 7. Tests

Add tests for:

1. default anonymous owner
2. create with explicit owner headers/context
3. list only returns owner’s lists
4. get blocks other owner
5. update blocks other owner
6. delete blocks other owner
7. optimize blocks other owner
8. old ownerless records still readable as anonymous
9. no optimizer behavior change
10. saved lists still persist only user input

---

## 8. Docs

Update docs:

* saved list ownership fields
* temporary owner-header behavior
* future Firebase Auth path
* privacy/ownership boundary
* still no optimization-result persistence

---

## OUTPUT FORMAT

Return:

1. files changed
2. concise diff summary
3. commands run
4. test results
5. ownership behavior
6. persistence behavior
7. what remains for real Firebase Auth/user accounts

SUCCESS CRITERIA:

* saved lists are owner-scoped
* existing anonymous behavior still works
* cross-owner access blocked
* APIs stay compatible
* no optimizer behavior changes
* tests pass

---

## IMPLEMENTATION STATUS

Implemented on April 24, 2026.

Runtime additions:

* `owner_id` and `owner_type` fields on new saved-list records
* `resolveOwnerContextFromRequest(req)`
* `normalizeOwnerContext(...)`
* owner-aware `createSavedList(...)`, `getSavedList(...)`, `listSavedLists(...)`, `updateSavedList(...)`, `deleteSavedList(...)`, and `optimizeSavedList(...)`

API behavior:

* Routes remain unchanged.
* Requests can pass `x-pricer-owner-id` and `x-pricer-owner-type`.
* Missing owner context defaults to `{ "owner_id": "anonymous", "owner_type": "anonymous" }`.
* Cross-owner read, update, delete, and optimize attempts return the same bounded `404` not-found response as missing lists.
* Old records without owner fields are treated as anonymous records.

Persistence behavior:

* The existing `saved_lists_store` collection remains the persistence path for memory, JSON, and Firestore-backed stores.
* Saved lists still store only ownership metadata and user input: list id, owner id/type, name, normalized items, and timestamps.
* Optimization outputs are not stored.
* Resolver, price, basket, optimizer, explanation, metrics, analytics, and health outputs remain transient.

Future Firebase Auth path:

* Replace temporary owner headers with verified Firebase Auth token claims.
* Add durable user/account profiles and migration/claiming flow for anonymous lists.
* Add Firestore security rules or server-side authorization checks aligned to authenticated owner ids.
