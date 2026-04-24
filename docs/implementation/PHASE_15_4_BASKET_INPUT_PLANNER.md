# Phase 15.4 Implementation Contract

## Goal
Bridge Phase 15.3 shopping-list resolution into a deterministic basket-planning payload that later optimization layers can consume directly.

## Runtime modules
- `app/functions/src/phase15/basket_planner.js`
- `functions/src/phase15/basket_planner.js`
- `functions/index.js`

## Core exports
- `buildBasketPlanFromResolvedItems(...)`
- `handleBuildBasketPlanRequest(...)`

## Route contract
- `POST /basket/plan`
  - accepts raw shopping-list items
  - accepts `layer_mode`
  - accepts planner options for ambiguous and unresolved handling
  - internally reuses Phase 15.3 resolution

## Planner policies
- ambiguous:
  - `carry_top_n`
  - `force_best`
  - `require_confirmation`
- unresolved:
  - `exclude`
  - `placeholder`
  - `block`

## Deterministic handling
- preserves requested quantity and simple markers
- preserves ready-item canonical markers and enrichment
- never mutates canonical truth, canonical mappings, or enrichment cache
- never calls external services

## Verification targets
- all-resolved ready planning
- ambiguous carry behavior
- ambiguous blocking behavior
- unresolved exclude behavior
- unresolved block behavior
- quantity-marker preservation
- carried-candidate correctness
- no canonical or enrichment mutation
