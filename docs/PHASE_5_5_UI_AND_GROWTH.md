# PHASE 5.5 IMPLEMENTATION — UI SYSTEM + GROWTH HOOKS

## Phase ID
PHASE_5_5_UI_AND_GROWTH

## Objective
Polish the Phase 5 Flutter app into a fast, native-feeling product with:
- clear mobile-first UI
- strong information hierarchy
- shopping-list and watchlist flows that feel effortless
- built-in growth hooks that increase retention and sharing

This phase does not add major backend intelligence. It makes the existing product feel good and spread better.

---

## Scope

### In scope
- exact screen layouts
- component library / visual rules
- loading / empty / error states
- microcopy
- growth hooks
- share flows
- retention nudges
- “good deal” visual language
- savings-focused UX

### Out of scope
- full brand redesign
- advanced personalization
- full marketing website
- app store optimization assets

---

## Design Principles

### 1. One-screen usefulness
A user should get value on the first screen or one tap after it.

### 2. Savings first
The app should constantly answer:
- where is it cheapest?
- how much do I save?
- is this a good price?

### 3. Zero mental effort
No clutter, no deep menus, no complicated setup.

### 4. Touch-friendly
Large tap targets, simple cards, clear actions.

### 5. Habit-forming
The app should encourage quick daily opens.

---

## Visual Direction

### Style
- clean
- modern
- friendly
- fast-feeling
- practical, not luxurious

### Theme
- Material 3
- light mode first
- optional dark mode
- rounded cards
- large typography for prices/savings
- strong green/red price cues

### Color roles
- primary: trust / utility
- success green: cheaper / savings / drops
- warning orange: higher than average
- neutral gray: metadata / secondary info
- red only for strong negative price movement

---

## Core Screens

---

## Screen 1 — Home

### Goal
Immediate entry point for search and repeat usage.

### Layout
Top:
- app title / logo
- city selector

Middle:
- search bar
- mic button

Below:
- quick value card:
  - “Today’s cheapest basket”
  - or “Biggest price drops today”

Bottom:
- recent searches
- recent shopping lists

### Actions
- search now
- tap recent search
- open shopping lists
- open watchlist

### Components
- `SearchInputCard`
- `QuickInsightCard`
- `RecentSearchChips`
- `MiniListPreview`

### Exact UX rule
User should be able to:
- open app
- type one thing
- press search
within 3 seconds

---

## Screen 2 — Results

### Goal
Make value obvious instantly.

### Layout
Top summary card:
- cheapest store
- total price
- savings vs next best
- CTA: “Add all to list”

Below:
- matched item cards
- each card shows:
  - product name
  - best price
  - best store
  - trend snippet
  - actions

Bottom sticky area:
- “Save as list”
- “Watch selected”

### Components
- `ResultSummaryCard`
- `MatchedProductCard`
- `PriceTrendMiniChart`
- `PrimaryBottomActionBar`

### Priority
The screen should emphasize:
1. total savings
2. best store
3. item-level confirmation

---

## Screen 3 — Product Detail

### Goal
Make price history feel powerful.

### Layout
Top:
- product name
- current best price
- store

Middle:
- 7d / 30d toggle
- line chart
- average vs current indicator

Below:
- stores list
- actions:
  - add to watchlist
  - add to shopping list

### Components
- `ProductHeader`
- `PriceHistoryChartCard`
- `GoodDealIndicator`
- `StorePriceList`

### “Good deal” logic presentation
Show one of:
- “Below 30-day average”
- “Around usual price”
- “Higher than recent average”

---

## Screen 4 — Shopping Lists

### Goal
Fast repeat utility.

### Layout
Top:
- create new list

Body:
- cards for saved lists:
  - name
  - last used
  - item count
  - estimated current cheapest total

### Actions
- open list
- duplicate
- rename
- delete

### Components
- `ShoppingListCard`
- `CreateListButton`

---

## Screen 5 — Shopping List Detail

### Goal
Turn raw list into optimized buying plan.

### Layout
Top:
- list name
- total items
- run comparison button

Body:
- list items
- editable quantities
- match status per item

Bottom summary:
- best one-store option
- cheapest mixed option
- savings delta

### Components
- `ListItemRow`
- `ComparisonSummaryCard`
- `RunComparisonButton`

### Key UX
This is one of the most important screens in the whole app.

It should answer:
- where should I go if I want one stop?
- where should I go if I want lowest total?

---

## Screen 6 — Watchlist

### Goal
Create habit and re-opens.

### Layout
Top:
- item count
- “drops today” summary

Body:
- tracked item cards:
  - current best price
  - last change
  - trend arrow
  - target price if set

### Components
- `WatchItemCard`
- `DropSummaryBanner`

---

## Navigation

### Bottom nav (recommended)
Use 4 tabs:
- Home
- Lists
- Watchlist
- Settings (light)

Avoid more than 4.

---

## Component Rules

### Search bar
- large
- prominent
- placeholder:
  - “What do you want to buy?”
  - Bulgarian copy can be added in UI text phase

### Buttons
- primary CTA always obvious
- max 1 dominant CTA per screen

### Cards
- rounded
- padded
- one concept per card

### Charts
- simple
- no noisy axes
- just enough information

---

## States

Every screen must have:

### Loading
- skeleton cards
- no spinner-only blank screens

### Empty
Examples:
- no watchlist items
- no saved lists
- no result matches

### Error
Simple retry action.
Never dump technical error text on users.

---

## Typography Hierarchy

### Largest
- savings
- total price
- biggest price drop

### Medium
- store names
- product names

### Small
- metadata
- averages
- timestamps

---

## Growth Hooks

---

## Hook 1 — Savings emphasis
Every successful result should show:
- “You save X”
- “Cheapest today”
- “Better than average”

This increases perceived value and sharing.

---

## Hook 2 — Shareable result cards
Allow:
- share cheapest basket result
- share product price drop
- share “I saved X this week”

### Example shared outputs
- “Cheapest milk today: X store”
- “I save €4.20 by shopping at Y today”

This is a strong organic growth vector.

---

## Hook 3 — Daily quick insight
Show one quick insight on Home:
- biggest drop today
- cheapest dairy today
- bread trend this week

This gives users a reason to open the app daily.

---

## Hook 4 — Watchlist urgency
When watchlist items drop:
- highlight with a banner
- later use push notifications

This builds repeat habit.

---

## Hook 5 — “Good price?” indicator
Show whether the current price is:
- below average
- normal
- high

This makes the app feel intelligent, not just searchable.

---

## Hook 6 — Smart list re-run
For saved shopping lists:
- show “Updated prices available”
- one tap to rerun

This increases return usage.

---

## Hook 7 — Micro-feedback
After result:
- “Found what you wanted?”
- “Was this helpful?”

Keep it binary and optional.
This improves product quality and gathers demand signals.

---

## Hook 8 — “Today vs yesterday”
Show micro deltas:
- “Milk down 0.20€ today”
- “Cheese up 3% this week”

This makes the app feel alive.

---

## Hook 9 — Cheapest basket badge
Award a simple badge in UI:
- “Best value today”
- “Biggest savings”

Good for attention and scanability.

---

## Hook 10 — Reusable recent queries
Make it easy to re-run:
- recent searches
- recent lists
- recent watched products

This reduces friction and boosts habit.

---

## Screen-by-screen growth integration

### Home
- daily insight
- recent queries
- biggest drops

### Results
- savings summary
- share result
- save as list

### Product Detail
- price history
- “good deal?”
- watch this item

### Lists
- rerun old list
- compare again with one tap

### Watchlist
- drops today banner
- target price progress

---

## Data/Backend dependencies used in Phase 5.5

Reuse existing systems:
- query engine
- product history
- category aggregates
- watchlist storage
- list storage

No major new backend required except:
- optional share payload endpoint later
- optional daily insight endpoint later

---

## Suggested new lightweight endpoints (optional)

### 1. Home insight endpoint
`GET /insights/today`

Returns:
- biggest drop
- trending category
- cheapest store snapshot

### 2. Share payload endpoint
`GET /share/result/:id`

Returns compact share-friendly data.

---

## Implementation Tasks

### UI system
- define shared spacing scale
- define card styles
- define text styles
- define button variants
- define chart wrappers

### Home
- add quick insight card
- add recent searches/list previews

### Results
- add savings summary
- add bottom action bar
- add share CTA

### Product Detail
- add trend chart and good-deal indicator

### Lists
- improve card clarity
- show current estimated total

### Watchlist
- add drops summary banner

### States
- add skeletons, empty states, retry states

---

## Testing

### UI tests
- search flow
- save to list
- add to watchlist
- rerun list
- share result CTA visible
- daily insight card renders

### UX checks
- no screen has more than one dominant CTA
- user can reach core value in <= 2 taps from home
- key actions reachable with one thumb

---

## Acceptance Criteria

Phase 5.5 is complete when:
- all major screens have polished layouts
- savings are visually prominent
- watchlists and shopping lists feel first-class
- home screen gives immediate value
- at least 3 growth hooks are implemented
- loading/empty/error states are handled
- app feels fast and uncluttered

---

## Deliverables
- updated Flutter UI structure
- shared component system
- growth hooks integrated into screens
- test coverage
- updated docs/logs
- handoff package

