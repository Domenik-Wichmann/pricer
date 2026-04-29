Alright — this is the right moment to **externalize the vision** so you don’t lose it while building.

Below is a **clean, structured master feature document** that spans:

* pipeline
* enrichment
* intelligence
* user-facing product
* long-term moat

---

# 🧠 PRICER — MASTER FEATURE & SYSTEM ROADMAP

---

# 0A. OPERATIONAL READINESS AND ACCOUNTS

This roadmap is not production-ready by feature work alone. The app also needs the following accounts, keys, and operator setup before a real launch.

## Already in place

* Firebase project targeting for `pricer-ee440` is configured in the repo.
* Android and iOS Firebase client config files exist for `com.pricer.mobile`.
* FlutterFire generated options exist.
* Backend storage can run against Firestore, local JSON, or in-memory test storage.
* A local-only backend env file exists and appears to include Firestore settings plus an `XAI_API_KEY`.

## Still needs setup

### Backend production

* Move local backend config/secrets into Firebase or Google Cloud runtime secret/config storage.
* Set production `PRICER_STORE_BACKEND=firestore`.
* Decide the production Firestore collection prefix strategy, such as empty, `prod`, or `staging`.
* Set or verify `PRICER_FIRESTORE_PROJECT_ID`, `PRICER_FIRESTORE_DATABASE_ID`, and Functions region.
* Store `XAI_API_KEY` in runtime secrets if live enrichment, Grok adjudication, or remote embeddings are enabled.
* Finish Firestore rules and indexes.
* Register scheduled jobs for ingest/analytics only after Firestore rules and runtime secrets are ready.
* Decide whether push notifications use ADC/Admin SDK credentials or a manually injected `FCM_ACCESS_TOKEN`.

### Mobile production

* Set production `PRICER_API_BASE_URL` through Flutter `--dart-define`.
* Create RevenueCat project, products, offerings, and entitlement.
* Set `REVENUECAT_ANDROID_API_KEY`, `REVENUECAT_IOS_API_KEY`, and `REVENUECAT_ENTITLEMENT_ID` for builds.
* Create AdMob app IDs and ad unit IDs.
* Set all AdMob `--dart-define` values for Android and iOS.
* Configure Google Play Console app setup.
* Configure Apple Developer / App Store Connect setup.
* Configure Android and iOS release signing.
* Verify on a Mac that iOS bundles `Runner/GoogleService-Info.plist`.
* Add macOS Firebase config only if macOS remains in launch scope.
* Wire Firebase anonymous auth / ownership claiming for saved lists and watchlist.
* Implement and verify FCM device-token registration before launching push alerts.

### Optional / later

* Hosted Postgres credentials are only needed when DB-sidecar jobs run outside local Docker.
* Open Food Facts, receipt ingestion, store integrations, and recipe-source ingestion need their own source account/API/license reviews before implementation.

## Current setup verdict

You likely have enough account/key material for local backend development and xAI-backed local testing. You do not yet have enough setup for a production mobile release because RevenueCat, AdMob, store accounts/signing, Firestore security posture, mobile auth ownership, and push-token registration still need explicit operator work.

Detailed setup truth lives in [docs/needed_secrets.md](/C:/dev/Pricer/docs/needed_secrets.md:1).

---

# 0. CORE PHILOSOPHY

You are building:

> **A pricing intelligence engine with a consumer interface**

Not just:

* a grocery app
* a price comparison tool

But:

* a **data refinery → intelligence → action system**

---

# 1. DATA FOUNDATION (PIPELINE)

## 1.1 Canonicalization Engine

### What it does

Transforms messy product data into clean, deduplicated canonical products.

### Current state

* ✅ strong
* volume normalization working
* token cleaning working
* safe merge logic in place

### In progress

* numeric markers (count, age, reserve)

### Why it matters

Everything depends on this:

* price comparison
* aggregation
* analytics

---

## 1.2 Deterministic Marker System

### Markers

* `volume_marker` ✅
* `count_marker` 🔄
* `age_band_marker` 🔄
* `reserve_marker` 🔄

### Purpose

Prevent bad merges and enable structured comparison.

### Why important

Turns:

> "string similarity"

Into:

> "structured product identity"

---

## 1.3 LLM Disambiguation Layer

### What it does

Handles ambiguous product pairs.

### Features

* queue unresolved warnings
* structured pair payload
* decision + confidence + reason
* cached by fingerprint

### Why

* deterministic rules can't solve everything
* cheap, high-leverage use of AI

---

## 1.4 Trust / Decision Layer

### What it does

Tracks every canonical decision.

### Includes

* decision source (deterministic / LLM / human)
* reasoning
* versioning
* replayability

### Why

Transforms system from:

> "black box"

Into:

> "auditable knowledge system"

---

# 2. ENRICHMENT LAYER

## 2.1 Current state

* medium enrichment
* strong identity layer
* weak semantic layer

---

## 2.2 Core Enrichment Fields

### Universal

* brand
* category
* subcategory
* variant
* unit price
* size/volume
* count

---

## 2.3 Advanced Enrichment

### Category-specific attributes

* food: fat %, ingredients (later)
* alcohol: % ABV, reserve
* personal care: age, target group

---

## 2.4 Schema Design

### Structure

* stable top-level fields
* `attributes` (structured)
* `raw_attributes` (unresolved)

### Why

* flexible for new data sources
* avoids schema rewrites
* future-proof

---

## 2.5 Unit Economics

### What

* price per kg / liter

### Why

* real comparison
* deal detection
* fairness across sizes

---

# 3. INGEST EXPANSION

## 3.1 Multi-source ingestion

### Goal

Support:

* retailer feeds
* scraped data
* semi-structured uploads
* user data

### Strategy

* per-source parser layer
* normalized mapping
* fallback to raw_attributes

---

## 3.2 Format compatibility

### Idea

“Match Google Merchant format”

### Why

* standardization
* easier onboarding
* scalable ingestion

---

## 3.3 Future sources

* grocery chains
* e-commerce
* APIs
* receipts
* user uploads

---

# 4. CORE USER FEATURES (MVP)

---

## 🥇 4.1 Basket Optimizer

### What

Find cheapest combination of stores for a basket.

### Why

* immediate value
* simple to understand
* viral

### Output

* total cost
* per-store breakdown
* savings

---

## 🥈 4.2 Price Tracker

### What

Track item prices over time.

### Features

* watchlist
* price history
* alerts

### Why

* retention
* habit loop

---

## 🥉 4.3 Deal Detector

### What

Detect unusually low prices.

### Method

* baseline comparison
* statistical deviation

### Why

* actionable insight
* “this is worth buying now”

---

## 📋 4.4 Smart Lists

### What

Saved shopping lists.

### Features

* auto-fill
* recurring baskets
* optimization

### Why

* daily usability
* stickiness

---

# 5. INTELLIGENCE FEATURES

---

## 🧠 5.1 Buy Pattern Analysis

### What

Understand user behavior.

### Outputs

* frequent purchases
* basket patterns
* clustering

### Why

* personalization
* recommendations

---

## 📊 5.2 Inflation Tracker

### What

Track real-world price changes.

### Outputs

* category trends
* regional inflation
* item-level shifts

### Why

* authority
* shareability
* media potential

---

## 🎯 5.3 Recommendation Engine

### What

Suggest:

* cheaper alternatives
* similar products
* optimized baskets

---

# 6. QUESTION / QUERY ENGINE

---

## 6.1 Natural Language Queries

### Examples

* “Where is milk cheapest?”
* “Which store has the best pasta prices?”
* “What’s the cheapest basket for €20?”

### Why

* aligns with your original vision
* powerful UX

---

## 6.2 Smart Query Layer

### Features

* semantic search
* category reasoning
* aggregation

---

## 6.3 Question Pattern Analysis

### What

Track:

* common queries
* unmet demand

### Why

* product insights
* feature discovery

---

# 7. ADVANCED SYSTEM FEATURES

---

## 7.1 Regional Intelligence

* price differences by location
* store performance

---

## 7.2 Market Analytics

* brand pricing trends
* category dominance
* pricing strategies

---

## 7.3 Supply/Demand Signals

* product availability trends
* seasonal shifts

---

# 8. FUTURE / HIGH-IMPACT IDEAS

---

## 📸 8.1 Receipt Ingestion

### What

Scan receipts → auto ingest

### Why

* data expansion
* real purchase behavior

---

## 🛒 8.2 Store Integration

* real-time pricing
* direct checkout optimization

---

## 🤖 8.3 Smart Assistant

### What

AI that:

* builds baskets
* suggests optimizations
* answers queries

---

## 🧬 8.4 Hyper-Personalization

* budget-based planning
* dietary preferences
* behavior-driven suggestions

---

# 9. PRODUCT LOOP (IMPORTANT)

This is the system you want:

1. User searches / builds basket
2. System optimizes
3. User saves money
4. User tracks prices
5. System learns patterns
6. System improves recommendations
7. User returns

---

# 10. WHAT YOU SHOULD BUILD NEXT

## Immediate

* numeric markers
* LLM adjudication
* enrichment (brand + category + unit price)

## Then

* basket optimizer
* price tracking
* deal detection

## Then

* pattern analysis
* query engine

---

# 11. THE REAL GOAL

Not:

> reduce warnings

Not:

> parse more data

But:

> **turn messy product data into actionable economic intelligence**

---

# If you want next

I can turn this into:

* a **phased build plan with exact order**
* **API design for Basket Optimizer**
* **DB schema for enrichment + decisions**
* or **Codex prompts for each major feature**

Just tell me which direction you want to go.


This is where your system starts turning into something *dangerously powerful*.
You’re no longer just building “price comparison” — you’re building a **decision engine for consumption**.

I’ll expand this properly with:

* deeper specs
* light schemas
* API shapes
* build order
* and your **recipe system integrated as a first-class extension**

---

# 🧠 1. DATA FOUNDATION (DEEPER)

## 1.1 Canonical Product (FINAL SHAPE)

### Target Schema (v1.5 direction)

```json
{
  "id": "canonical_id",
  "name": "Coca Cola 500ml",
  "brand": "Coca Cola",
  "category": "beverages",
  "subcategory": "soft_drinks",

  "volume_ml": 500,
  "count": 1,

  "unit_price": {
    "per_liter": 2.40
  },

  "attributes": {
    "sugar_free": false,
    "carbonated": true
  },

  "markers": {
    "volume_marker": 500,
    "count_marker": 1
  },

  "tokens": ["coca", "cola"],
  "normalized_name": "...",

  "source_refs": [],
  "created_at": "...",
  "updated_at": "..."
}
```

---

## 1.2 What You’re Missing (High Value)

### 🔥 Add NOW (cheap, high ROI)

* `brand`
* `category`
* `subcategory`
* `unit_price`
* `count_marker`

### 🧠 Add NEXT

* `variant` (diet, zero, etc.)
* `quality markers` (reserve, premium, organic)

---

## 1.3 Category System (IMPORTANT)

Start simple:

```json
{
  "category": "food",
  "subcategory": "pasta"
}
```

Later:

```json
{
  "category": "food",
  "subcategory": "pasta",
  "type": "spaghetti",
  "cuisine": "italian"
}
```

👉 Don’t overdesign early
👉 But DO reserve space

---

# 🧠 2. ENRICHMENT PIPELINE

## New Phase (Phase 14 candidate)

### Pipeline extension:

```
ingest → canonicalize → markers → enrichment → decision → store
```

---

## 2.1 Enrichment Modules (Modular Design)

Each enrichment = deterministic micro-module

### Example

```js
enrichBrand(product)
enrichCategory(product)
computeUnitPrice(product)
extractVariant(product)
```

---

## 2.2 LLM-Assisted Enrichment (Controlled)

Only when needed:

* category classification
* ambiguous brand detection

### Cache result:

```json
{
  "input_hash": "...",
  "result": {
    "category": "dairy",
    "subcategory": "milk"
  }
}
```

---

# 🧠 3. LLM DISAMBIGUATION SYSTEM (EXPANDED)

## API Design

### POST `/internal/disambiguate`

```json
{
  "pairs": [
    {
      "a": {...},
      "b": {...},
      "context": {
        "tokens_overlap": 0.8
      }
    }
  ]
}
```

### Response

```json
{
  "results": [
    {
      "decision": "same_product",
      "confidence": 0.92,
      "reason": "same product, age irrelevant"
    }
  ]
}
```

---

## Storage

```sql
disambiguation_decisions
- id
- product_a_id
- product_b_id
- decision
- confidence
- reason
- source (llm/manual)
- fingerprint
- created_at
```

---

# 🧠 4. CORE FEATURE: BASKET OPTIMIZER

## API DESIGN

### POST `/optimize-basket`

```json
{
  "items": [
    { "query": "milk 1l" },
    { "query": "eggs 10" }
  ],
  "constraints": {
    "max_stores": 2,
    "budget": 50
  }
}
```

---

## Response

```json
{
  "total_cost": 23.40,
  "stores": [
    {
      "store": "Lidl",
      "items": [...]
    }
  ],
  "savings": 5.20
}
```

---

## Core Algorithm (v1)

1. Resolve each item → canonical product
2. Get all store prices
3. Try:

   * single store
   * multi-store combinations
4. pick cheapest

---

## Upgrade Path

* graph optimization
* travel cost weighting
* stock availability

---

# 🧠 5. PRICE TRACKER

## DB TABLE

```sql
price_history
- id
- canonical_product_id
- store_id
- price
- timestamp
```

---

## Features

* trend line
* lowest price
* alerts

---

## API

```http
GET /product/{id}/price-history
```

---

# 🧠 6. DEAL DETECTOR

## Logic

```js
if (current_price < avg_price * 0.75) → deal
```

---

## Output

```json
{
  "product_id": "...",
  "deal_score": 0.82,
  "reason": "25% below avg"
}
```

---

# 🧠 7. SMART QUERY ENGINE

## API

```http
POST /query
```

```json
{
  "query": "cheapest pasta in burgas"
}
```

---

## Internals

* parse intent
* map to filters
* run aggregation

---

# 🧠 8. BUY PATTERN SYSTEM

## Table

```sql
user_purchases
- user_id
- product_id
- timestamp
```

---

## Insights

* frequent items
* basket clusters
* repetition cycles

---

# 🍲 9. RECIPE SYSTEM (YOUR NEW IDEA — FULL DESIGN)

This is **huge** and fits perfectly.

---

## 9.1 Recipe Schema

```json
{
  "id": "recipe_id",
  "name": "Spaghetti Carbonara",

  "ingredients": [
    {
      "name": "spaghetti",
      "canonical_product_id": "...",
      "quantity": 200,
      "unit": "g"
    }
  ],

  "tags": ["italian", "quick", "comfort_food"],
  "cooking_time": 20,
  "tools": ["pan"],

  "nutrition": {},
  "difficulty": "easy"
}
```

---

## 9.2 Preference Engine

### User swipes:

```sql
recipe_preferences
- user_id
- recipe_id
- liked (bool)
```

---

## Build taste profile

```json
{
  "likes": ["italian", "pasta"],
  "dislikes": ["fish"],
  "patterns": ["quick_meals"]
}
```

---

## 9.3 Weekly Meal Generator

### Input

```json
{
  "budget": 60,
  "store": "Lidl",
  "days": 7
}
```

---

## Output

```json
{
  "meal_plan": [...],
  "shopping_list": [...],
  "total_cost": 54.30
}
```

---

## Core Logic

1. filter recipes by preference
2. select diverse set
3. optimize:

   * ingredient reuse
   * cost
4. map ingredients → canonical products
5. run basket optimizer

---

## 🔥 This is your killer feature

Because it combines:

* pricing
* preferences
* real-world utility

---

# 🧠 10. BUILD PHASE PLAN (IMPORTANT)

---

## ✅ PHASE 1 (NOW)

* markers (count, age)
* enrichment (brand, category)
* unit price
* LLM disambiguation

---

## ✅ PHASE 2

* basket optimizer
* price history
* deal detection

---

## ✅ PHASE 3

* smart queries
* pattern tracking
* recommendations

---

## 🚀 PHASE 4

* recipe ingestion
* swipe preference system
* weekly planner

---

## 🚀 PHASE 5

* full personalization engine
* predictive shopping
* automated baskets

---

# 🧠 11. WHAT YOU’RE REALLY BUILDING

Let’s be very clear:

You are building:

> **A system that understands products, prices, and human behavior — and optimizes decisions.**

---

# If you want next

We can go VERY tactical:

* write **Codex prompts for Phase 1.5 enrichment**
* design **exact DB schema (Postgres/Supabase)**
* build **basket optimizer algorithm step-by-step**
* or design **recipe ingestion pipeline**

Just tell me which one 👍
