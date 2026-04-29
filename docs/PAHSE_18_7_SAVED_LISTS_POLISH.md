Implement Phase 18.7: Mobile Saved Lists Screen Polish.

GOAL:
Turn `/lists` and `/list_detail` into real, usable list management screens backed by existing saved-list APIs.

Users should be able to:

* view their lists
* create a list
* edit items
* delete lists
* run optimization on a list

---

## CONTEXT

Already implemented:

* Phase 17 saved lists + ownership
* Backend endpoints:

  * `POST /lists`
  * `GET /lists`
  * `GET /lists/:id`
  * `PATCH /lists/:id`
  * `DELETE /lists/:id`
  * `POST /lists/:id/optimize`
* Phase 18 navigation routes:

  * `/lists`
  * `/list_detail`
* Optimize screen exists

---

## CRITICAL RULES

* DO NOT redesign the whole app
* DO NOT change backend behavior
* DO NOT persist optimization outputs
* Keep UI simple and testable
* Do not introduce complex state management
* Owner headers must be preserved

---

## FEATURES TO IMPLEMENT

## 1. Lists screen (`/lists`)

Add API call:

```dart
getSavedLists()
```

Render:

* loading state
* list of saved lists
* empty state
* error with retry

Each list card:

* name
* item count
* tap → `/list_detail` with `list_id`

Add create button:

* simple dialog with name + items
* call `POST /lists`

---

## 2. List detail screen (`/list_detail`)

Fetch:

```dart
getSavedList(listId)
```

Render:

* list name
* editable items (multiline input)
* save button → `PATCH /lists/:id`

---

## 3. Edit behavior

Editing items:

* one per line
* parse on save (same logic as basket input)
* trim + ignore empty

---

## 4. Optimize list

Add button:

```text
Optimize this list
```

Behavior:

* navigate to `/optimize`
* pass items:

```json
{
  "items": ["milk", "eggs"]
}
```

OR call:
`POST /lists/:id/optimize`

Use whichever fits existing flow better.

---

## 5. Delete list

Add delete action:

* button or menu
* call `DELETE /lists/:id`
* remove from UI after success
* safe error handling

---

## 6. Tests

Add/update Flutter tests for:

1. lists load and render
2. empty state works
3. create list works
4. open list detail
5. edit + save works
6. optimize button navigates correctly
7. delete works and updates UI
8. error/retry states
9. no crash on missing data

---

## 7. Docs

Update mobile docs:

* `/lists` behavior
* `/list_detail` behavior
* endpoints used
* editing model

---

## OUTPUT FORMAT

Return:

1. files changed
2. concise diff summary
3. commands run
4. test results
5. lists screen behavior
6. list detail behavior
7. what remains for final polish

SUCCESS CRITERIA:

* users can manage lists
* lists integrate with optimize flow
* no backend changes
* clean UI states
* tests pass

---

## Implementation Notes - 2026-04-24

Implemented as a Flutter/mobile-only phase.

* `/lists` now reads owner-scoped saved-list summaries from the backend API and supports loading, list, empty, retryable error, create, tap-to-detail, and delete states.
* `/list_detail` now fetches list detail by id, edits name and comma/newline item text, saves through the backend update endpoint, and navigates current items to `/optimize`.
* Mobile DTOs and API client methods were added for `GET /lists`, `POST /lists`, `GET /lists/:id`, `PATCH /lists/:id`, and `DELETE /lists/:id`.
* Existing temporary owner headers remain the owner-scoping mechanism.
* No backend behavior, saved-list schema, notifications, or optimizer persistence were added.
* Verification is recorded in `docs/test_runs/phase_18_7_saved_lists_2026-04-24.json` and `handoff/phase_18_7_saved_lists/`.
