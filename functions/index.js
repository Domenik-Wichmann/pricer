const express = require("express");
const {onRequest} = require("firebase-functions/v2/https");
const {setGlobalOptions} = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");

const {
  createRuntimeDataBackboneStore,
  getProductHistory,
  handleCanonicalProductFilterFacetsRequest,
  handleCantFindThisRequest,
  handleDealCheckRequest,
  handleGetCanonicalProductRequest,
  handleGetBasketAnalyticsSummaryRequest,
  handleGetBasketHealthRequest,
  handleGetGapDetectionRequest,
  handleGetLocalityGapDetectionRequest,
  handleGetGapCoverageByChainRequest,
  handleGetMarketOpportunityReportsRequest,
  handleGetMerchantCategoryInsightsRequest,
  handleGetMerchantChainInsightsRequest,
  handleGetMerchantInsightOpportunitiesRequest,
  handleGetMerchantInsightOverviewRequest,
  handleGetMerchantLocalityInsightsRequest,
  handleInternalInsightsDashboardRequest,
  requireInternalAnalyticsAccess,
  handleAddWatchlistItemRequest,
  handleCreateSavedListRequest,
  handleDeleteSavedListRequest,
  handleGenerateMealPlanRequest,
  handleGetEnrichmentAnalyticsSummaryRequest,
  handleGetMealPlanOptimizedBasketRequest,
  handleGetMealPlanRequest,
  handleGetMealPlanShoppingRunRequest,
  handleGetSavedListRequest,
  handleGetWatchlistItemRequest,
  handleGetEntitlementStatusRequest,
  handleHomeSummaryRequest,
  handleGetLocationReviewCandidateRequest,
  handleGetReviewedLocationCoordinateRequest,
  handleMarketOverviewRequest,
  handleMarketTrendsRequest,
  handleManualAddressGeocodeRequest,
  handleNearestProductAvailabilityRequest,
  handleGetTopDemandRequest,
  handleGetTrendingDemandRequest,
  handleBuildBasketPlanRequest,
  handleLookupCanonicalProductPricesRequest,
  handleListSavedListsRequest,
  handleListSavedUserLocationsRequest,
  handleListLocationReviewCandidatesRequest,
  handleListReviewedLocationCoordinatesRequest,
  handleListWatchlistItemsRequest,
  handleOptimizeBasketSingleStoreRequest,
  handleOptimizeBasketRequest,
  handleOptimizeSavedListRequest,
  handleQueryEngineRequest,
  handleResolveShoppingListItemsRequest,
  handleSearchCanonicalProductsRequest,
  handleRemoveWatchlistItemRequest,
  handleReviewLocationCandidateRequest,
  handleRunMealPlanShoppingRequest,
  handleReviewedCoordinateDiagnosticsRequest,
  handleReviewedCoordinateRolloutDiagnosticsRequest,
  handleSetTargetPriceRequest,
  handleSyncRevenueCatEntitlementRequest,
  handleUpdateSavedListRequest,
  handleUpsertSavedUserLocationRequest,
  handleDeleteSavedUserLocationRequest,
  handleUpdateWatchlistItemRequest,
  handleWatchlistInsightsRequest,
  handleWatchlistPriceViewRequest,
  handleWatchlistSummaryRequest,
  createPostgresPool,
  runPostgresMigrations,
} = require("./src");

setGlobalOptions({
  region: "europe-west1",
  maxInstances: 10,
});

const app = express();
app.disable("x-powered-by");
app.use(express.json({limit: "1mb"}));
app.use(express.urlencoded({extended: false}));

let runtimeStorePromise = null;
let postgresPoolPromise = null;
let postgresReadyPromise = null;

function getStore() {
  if (!runtimeStorePromise) {
    runtimeStorePromise = createRuntimeDataBackboneStore();
  }

  return runtimeStorePromise;
}

async function getPostgresPool() {
  if (!postgresPoolPromise) {
    postgresPoolPromise = Promise.resolve()
      .then(() => createPostgresPool())
      .catch((error) => {
        postgresPoolPromise = null;
        throw error;
      });
  }

  return postgresPoolPromise;
}

async function ensurePostgresReady(pool) {
  if (!postgresReadyPromise) {
    postgresReadyPromise = (async () => {
      const client = await pool.connect();
      try {
        await runPostgresMigrations({client});
      } finally {
        client.release();
      }
      return true;
    })().catch((error) => {
      postgresReadyPromise = null;
      throw error;
    });
  }

  return postgresReadyPromise;
}

function readRequestData(req) {
  if (req.method === "GET") {
    return req.query || {};
  }

  return req.body || {};
}

function sendEnvelope(res, response) {
  if (!response || typeof response.status !== "number") {
    throw new Error("backend handler returned an invalid response envelope");
  }

  res.status(response.status).json(response.body);
}

function guardInternalAnalyticsAccess(req, res) {
  const access = requireInternalAnalyticsAccess(req);
  if (access.allowed) {
    return true;
  }
  res.status(access.status).json(access.body);
  return false;
}

function isPostgresConfigurationError(error) {
  const message = String(error?.message || "");
  return message.includes("Postgres is not configured") ||
    message.includes("Incomplete Postgres configuration");
}

async function withPostgresRoute(res, handler, {
  includeStore = false,
} = {}) {
  try {
    const pool = await getPostgresPool();
    await ensurePostgresReady(pool);
    const client = await pool.connect();
    try {
      const store = includeStore ? await getStore() : null;
      return await handler({client, store});
    } finally {
      client.release();
    }
  } catch (error) {
    if (isPostgresConfigurationError(error)) {
      res.status(503).json({
        error: "meal planning database not configured",
      });
      return null;
    }
    throw error;
  }
}

function wrapRoute(handler, options = {}) {
  const {
    methods = ["GET", "POST"],
  } = options;

  return async (req, res, next) => {
    try {
      if (!methods.includes(req.method)) {
        res.status(405).json({
          error: "method not allowed",
          allowed_methods: methods,
        });
        return;
      }

      const store = await getStore();
      const response = await handler({
        store,
        body: readRequestData(req),
        req,
      });

      sendEnvelope(res, response);
    } catch (error) {
      next(error);
    }
  };
}

app.get("/", async (req, res) => {
  const store = await getStore();
  res.status(200).json({
    service: "pricer-backend",
    status: "ok",
    store_backend: store.constructor.name,
    routes: [
      "POST /query",
      "GET /product-history",
      "GET /products/:id",
      "POST /products/search",
      "POST /products/filter-facets",
      "POST /products/deal-check",
      "POST /products/nearest-availability",
      "POST /user/locations/geocode-address",
      "GET /home/summary",
      "POST /market/trends",
      "GET /market/overview",
      "POST /shopping-list/resolve",
      "POST /basket/plan",
      "POST /basket/optimize",
      "POST /prices/lookup",
      "POST /meal-plans/generate",
      "GET /meal-plans/:planId",
      "POST /meal-plans/:planId/shopping/run",
      "GET /meal-plan-shopping-runs/:runId",
      "GET /meal-plan-optimized-baskets/:basketId",
      "POST /lists",
      "GET /lists",
      "GET /lists/:id",
      "PATCH /lists/:id",
      "DELETE /lists/:id",
      "POST /lists/:id/optimize",
      "GET /user/locations",
      "POST /user/locations",
      "PATCH /user/locations/:id",
      "DELETE /user/locations/:id",
      "GET /analytics/enrichment-summary",
      "GET /analytics/basket-summary",
      "GET /analytics/basket-health",
      "GET /analytics/gap-detection",
      "GET /analytics/gap-detection/localities",
      "GET /analytics/gap-detection/coverage-by-chain",
      "GET /analytics/opportunities",
      "GET /analytics/insights/overview",
      "GET /analytics/insights/opportunities",
      "GET /analytics/insights/categories",
      "GET /analytics/insights/localities",
      "GET /analytics/insights/chains",
      "GET /internal/insights/dashboard",
      "GET /internal/location-review/candidates",
      "GET /internal/location-review/candidates/:id",
      "POST /internal/location-review/candidates/:id/approve",
      "POST /internal/location-review/candidates/:id/reject",
      "POST /internal/location-review/candidates/:id/needs-more-info",
      "GET /internal/location-review/reviewed-coordinates",
      "GET /internal/location-review/reviewed-coordinates/:id",
      "GET /internal/location-review/coordinate-diagnostics",
      "GET /internal/location-review/rollout-diagnostics",
      "POST /watchlist",
      "GET /watchlist",
      "GET /watchlist/prices",
      "GET /watchlist/:id",
      "PATCH /watchlist/:id",
      "DELETE /watchlist/:id",
      "POST /watchlist/target-price",
      "GET /watchlist/summary",
      "GET /watchlist/insights",
      "POST /demand/cant-find-this",
      "GET /demand/top",
      "GET /demand/trending",
      "POST /optimize-basket",
      "GET /entitlement/status",
      "POST /entitlement/sync",
    ],
  });
});

app.post("/query", wrapRoute(handleQueryEngineRequest, {
  methods: ["POST"],
}));

app.get("/product-history", async (req, res, next) => {
  try {
    const sourceProductId = typeof req.query.source_product_id === "string" ?
      req.query.source_product_id :
      null;

    if (!sourceProductId) {
      res.status(400).json({
        error: "source_product_id is required",
      });
      return;
    }

    const store = await getStore();
    const items = await getProductHistory({
      store,
      sourceProductId,
    });

    res.status(200).json({items});
  } catch (error) {
    next(error);
  }
});

app.get("/products/:id", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleGetCanonicalProductRequest({
      store,
      params: req.params || {},
      query: req.query || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.post("/products/search", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleSearchCanonicalProductsRequest({
      store,
      body: req.body || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.post("/products/filter-facets", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleCanonicalProductFilterFacetsRequest({
      store,
      body: req.body || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.post("/products/deal-check", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleDealCheckRequest({
      store,
      body: req.body || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.post("/products/nearest-availability", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleNearestProductAvailabilityRequest({
      store,
      body: req.body || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.post("/user/locations/geocode-address", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleManualAddressGeocodeRequest({
      store,
      body: req.body || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/home/summary", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleHomeSummaryRequest({
      store,
      query: req.query || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.post("/market/trends", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleMarketTrendsRequest({
      store,
      body: req.body || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/market/overview", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleMarketOverviewRequest({
      store,
      body: req.query || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.post("/shopping-list/resolve", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleResolveShoppingListItemsRequest({
      store,
      body: req.body || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.post("/basket/plan", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleBuildBasketPlanRequest({
      store,
      body: req.body || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.post("/prices/lookup", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleLookupCanonicalProductPricesRequest({
      store,
      body: req.body || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.post("/basket/optimize", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleOptimizeBasketSingleStoreRequest({
      store,
      body: req.body || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.post("/meal-plans/generate", async (req, res, next) => {
  try {
    const response = await withPostgresRoute(res, async ({client}) => {
      return handleGenerateMealPlanRequest({
        client,
        body: req.body || {},
        req,
      });
    });
    if (!response) {
      return;
    }
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/meal-plans/:planId", async (req, res, next) => {
  try {
    const response = await withPostgresRoute(res, async ({client}) => {
      return handleGetMealPlanRequest({
        client,
        params: req.params || {},
        req,
      });
    });
    if (!response) {
      return;
    }
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.post("/meal-plans/:planId/shopping/run", async (req, res, next) => {
  try {
    const response = await withPostgresRoute(res, async ({client, store}) => {
      return handleRunMealPlanShoppingRequest({
        client,
        store,
        params: req.params || {},
        body: req.body || {},
        req,
      });
    }, {
      includeStore: true,
    });
    if (!response) {
      return;
    }
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/meal-plan-shopping-runs/:runId", async (req, res, next) => {
  try {
    const response = await withPostgresRoute(res, async ({client}) => {
      return handleGetMealPlanShoppingRunRequest({
        client,
        params: req.params || {},
        req,
      });
    });
    if (!response) {
      return;
    }
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/meal-plan-optimized-baskets/:basketId", async (req, res, next) => {
  try {
    const response = await withPostgresRoute(res, async ({client}) => {
      return handleGetMealPlanOptimizedBasketRequest({
        client,
        params: req.params || {},
        req,
      });
    });
    if (!response) {
      return;
    }
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.post("/lists", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleCreateSavedListRequest({
      store,
      body: req.body || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/lists", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleListSavedListsRequest({
      store,
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/lists/:id", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleGetSavedListRequest({
      store,
      params: req.params || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.patch("/lists/:id", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleUpdateSavedListRequest({
      store,
      params: req.params || {},
      body: req.body || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.delete("/lists/:id", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleDeleteSavedListRequest({
      store,
      params: req.params || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.post("/lists/:id/optimize", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleOptimizeSavedListRequest({
      store,
      params: req.params || {},
      body: req.body || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/user/locations", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleListSavedUserLocationsRequest({
      store,
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.post("/user/locations", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleUpsertSavedUserLocationRequest({
      store,
      body: req.body || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.patch("/user/locations/:id", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleUpsertSavedUserLocationRequest({
      store,
      body: {
        ...(req.body || {}),
        location_id: req.params.id,
      },
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.delete("/user/locations/:id", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleDeleteSavedUserLocationRequest({
      store,
      params: req.params || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/analytics/enrichment-summary", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleGetEnrichmentAnalyticsSummaryRequest({
      store,
      query: req.query || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/analytics/basket-summary", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleGetBasketAnalyticsSummaryRequest({
      store,
      query: req.query || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/analytics/basket-health", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleGetBasketHealthRequest({
      store,
      query: req.query || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/analytics/gap-detection", async (req, res, next) => {
  try {
    if (!guardInternalAnalyticsAccess(req, res)) {
      return;
    }
    const store = await getStore();
    const response = await handleGetGapDetectionRequest({
      store,
      query: req.query || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/analytics/gap-detection/localities", async (req, res, next) => {
  try {
    if (!guardInternalAnalyticsAccess(req, res)) {
      return;
    }
    const store = await getStore();
    const response = await handleGetLocalityGapDetectionRequest({
      store,
      query: req.query || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/analytics/gap-detection/coverage-by-chain", async (req, res, next) => {
  try {
    if (!guardInternalAnalyticsAccess(req, res)) {
      return;
    }
    const store = await getStore();
    const response = await handleGetGapCoverageByChainRequest({
      store,
      query: req.query || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/analytics/opportunities", async (req, res, next) => {
  try {
    if (!guardInternalAnalyticsAccess(req, res)) {
      return;
    }
    const store = await getStore();
    const response = await handleGetMarketOpportunityReportsRequest({
      store,
      query: req.query || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/analytics/insights/overview", async (req, res, next) => {
  try {
    if (!guardInternalAnalyticsAccess(req, res)) {
      return;
    }
    const store = await getStore();
    const response = await handleGetMerchantInsightOverviewRequest({
      store,
      query: req.query || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/analytics/insights/opportunities", async (req, res, next) => {
  try {
    if (!guardInternalAnalyticsAccess(req, res)) {
      return;
    }
    const store = await getStore();
    const response = await handleGetMerchantInsightOpportunitiesRequest({
      store,
      query: req.query || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/analytics/insights/categories", async (req, res, next) => {
  try {
    if (!guardInternalAnalyticsAccess(req, res)) {
      return;
    }
    const store = await getStore();
    const response = await handleGetMerchantCategoryInsightsRequest({
      store,
      query: req.query || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/analytics/insights/localities", async (req, res, next) => {
  try {
    if (!guardInternalAnalyticsAccess(req, res)) {
      return;
    }
    const store = await getStore();
    const response = await handleGetMerchantLocalityInsightsRequest({
      store,
      query: req.query || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/analytics/insights/chains", async (req, res, next) => {
  try {
    if (!guardInternalAnalyticsAccess(req, res)) {
      return;
    }
    const store = await getStore();
    const response = await handleGetMerchantChainInsightsRequest({
      store,
      query: req.query || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/internal/insights/dashboard", async (req, res, next) => {
  try {
    const response = handleInternalInsightsDashboardRequest();
    res
      .status(response.status)
      .set(response.headers || {})
      .send(response.body);
  } catch (error) {
    next(error);
  }
});

app.get("/internal/location-review/candidates", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleListLocationReviewCandidatesRequest({
      store,
      body: req.query || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/internal/location-review/candidates/:id", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleGetLocationReviewCandidateRequest({
      store,
      params: req.params || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/internal/location-review/reviewed-coordinates", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleListReviewedLocationCoordinatesRequest({
      store,
      body: req.query || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/internal/location-review/reviewed-coordinates/:id", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleGetReviewedLocationCoordinateRequest({
      store,
      params: req.params || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/internal/location-review/coordinate-diagnostics", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleReviewedCoordinateDiagnosticsRequest({
      store,
      body: req.query || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/internal/location-review/rollout-diagnostics", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleReviewedCoordinateRolloutDiagnosticsRequest({
      store,
      body: req.query || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.post("/internal/location-review/candidates/:id/approve", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleReviewLocationCandidateRequest({
      store,
      params: req.params || {},
      body: req.body || {},
      req,
      decision: "approved",
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.post("/internal/location-review/candidates/:id/reject", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleReviewLocationCandidateRequest({
      store,
      params: req.params || {},
      body: req.body || {},
      req,
      decision: "rejected",
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.post("/internal/location-review/candidates/:id/needs-more-info", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleReviewLocationCandidateRequest({
      store,
      params: req.params || {},
      body: req.body || {},
      req,
      decision: "needs_more_info",
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.post("/watchlist", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleAddWatchlistItemRequest({
      store,
      body: req.body || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/watchlist", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleListWatchlistItemsRequest({
      store,
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/watchlist/prices", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleWatchlistPriceViewRequest({
      store,
      query: req.query || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.get("/watchlist/summary", wrapRoute(handleWatchlistSummaryRequest, {
  methods: ["GET"],
}));

app.get("/watchlist/insights", wrapRoute(handleWatchlistInsightsRequest, {
  methods: ["GET"],
}));

app.post("/watchlist/target-price", wrapRoute(handleSetTargetPriceRequest, {
  methods: ["POST"],
}));

app.get("/watchlist/:id", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleGetWatchlistItemRequest({
      store,
      params: req.params || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.patch("/watchlist/:id", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleUpdateWatchlistItemRequest({
      store,
      params: req.params || {},
      body: req.body || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.delete("/watchlist/:id", async (req, res, next) => {
  try {
    const store = await getStore();
    const response = await handleRemoveWatchlistItemRequest({
      store,
      params: req.params || {},
      req,
    });
    sendEnvelope(res, response);
  } catch (error) {
    next(error);
  }
});

app.post("/demand/cant-find-this", wrapRoute(handleCantFindThisRequest, {
  methods: ["POST"],
}));

app.get("/demand/top", wrapRoute(handleGetTopDemandRequest, {
  methods: ["GET"],
}));

app.get("/demand/trending", wrapRoute(handleGetTrendingDemandRequest, {
  methods: ["GET"],
}));

app.post("/optimize-basket", wrapRoute(handleOptimizeBasketRequest, {
  methods: ["POST"],
}));

app.get("/entitlement/status", wrapRoute(handleGetEntitlementStatusRequest, {
  methods: ["GET"],
}));

app.post("/entitlement/sync", wrapRoute(handleSyncRevenueCatEntitlementRequest, {
  methods: ["POST"],
}));

app.use((req, res) => {
  res.status(404).json({
    error: "not found",
  });
});

app.use((error, req, res, next) => {
  logger.error("HTTP function request failed", {
    path: req.path,
    method: req.method,
    message: error.message,
    stack: error.stack,
  });

  if (res.headersSent) {
    next(error);
    return;
  }

  res.status(500).json({
    error: "internal error",
  });
});

exports.api = onRequest({
  cors: true,
  timeoutSeconds: 120,
  memory: "1GiB",
}, app);
