# Phase 18.0 Home Screen Integration Implementation

Date: 2026-04-24

## Scope

Phase 18 wires the existing Flutter home/search screen to the Phase 17.5 backend home summary contract.

No backend routes, persistence, optimizer behavior, ingest behavior, or diagnostics endpoints were changed.

## Mobile Contract

`QueryApiClient.getHomeSummary(...)` calls:

`GET /home/summary`

Headers:

* `x-pricer-owner-id`
* `x-pricer-owner-type`

The mobile client currently sends the app's anonymous local user id and owner type `anonymous`.

## Rendered Sections

The home screen renders the response in this order:

1. Top Deals
2. Watchlist Highlights
3. Saved Lists
4. Market Highlights
5. Quick Actions

Empty dynamic sections are hidden. Quick actions render when present, including in otherwise empty feed responses.

## States

The screen supports:

* loading skeleton while the summary request is pending
* success with compact section cards
* empty dynamic sections without blocking the rest of the screen
* error card with retry
* partial payload parsing without crashes

## Intentional Exclusions

* no backend changes
* no internal health/debug metrics
* no automatic saved-list optimization on home load
* no external service calls
* no new state-management architecture
* no complex charts or animations

## Follow-Ups

* Replace placeholder quick-action snackbars with navigation to search, basket optimization, and watchlist screens.
* Localize Phase 18 section labels and polish card copy.
* Add final visual design treatment once the mobile home information architecture settles.
