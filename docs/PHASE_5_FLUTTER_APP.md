# PHASE 5 IMPLEMENTATION — FLUTTER APP (MVP + WATCHLISTS + SHOPPING LISTS)

## Phase ID
PHASE_5_FLUTTER_APP

---

## Objective

Build a production-ready Flutter app that:

- connects to Phase 4 query engine
- allows natural input (text + voice)
- displays cheapest results + savings
- supports:
  - shopping lists (carts)
  - watchlists (price alerts)
- is fast, minimal, and habit-forming

---

## Scope

### In scope
- Flutter app (Android + iOS)
- Home input (text + voice)
- Results screen
- Product detail (price history)
- Shopping lists (create/edit/use)
- Watchlists (track items)
- push-ready architecture (notifications later)

### Out of scope (later phases)
- authentication (anonymous only for now)
- social features
- advanced personalization
- complex filters UI

---

## Tech Stack (Frontend)

- Flutter (Material 3)
- HTTP (query API)
- Firebase:
  - Firestore (lists + watchlists)
  - FCM (later)
- speech_to_text (voice input)
- fl_chart (price charts)
- intl (formatting)

---

## App Architecture

```text
lib/
  main.dart
  app.dart

  core/
    api_client.dart
    models/
    utils/

  features/
    search/
    results/
    product/
    lists/
    watchlist/
Core Models
Product
class Product {
  String id;
  String name;
  double price;
  String store;
  String category;
}
Shopping List
class ShoppingList {
  String id;
  String name;
  List<ListItem> items;
  DateTime createdAt;
}
List Item
class ListItem {
  String queryText;
  String? matchedProductId;
  int quantity;
}
Watchlist Item
class WatchItem {
  String productId;
  double? targetPrice;
  DateTime addedAt;
}
Screens
1. Home Screen
UI
search input
mic button
“recent searches” (optional)
Behavior
user types → send to /query → navigate to results
2. Results Screen
Show
list of matched products
cheapest store
total cost
“you save X€” (IMPORTANT)
Actions
add item to shopping list
add item to watchlist
tap → product detail
3. Product Detail Screen
Show
current price
price chart (7/30 days)
avg vs current
Actions
add to watchlist
add to shopping list
4. Shopping Lists Screen
Show
all lists
create new list
5. Shopping List Detail
Features
free-text add items
run query for entire list
show:
cheapest store
optimized total
UX (important)
user types:
"milk, bread, eggs"

→ system resolves ALL items at once
6. Watchlist Screen
Show
tracked items
current price
last change
Later (Phase 6)
push notifications when price drops
API Integration
Query
POST /query
{
  "query": "евтино мляко"
}
Product history
GET /product/:id/history
Lists (Firestore)

Collections:

users/{anon_id}/lists
users/{anon_id}/watchlist
Local vs Remote
queries → backend API
lists/watchlist → Firestore
Voice Input

Use:

speech_to_text

Flow:

tap mic → speak → convert → fill input → search
Key UX Principles
1. 1–2 tap usage
open → type → results
2. Zero friction
no login required
no setup required
3. Immediate value
show savings instantly
4. Fast feedback
loading < 1.5s
Performance Rules
debounce input (300ms)
cache last results
lazy load lists
minimal rebuilds
Monetization (basic)
AdMob banner (results screen)
optional premium later:
unlimited lists
advanced alerts
Tests
UI Tests
search flow works
results display correctly
list creation works
watchlist add/remove works
Integration Tests
query API returns correct data
list aggregation works
Acceptance Criteria

Phase 5 complete when:

user can search and get results
user can create shopping list
user can add items to list
user can track items in watchlist
price history visible
app runs on Android + iOS
performance acceptable (<2s response)
Implementation Rules
keep UI simple
no over-engineering
reuse backend logic
avoid complex state management initially
prioritize speed + clarity
Deliverables
working Flutter app
connected to backend
list + watchlist functionality
test coverage
handoff docs