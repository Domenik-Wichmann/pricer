const express = require("express");
const {onRequest} = require("firebase-functions/v2/https");
const {setGlobalOptions} = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");

const {
  createRuntimeDataBackboneStore,
  getProductHistory,
  handleCanonicalProductFilterFacetsRequest,
  handleCantFindThisRequest,
  handleGetCanonicalProductRequest,
  handleGetEnrichmentAnalyticsSummaryRequest,
  handleGetEntitlementStatusRequest,
  handleGetTopDemandRequest,
  handleGetTrendingDemandRequest,
  handleBuildBasketPlanRequest,
  handleLookupCanonicalProductPricesRequest,
  handleOptimizeBasketSingleStoreRequest,
  handleOptimizeBasketRequest,
  handleQueryEngineRequest,
  handleResolveShoppingListItemsRequest,
  handleSearchCanonicalProductsRequest,
  handleSetTargetPriceRequest,
  handleSyncRevenueCatEntitlementRequest,
  handleWatchlistInsightsRequest,
  handleWatchlistSummaryRequest,
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

function getStore() {
  if (!runtimeStorePromise) {
    runtimeStorePromise = createRuntimeDataBackboneStore();
  }

  return runtimeStorePromise;
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
      "POST /shopping-list/resolve",
      "POST /basket/plan",
      "POST /basket/optimize",
      "POST /prices/lookup",
      "GET /analytics/enrichment-summary",
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

app.get("/watchlist/summary", wrapRoute(handleWatchlistSummaryRequest, {
  methods: ["GET"],
}));

app.get("/watchlist/insights", wrapRoute(handleWatchlistInsightsRequest, {
  methods: ["GET"],
}));

app.post("/watchlist/target-price", wrapRoute(handleSetTargetPriceRequest, {
  methods: ["POST"],
}));

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
