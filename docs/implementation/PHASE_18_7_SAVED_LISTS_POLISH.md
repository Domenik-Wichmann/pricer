# Phase 18.7 Mobile Saved Lists Polish - Implementation Notes

Date: 2026-04-24

## Scope

Phase 18.7 turns the mobile `/lists` and `/list_detail` routes into useful saved-list screens backed by the existing Phase 17 owner-scoped backend saved-list API.

This phase changes only Flutter client models, API client methods, list screens, navigation wiring, tests, and documentation. It does not change backend behavior, saved-list persistence shape, optimizer behavior, notifications, or client state architecture.

## Endpoint Usage

The mobile API client now supports:

- `GET /lists`
- `POST /lists`
- `GET /lists/:id`
- `PATCH /lists/:id`
- `DELETE /lists/:id`

All calls use the existing temporary owner headers:

- `x-pricer-owner-id`
- `x-pricer-owner-type`

## `/lists` Behavior

The saved-lists screen:

- lazy-loads when the tab becomes active
- renders loading, list, empty, and retryable error states
- shows saved-list cards with name and item count
- opens `/list_detail` with `list_id` and name arguments
- creates a list from a dialog with name plus comma/newline item input
- deletes a list through the backend and removes it locally after success
- shows bounded feedback if delete fails

## `/list_detail` Behavior

The detail screen:

- fetches the saved list by id before rendering editable fields
- shows name and item text editors
- parses comma/newline item input by trimming and ignoring blank entries
- saves edits through `PATCH /lists/:id`
- navigates the current item list to `/optimize`

Optimizing from detail does not persist optimizer output on the saved list.

## Intentionally Excluded

- No backend behavior changes.
- No saved-list schema changes.
- No optimization-result persistence.
- No notifications or reminders.
- No advanced collaborative list state.
- No wholesale app redesign.

## Verification

Covered in `app/mobile/test/widget_smoke_test.dart`:

- saved lists load and render
- empty state
- create list
- detail fetch
- edit/save
- optimize navigation
- delete success
- load error retry
- partial payload parsing
