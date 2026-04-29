Implement Phase 18.8: Mobile Visual Polish Pass.

GOAL:
Apply a consistent, minimal, production-ready visual polish across all mobile screens without adding new features.

This is NOT a redesign.
This is tightening spacing, typography, hierarchy, and consistency.

---

## CONTEXT

Screens implemented:

* Home (`/home/summary`)
* Search (`/search`)
* Product detail (`/product`)
* Optimize basket (`/optimize`)
* Watchlist (`/watchlist`)
* Saved lists (`/lists`)
* List detail (`/list_detail`)

UI is functional but needs refinement.

---

## CRITICAL RULES

* DO NOT add new features
* DO NOT change backend calls
* DO NOT change navigation
* DO NOT introduce complex theming systems
* DO NOT over-style
* Keep everything simple, clean, and consistent

---

## POLISH TARGETS

## 1. Spacing system

Apply consistent spacing:

* Outer screen padding: 16
* Between sections: 16–20
* Inside cards: 12–16
* Between elements in cards: 8–12

Remove inconsistent padding.

---

## 2. Typography hierarchy

Standardize:

* Section titles: bold, slightly larger
* Primary text (product name, list name): medium weight
* Secondary text (brand, category): smaller, muted
* Metadata (price labels, notes): smallest, muted

Avoid too many font sizes.

---

## 3. Card consistency

All cards should:

* have same border radius
* similar padding
* consistent shadow or elevation
* same background color

Apply to:

* deal cards
* watchlist cards
* saved list cards
* optimize result cards

---

## 4. Button hierarchy

Standardize:

Primary:

* solid button (e.g. Optimize, Save)

Secondary:

* outlined or subtle

Tertiary:

* text button

Avoid mixing styles randomly.

---

## 5. Section layout

Home screen:

1. Top Deals (primary)
2. Watchlist Highlights
3. Saved Lists
4. Market Highlights (smaller)
5. Quick Actions

Ensure:

* consistent spacing between sections
* no overcrowding

---

## 6. Empty states

Improve copy:

Examples:

Watchlist:

* “Watch products to track prices and deals.”

Lists:

* “Create a list to plan your shopping.”

Search:

* “Search for products to get started.”

Keep tone simple and friendly.

---

## 7. Loading states

Use:

* simple spinners or skeleton placeholders
* consistent placement

Do not mix different loading styles.

---

## 8. Error states

Standardize:

* message
* retry button
* spacing

Example:

* “Something went wrong”
* “Retry”

---

## 9. Color usage

Keep color usage minimal:

* green = savings / good deal
* red = expensive (only where needed)
* neutral for most UI

Avoid overuse.

---

## 10. Tests

Update widget tests to:

* still pass with layout changes
* not depend on fragile spacing/text changes
* ensure no crashes

---

## 11. Docs

Update docs:

* visual polish guidelines
* spacing/typography standards
* what was intentionally not changed

---

## OUTPUT FORMAT

Return:

1. files changed
2. concise diff summary
3. commands run
4. test results
5. visual improvements made
6. consistency changes
7. what remains for future UI refinement

SUCCESS CRITERIA:

* UI looks cleaner and more consistent
* no behavior changes
* no feature additions
* no regressions
* tests pass

---

## Implementation Notes - 2026-04-24

Implemented as a Flutter visual-only pass.

* Shared UI primitives now apply 16px screen padding, consistent 8px card radius, 12px input/button radius, and clearer section-header typography.
* Empty and error states now use the same muted secondary text treatment and spacing.
* Product search, product detail, basket, watchlist, saved-list, and list-detail surfaces keep their existing behavior while using the refined shared visual hierarchy.
* Search and saved-list empty copy were tightened to match the phase contract.
* No backend calls, routes, data contracts, persistence, or feature behavior were changed.
* Verification is recorded in `docs/test_runs/phase_18_8_2026-04-24.json` and `handoff/phase_18_8/`.

## Home Screen Refinement - 2026-04-28

Added a focused home-screen layout refinement without changing backend calls, models, routes, or feature behavior.

* Reworked the home search entry into a full-width rounded search bar with search and voice icons while preserving search and add-to-basket actions.
* Reorganized home-summary rendering into the intended visual hierarchy: Top Deals, Watchlist Highlights, Saved Lists, Market Highlights, then Quick Actions.
* Made Top Deals the primary visual section with a horizontal card rail, larger price treatment, and compact deal badges.
* Kept Watchlist Highlights and Saved Lists as compact vertical cards.
* Kept Market Highlights small as simple text rows.
* Kept Quick Actions visually light at the bottom of the home-summary sections.
* Added local home widgets for `HomeSearchBar`, `SectionHeader`, `DealCard`, `WatchlistCard`, `SavedListCard`, `MarketHighlightItem`, and `QuickActionsRow`.

Verification is recorded in `docs/test_runs/phase_18_8_home_2026-04-28.json`.
