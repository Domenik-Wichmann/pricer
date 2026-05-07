import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pricer_mobile/app.dart';
import 'package:pricer_mobile/core/models/app_models.dart';
import 'package:pricer_mobile/core/navigation/app_routes.dart';
import 'package:pricer_mobile/core/services/ad_service.dart';
import 'package:pricer_mobile/core/services/api_client.dart';
import 'package:pricer_mobile/core/services/app_dependencies.dart';
import 'package:pricer_mobile/core/services/billing_repositories.dart';
import 'package:pricer_mobile/core/services/current_location_service.dart';
import 'package:pricer_mobile/core/services/firestore_repositories.dart';
import 'package:pricer_mobile/core/services/monetization_service.dart';
import 'package:pricer_mobile/core/services/recent_activity_service.dart';
import 'package:pricer_mobile/core/services/voice_input_service.dart';
import 'package:pricer_mobile/features/monetization/paywall_screen.dart';

class FakeApiClient extends QueryApiClient {
  FakeApiClient({
    HomeSummary? homeSummary,
    CanonicalProductDetail? product,
    ProductDealCheckResult? dealCheckResult,
    ProductSearchResponse? productSearchResponse,
    BasketOptimizationResponse? basketOptimizationResponse,
    WatchlistPriceViewResponse? watchlistPriceResponse,
    SavedListsResponse? savedListsResponse,
    SavedListDetail? savedListDetail,
    SavedUserLocationsResponse? savedUserLocationsResponse,
    NearestAvailabilityResponse? nearestAvailabilityResponse,
    ManualAddressGeocodeResponse? manualAddressGeocodeResponse,
    this.homeSummaryCompleter,
    this.basketOptimizationCompleter,
    this.watchlistPriceCompleter,
    this.savedListsCompleter,
    this.failHomeSummary = false,
    this.failProductSearch = false,
    this.failBasketOptimize = false,
    this.failWatchlistPrices = false,
    this.failWatchlistRemove = false,
    this.failSavedLists = false,
    this.failSavedListDetail = false,
    this.failSavedListCreate = false,
    this.failSavedListUpdate = false,
    this.failSavedListDelete = false,
    this.failProduct = false,
    this.productNotFound = false,
    this.failDealCheck = false,
    this.failWatchlistAdd = false,
  })  : homeSummary = homeSummary ?? HomeSummary.empty(),
        productSearchResponse =
            productSearchResponse ?? _defaultProductSearchResponse(),
        basketOptimizationResponse =
            basketOptimizationResponse ?? _defaultBasketOptimizationResponse(),
        watchlistPriceResponse =
            watchlistPriceResponse ?? _defaultWatchlistPriceResponse(),
        savedListsResponse = savedListsResponse ?? _defaultSavedListsResponse(),
        savedListDetail = savedListDetail ?? _defaultSavedListDetail(),
        savedUserLocationsResponse =
            savedUserLocationsResponse ?? _defaultSavedUserLocationsResponse(),
        nearestAvailabilityResponse = nearestAvailabilityResponse ??
            _defaultNearestAvailabilityResponse(),
        manualAddressGeocodeResponse = manualAddressGeocodeResponse ??
            _defaultManualAddressGeocodeResponse(),
        product = product ?? _defaultProduct(),
        dealCheckResult = dealCheckResult ?? _defaultDealCheck(),
        super(baseUrl: 'http://example.test');

  HomeSummary homeSummary;
  ProductSearchResponse productSearchResponse;
  BasketOptimizationResponse basketOptimizationResponse;
  WatchlistPriceViewResponse watchlistPriceResponse;
  SavedListsResponse savedListsResponse;
  SavedListDetail savedListDetail;
  SavedUserLocationsResponse savedUserLocationsResponse;
  NearestAvailabilityResponse nearestAvailabilityResponse;
  ManualAddressGeocodeResponse manualAddressGeocodeResponse;
  CanonicalProductDetail product;
  ProductDealCheckResult dealCheckResult;
  Completer<HomeSummary>? homeSummaryCompleter;
  Completer<BasketOptimizationResponse>? basketOptimizationCompleter;
  Completer<WatchlistPriceViewResponse>? watchlistPriceCompleter;
  Completer<SavedListsResponse>? savedListsCompleter;
  bool failHomeSummary;
  bool failProductSearch;
  bool failBasketOptimize;
  bool failWatchlistPrices;
  bool failWatchlistRemove;
  bool failSavedLists;
  bool failSavedListDetail;
  bool failSavedListCreate;
  bool failSavedListUpdate;
  bool failSavedListDelete;
  bool failProduct;
  bool productNotFound;
  bool failDealCheck;
  bool failWatchlistAdd;
  int homeSummaryCalls = 0;
  int productSearchCalls = 0;
  int basketOptimizeCalls = 0;
  int watchlistPriceCalls = 0;
  int watchlistRemoveCalls = 0;
  int savedListsCalls = 0;
  int savedListDetailCalls = 0;
  int savedListCreateCalls = 0;
  int savedListUpdateCalls = 0;
  int savedListDeleteCalls = 0;
  int productCalls = 0;
  int dealCheckCalls = 0;
  int watchlistAddCalls = 0;
  String? lastHomeSummaryOwnerId;
  String? lastHomeSummaryOwnerType;
  String? lastProductSearchQuery;
  int? lastProductSearchLimit;
  int? lastProductSearchOffset;
  List<String>? lastBasketOptimizeItems;
  String? lastBasketOptimizeStrategy;
  bool? lastBasketIncludeExplanation;
  bool? lastBasketIncludeConvenienceScoring;
  String? lastWatchlistPricesOwnerId;
  String? lastWatchlistPricesOwnerType;
  String? lastWatchlistRemoveOwnerId;
  String? lastWatchlistRemoveOwnerType;
  String? lastRemovedWatchId;
  String? lastSavedListsOwnerId;
  String? lastSavedListsOwnerType;
  String? lastSavedListDetailOwnerId;
  String? lastSavedListDetailOwnerType;
  String? lastSavedListDetailId;
  String? lastSavedListCreateOwnerId;
  String? lastSavedListCreateOwnerType;
  String? lastSavedListCreateName;
  List<String>? lastSavedListCreateItems;
  String? lastSavedListUpdateOwnerId;
  String? lastSavedListUpdateOwnerType;
  String? lastSavedListUpdateId;
  String? lastSavedListUpdateName;
  List<String>? lastSavedListUpdateItems;
  String? lastSavedListDeleteOwnerId;
  String? lastSavedListDeleteOwnerType;
  String? lastDeletedListId;
  String? lastProductId;
  List<String>? lastDealCheckIds;
  String? lastWatchlistOwnerId;
  String? lastWatchlistOwnerType;
  String? lastWatchlistCanonicalProductId;
  String? lastWatchlistLabel;
  int savedUserLocationsCalls = 0;
  int saveUserLocationCalls = 0;
  int nearestAvailabilityCalls = 0;
  int manualAddressGeocodeCalls = 0;
  String? lastNearestCanonicalProductId;
  String? lastNearestSavedLocationId;
  String? lastNearestLabel;
  String? lastNearestOwnerId;
  double? lastNearestLatitude;
  double? lastNearestLongitude;
  double? lastNearestRadiusKm;
  String? lastNearestSort;
  String? lastSavedUserLocationLabel;
  String? lastSavedUserLocationDisplayName;
  double? lastSavedUserLocationLatitude;
  double? lastSavedUserLocationLongitude;
  String? lastSavedUserLocationSource;
  String? lastSavedUserLocationProvider;
  String? lastSavedUserLocationProviderPlaceId;
  String? lastSavedUserLocationAddressRaw;
  Map<String, dynamic>? lastSavedUserLocationProvenance;
  String? lastManualAddressGeocodeOwnerId;
  String? lastManualAddressGeocodeAddressRaw;
  String? lastManualAddressGeocodeDisplayName;

  static CanonicalProductDetail _defaultProduct() {
    return const CanonicalProductDetail(
      canonicalProductId: 'cp_coffee',
      canonicalName: 'Coffee',
      markers: {'volume_marker': '250g'},
      enrichment: ProductEnrichment(
        categoryL1: 'grocery',
        categoryL2: 'coffee',
        categoryL3: null,
        categoryL4: null,
        brand: 'Test Brand',
        baseProduct: 'coffee',
        productLine: null,
        flavor: ['classic'],
        attributes: ['ground'],
        dietTags: [],
        allergens: [],
        productForm: 'bag',
        packaging: 'soft pack',
        usageContext: [],
        qualityTier: null,
      ),
      currentOfferSummary: CurrentOfferSummary(
        minCurrentPrice: 2.49,
        maxCurrentPrice: 2.99,
        avgCurrentPrice: 2.70,
        cheapestPrice: 2.49,
        currency: 'EUR',
        currentOfferCount: 2,
        comparisonBasis: 'per_kg',
        pricePerComparisonBasis: 9.96,
        priceNormalization: PriceNormalization(
          comparisonBasis: 'per_kg',
          pricePerComparisonBasis: 9.96,
        ),
      ),
    );
  }

  static ProductDealCheckResult _defaultDealCheck() {
    return const ProductDealCheckResult(
      currency: 'EUR',
      items: [
        ProductDealCheckItem(
          canonicalProductId: 'cp_coffee',
          priceStatus: 'priced',
          bestPrice: ProductBestPrice(
            price: 2.49,
            currency: 'EUR',
            chainName: 'Store A',
            comparisonBasis: 'per_kg',
            pricePerComparisonBasis: 9.96,
          ),
          deal: ProductDealInfo(
            dealLevel: 'good',
            dealScore: 0.82,
            reason: 'below recent average',
            targetHit: false,
          ),
        ),
      ],
    );
  }

  static ProductSearchResponse _defaultProductSearchResponse() {
    return const ProductSearchResponse(
      layerMode: 'canonical_with_enrichment',
      total: 1,
      limit: 25,
      offset: 0,
      results: [
        ProductSearchResult(
          canonicalProductId: 'cp_milk',
          canonicalName: 'Fresh milk',
          markers: {'volume_marker': '1L'},
          enrichment: ProductEnrichment(
            categoryL1: 'grocery',
            categoryL2: 'dairy',
            categoryL3: null,
            categoryL4: null,
            brand: 'Vereya',
            baseProduct: 'milk',
            productLine: null,
            flavor: [],
            attributes: ['fresh'],
            dietTags: [],
            allergens: ['milk'],
            productForm: 'liquid',
            packaging: 'bottle',
            usageContext: [],
            qualityTier: null,
          ),
          bestPrice: ProductBestPrice(
            price: 1.69,
            currency: 'EUR',
            chainName: 'Store A',
            comparisonBasis: 'per_liter',
            pricePerComparisonBasis: 1.69,
          ),
          currentOfferSummary: CurrentOfferSummary(
            minCurrentPrice: 1.69,
            maxCurrentPrice: 1.89,
            avgCurrentPrice: 1.79,
            cheapestPrice: 1.69,
            currency: 'EUR',
            currentOfferCount: 2,
            comparisonBasis: 'per_liter',
            pricePerComparisonBasis: 1.69,
            priceNormalization: PriceNormalization(
              comparisonBasis: 'per_liter',
              pricePerComparisonBasis: 1.69,
            ),
          ),
          deal: ProductDealInfo(
            dealLevel: 'good',
            dealScore: 0.82,
            reason: 'below recent average',
            targetHit: false,
          ),
        ),
      ],
    );
  }

  static BasketOptimizationResponse _defaultBasketOptimizationResponse() {
    return const BasketOptimizationResponse(
      optimizerResult: BasketOptimizerResult(
        optimizationType: 'multi_store',
        currency: 'EUR',
        recommendedStrategy: 'multi_store',
        bestOption: null,
        bestSingleStoreOption: BasketOption(
          actualTotal: 12,
          currency: 'EUR',
          storeCount: 1,
          chainName: 'Store A',
          storeName: null,
          pricedItemCount: 2,
          missingItemCount: 0,
          staleItemCount: 0,
          savingsVsBestSingleStore: null,
          stores: [],
          items: [
            BasketOptimizedItem(
              inputText: 'milk',
              canonicalName: 'Milk',
              quantity: 1,
              unitPrice: 5,
              lineTotal: 5,
              priceStatus: 'priced',
              warnings: [],
            ),
            BasketOptimizedItem(
              inputText: 'eggs',
              canonicalName: 'Eggs',
              quantity: 1,
              unitPrice: 7,
              lineTotal: 7,
              priceStatus: 'priced',
              warnings: [],
            ),
          ],
          warnings: [],
        ),
        bestMultiStoreOption: BasketOption(
          actualTotal: 8,
          currency: 'EUR',
          storeCount: 2,
          chainName: null,
          storeName: null,
          pricedItemCount: 2,
          missingItemCount: 0,
          staleItemCount: 0,
          savingsVsBestSingleStore: 4,
          stores: [
            BasketStoreOption(
              chainName: 'Lidl',
              storeName: null,
              actualTotal: 3,
              items: [
                BasketOptimizedItem(
                  inputText: 'milk',
                  canonicalName: 'Milk',
                  quantity: 1,
                  unitPrice: 3,
                  lineTotal: 3,
                  priceStatus: 'priced',
                  warnings: [],
                ),
              ],
            ),
            BasketStoreOption(
              chainName: 'Kaufland',
              storeName: null,
              actualTotal: 5,
              items: [
                BasketOptimizedItem(
                  inputText: 'eggs',
                  canonicalName: 'Eggs',
                  quantity: 1,
                  unitPrice: 5,
                  lineTotal: 5,
                  priceStatus: 'priced',
                  warnings: [],
                ),
              ],
            ),
          ],
          items: [
            BasketOptimizedItem(
              inputText: 'milk',
              canonicalName: 'Milk',
              quantity: 1,
              unitPrice: 3,
              lineTotal: 3,
              priceStatus: 'priced',
              warnings: [],
            ),
            BasketOptimizedItem(
              inputText: 'eggs',
              canonicalName: 'Eggs',
              quantity: 1,
              unitPrice: 5,
              lineTotal: 5,
              priceStatus: 'priced',
              warnings: [],
            ),
          ],
          warnings: [],
        ),
        warnings: [],
      ),
      explanation: BasketExplanation(
        headline: 'Best option: Lidl + Kaufland',
        summaryText: 'Split the basket to save EUR 4.00.',
        limitations: [
          BasketExplanationEntry(
            type: 'travel_not_included',
            message: 'Travel time is not included.',
          ),
          BasketExplanationEntry(
            type: 'availability_not_guaranteed',
            message: 'Availability is not guaranteed.',
          ),
        ],
        itemNotes: [],
      ),
    );
  }

  static WatchlistPriceViewResponse _defaultWatchlistPriceResponse() {
    return const WatchlistPriceViewResponse(
      currency: 'EUR',
      total: 2,
      items: [
        WatchlistPriceItem(
          watchId: 'wl_coffee',
          canonicalProductId: 'cp_coffee',
          label: 'Coffee',
          targetPrice: 3,
          product: WatchlistProductSummary(
            canonicalProductId: 'cp_coffee',
            canonicalName: 'Ground coffee',
          ),
          price: WatchlistPriceInfo(
            priceStatus: 'priced',
            bestPrice: ProductBestPrice(
              price: 2.49,
              currency: 'EUR',
              chainName: 'Store A',
              comparisonBasis: 'per_kg',
              pricePerComparisonBasis: 9.96,
            ),
          ),
          deal: ProductDealInfo(
            dealLevel: 'good',
            dealScore: 0.82,
            reason: 'below recent average',
            targetHit: true,
          ),
        ),
        WatchlistPriceItem(
          watchId: 'wl_tea',
          canonicalProductId: 'cp_tea',
          label: 'Tea',
          targetPrice: null,
          product: WatchlistProductSummary(
            canonicalProductId: 'cp_tea',
            canonicalName: 'Black tea',
          ),
          price: WatchlistPriceInfo(
            priceStatus: 'missing',
            bestPrice: null,
          ),
          deal: ProductDealInfo(
            dealLevel: 'normal',
            dealScore: null,
            reason: '',
            targetHit: false,
          ),
        ),
      ],
    );
  }

  static SavedListsResponse _defaultSavedListsResponse() {
    return const SavedListsResponse(
      total: 2,
      lists: [
        SavedListSummary(
          listId: 'sl_weekly',
          name: 'Weekly groceries',
          itemCount: 3,
          createdAt: null,
          updatedAt: null,
        ),
        SavedListSummary(
          listId: 'sl_party',
          name: 'Party snacks',
          itemCount: 2,
          createdAt: null,
          updatedAt: null,
        ),
      ],
    );
  }

  static SavedListDetail _defaultSavedListDetail() {
    return const SavedListDetail(
      listId: 'sl_weekly',
      name: 'Weekly groceries',
      items: ['milk', 'eggs', 'bread'],
      createdAt: null,
      updatedAt: null,
    );
  }

  static SavedUserLocationsResponse _defaultSavedUserLocationsResponse() {
    return const SavedUserLocationsResponse(
      total: 2,
      locations: [
        SavedUserLocation(
          locationId: 'loc_home',
          userId: 'anon-test',
          label: 'home',
          displayName: 'Home',
          addressRaw: 'Sofia center',
          latitude: 42.6977,
          longitude: 23.3219,
          defaultRadiusKm: 3,
          defaultSort: 'nearest',
          source: 'manual',
          isDefault: true,
        ),
        SavedUserLocation(
          locationId: 'loc_work',
          userId: 'anon-test',
          label: 'work',
          displayName: 'Work',
          addressRaw: 'Business park',
          latitude: 42.65,
          longitude: 23.38,
          defaultRadiusKm: 5,
          defaultSort: 'cheapest',
          source: 'manual',
          isDefault: false,
        ),
      ],
    );
  }

  static NearestAvailabilityResponse _defaultNearestAvailabilityResponse() {
    return const NearestAvailabilityResponse(
      status: 'matched',
      resultCount: 1,
      location: {'saved_location_id': 'loc_home'},
      productName: 'Fresh milk',
      offers: [
        NearestAvailabilityOffer(
          storeNameRaw: 'Fresh Market Sofia',
          formattedAddress: 'Vitosha Boulevard 24',
          distanceKm: 0.8,
          effectivePrice: 1.69,
          currency: 'EUR',
        ),
      ],
    );
  }

  static ManualAddressGeocodeResponse _defaultManualAddressGeocodeResponse() {
    return const ManualAddressGeocodeResponse(
      status: 'matched',
      cacheHit: false,
      geocode: ManualAddressGeocode(
        geocodeId: 'manual_geo_vitosha_24',
        provider: 'fake',
        providerPlaceId: 'fake-vitosha-24',
        queryText: 'BG, Vitosha Boulevard 24',
        formattedAddress: 'Vitosha Boulevard 24, Sofia, Bulgaria',
        latitude: 42.695,
        longitude: 23.321,
        confidence: 0.9,
        confidenceReason: 'fake_match',
        status: 'matched',
        provenance: {
          'source': 'manual_address',
          'address_raw': 'Vitosha Boulevard 24',
        },
      ),
    );
  }

  @override
  Future<HomeSummary> getHomeSummary({
    required String ownerId,
    String ownerType = 'anonymous',
  }) async {
    homeSummaryCalls += 1;
    lastHomeSummaryOwnerId = ownerId;
    lastHomeSummaryOwnerType = ownerType;
    if (failHomeSummary) {
      failHomeSummary = false;
      throw QueryApiException('home summary failed');
    }
    final pending = homeSummaryCompleter;
    if (pending != null) {
      homeSummaryCompleter = null;
      return pending.future;
    }
    return homeSummary;
  }

  @override
  Future<ProductSearchResponse> searchProducts({
    required String query,
    int limit = 25,
    int offset = 0,
  }) async {
    productSearchCalls += 1;
    lastProductSearchQuery = query;
    lastProductSearchLimit = limit;
    lastProductSearchOffset = offset;
    if (failProductSearch) {
      failProductSearch = false;
      throw QueryApiException('product search failed');
    }
    return productSearchResponse;
  }

  @override
  Future<SavedUserLocationsResponse> getSavedUserLocations({
    required String ownerId,
    String ownerType = 'anonymous',
  }) async {
    savedUserLocationsCalls += 1;
    return savedUserLocationsResponse;
  }

  @override
  Future<NearestAvailabilityResponse> getNearestAvailability({
    required String ownerId,
    String ownerType = 'anonymous',
    String? canonicalProductId,
    String? query,
    double? latitude,
    double? longitude,
    String? savedLocationId,
    String? label,
    double? radiusKm,
    String sort = 'nearest',
    int limit = 10,
  }) async {
    nearestAvailabilityCalls += 1;
    lastNearestOwnerId = ownerId;
    lastNearestCanonicalProductId = canonicalProductId;
    lastNearestSavedLocationId = savedLocationId;
    lastNearestLabel = label;
    lastNearestLatitude = latitude;
    lastNearestLongitude = longitude;
    lastNearestRadiusKm = radiusKm;
    lastNearestSort = sort;
    return nearestAvailabilityResponse;
  }

  @override
  Future<ManualAddressGeocodeResponse> geocodeManualAddress({
    required String ownerId,
    String ownerType = 'anonymous',
    required String addressRaw,
    String? city,
    String country = 'BG',
    String? displayName,
  }) async {
    manualAddressGeocodeCalls += 1;
    lastManualAddressGeocodeOwnerId = ownerId;
    lastManualAddressGeocodeAddressRaw = addressRaw;
    lastManualAddressGeocodeDisplayName = displayName;
    return manualAddressGeocodeResponse;
  }

  @override
  Future<SavedUserLocation> upsertSavedUserLocation({
    required String ownerId,
    String ownerType = 'anonymous',
    String? locationId,
    required String label,
    required String displayName,
    String? addressRaw,
    required double latitude,
    required double longitude,
    double defaultRadiusKm = 10,
    String defaultSort = 'nearest',
    String source = 'manual',
    bool isDefault = false,
    String? provider,
    String? providerPlaceId,
    String? formattedAddress,
    double? confidence,
    String? confidenceReason,
    Map<String, dynamic>? provenance,
  }) async {
    saveUserLocationCalls += 1;
    lastSavedUserLocationLabel = label;
    lastSavedUserLocationDisplayName = displayName;
    lastSavedUserLocationAddressRaw = addressRaw;
    lastSavedUserLocationLatitude = latitude;
    lastSavedUserLocationLongitude = longitude;
    lastSavedUserLocationSource = source;
    lastSavedUserLocationProvider = provider;
    lastSavedUserLocationProviderPlaceId = providerPlaceId;
    lastSavedUserLocationProvenance = provenance;
    return SavedUserLocation(
      locationId: locationId ?? 'saved_current_$label',
      userId: ownerId,
      label: label,
      displayName: displayName,
      addressRaw: addressRaw,
      latitude: latitude,
      longitude: longitude,
      defaultRadiusKm: defaultRadiusKm,
      defaultSort: defaultSort,
      source: source,
      isDefault: isDefault,
      provider: provider,
      providerPlaceId: providerPlaceId,
      formattedAddress: formattedAddress,
      confidence: confidence,
      confidenceReason: confidenceReason,
      provenance: provenance ?? const <String, dynamic>{},
    );
  }

  @override
  Future<BasketOptimizationResponse> optimizeBasket({
    required List<String> items,
    String strategy = 'multi_store',
    bool includeExplanation = true,
    bool includeConvenienceScoring = false,
  }) async {
    basketOptimizeCalls += 1;
    lastBasketOptimizeItems = items;
    lastBasketOptimizeStrategy = strategy;
    lastBasketIncludeExplanation = includeExplanation;
    lastBasketIncludeConvenienceScoring = includeConvenienceScoring;
    if (failBasketOptimize) {
      failBasketOptimize = false;
      throw QueryApiException('basket optimize failed');
    }
    final pending = basketOptimizationCompleter;
    if (pending != null) {
      basketOptimizationCompleter = null;
      return pending.future;
    }
    return basketOptimizationResponse;
  }

  @override
  Future<CanonicalProductDetail> getProductById(
      String canonicalProductId) async {
    productCalls += 1;
    lastProductId = canonicalProductId;
    if (productNotFound) {
      throw ProductNotFoundException(canonicalProductId);
    }
    if (failProduct) {
      throw QueryApiException('product failed');
    }
    return product;
  }

  @override
  Future<ProductDealCheckResult> checkProductDeals(
      List<String> canonicalProductIds) async {
    dealCheckCalls += 1;
    lastDealCheckIds = canonicalProductIds;
    if (failDealCheck) {
      throw QueryApiException('deal failed');
    }
    return dealCheckResult;
  }

  @override
  Future<WatchlistAddResult> addWatchlistItem({
    required String ownerId,
    String ownerType = 'anonymous',
    required String canonicalProductId,
    String? label,
  }) async {
    watchlistAddCalls += 1;
    lastWatchlistOwnerId = ownerId;
    lastWatchlistOwnerType = ownerType;
    lastWatchlistCanonicalProductId = canonicalProductId;
    lastWatchlistLabel = label;
    if (failWatchlistAdd) {
      throw QueryApiException('watchlist failed');
    }
    return WatchlistAddResult(
      watchId: 'wl_$canonicalProductId',
      canonicalProductId: canonicalProductId,
    );
  }

  @override
  Future<WatchlistPriceViewResponse> getWatchlistPrices({
    required String ownerId,
    String ownerType = 'anonymous',
  }) async {
    watchlistPriceCalls += 1;
    lastWatchlistPricesOwnerId = ownerId;
    lastWatchlistPricesOwnerType = ownerType;
    if (failWatchlistPrices) {
      failWatchlistPrices = false;
      throw QueryApiException('watchlist prices failed');
    }
    final pending = watchlistPriceCompleter;
    if (pending != null) {
      watchlistPriceCompleter = null;
      return pending.future;
    }
    return watchlistPriceResponse;
  }

  @override
  Future<SavedListsResponse> getSavedLists({
    required String ownerId,
    String ownerType = 'anonymous',
  }) async {
    savedListsCalls += 1;
    lastSavedListsOwnerId = ownerId;
    lastSavedListsOwnerType = ownerType;
    if (failSavedLists) {
      failSavedLists = false;
      throw QueryApiException('saved lists failed');
    }
    final pending = savedListsCompleter;
    if (pending != null) {
      savedListsCompleter = null;
      return pending.future;
    }
    return savedListsResponse;
  }

  @override
  Future<SavedListDetail> createSavedList({
    required String ownerId,
    String ownerType = 'anonymous',
    required String name,
    required List<String> items,
  }) async {
    savedListCreateCalls += 1;
    lastSavedListCreateOwnerId = ownerId;
    lastSavedListCreateOwnerType = ownerType;
    lastSavedListCreateName = name;
    lastSavedListCreateItems = items;
    if (failSavedListCreate) {
      failSavedListCreate = false;
      throw QueryApiException('saved list create failed');
    }
    return SavedListDetail(
      listId: 'sl_created',
      name: name,
      items: items,
      createdAt: null,
      updatedAt: null,
    );
  }

  @override
  Future<SavedListDetail> getSavedList({
    required String ownerId,
    String ownerType = 'anonymous',
    required String listId,
  }) async {
    savedListDetailCalls += 1;
    lastSavedListDetailOwnerId = ownerId;
    lastSavedListDetailOwnerType = ownerType;
    lastSavedListDetailId = listId;
    if (failSavedListDetail) {
      failSavedListDetail = false;
      throw QueryApiException('saved list detail failed');
    }
    return SavedListDetail(
      listId: listId,
      name: savedListDetail.name,
      items: savedListDetail.items,
      createdAt: savedListDetail.createdAt,
      updatedAt: savedListDetail.updatedAt,
    );
  }

  @override
  Future<SavedListDetail> updateSavedList({
    required String ownerId,
    String ownerType = 'anonymous',
    required String listId,
    required String name,
    required List<String> items,
  }) async {
    savedListUpdateCalls += 1;
    lastSavedListUpdateOwnerId = ownerId;
    lastSavedListUpdateOwnerType = ownerType;
    lastSavedListUpdateId = listId;
    lastSavedListUpdateName = name;
    lastSavedListUpdateItems = items;
    if (failSavedListUpdate) {
      failSavedListUpdate = false;
      throw QueryApiException('saved list update failed');
    }
    savedListDetail = SavedListDetail(
      listId: listId,
      name: name,
      items: items,
      createdAt: null,
      updatedAt: null,
    );
    return savedListDetail;
  }

  @override
  Future<void> deleteSavedList({
    required String ownerId,
    String ownerType = 'anonymous',
    required String listId,
  }) async {
    savedListDeleteCalls += 1;
    lastSavedListDeleteOwnerId = ownerId;
    lastSavedListDeleteOwnerType = ownerType;
    lastDeletedListId = listId;
    if (failSavedListDelete) {
      failSavedListDelete = false;
      throw QueryApiException('saved list delete failed');
    }
  }

  @override
  Future<void> removeWatchlistItem({
    required String ownerId,
    String ownerType = 'anonymous',
    required String watchId,
  }) async {
    watchlistRemoveCalls += 1;
    lastWatchlistRemoveOwnerId = ownerId;
    lastWatchlistRemoveOwnerType = ownerType;
    lastRemovedWatchId = watchId;
    if (failWatchlistRemove) {
      failWatchlistRemove = false;
      throw QueryApiException('watchlist remove failed');
    }
  }

  @override
  Future<QueryResponse> query(String query) async {
    if (query == 'broken') {
      throw QueryApiException('broken');
    }

    return const QueryResponse(
      parsedQuery: {'raw_query': 'milk'},
      filtersApplied: {},
      cheapestStore: 'Store A',
      totalCost: 1.60,
      items: [
        QueryResultItem(
          sourceProductId: 'milk-v',
          productNameRaw: 'milk',
          displayEn: 'Fresh milk Vereya 3% 1L',
          categoryCode: '6',
          productType: 'fresh_milk',
          productFamily: 'milk',
          brand: 'Vereya',
          storeNameRaw: 'Store A',
          locationCode: '1000',
          currentPrice: 1.60,
          retailPrice: 1.80,
          promoPrice: 1.60,
          matchScore: 0.95,
          matchReasons: ['exact_normalized_name'],
          historyAvgPrice: 1.75,
          storeCount: 1,
          rankScore: 1.2,
        ),
      ],
    );
  }

  @override
  Future<List<ProductHistoryPoint>> getProductHistory(
      String sourceProductId) async {
    return const [
      ProductHistoryPoint(
        date: '2026-04-21',
        priceAvg: 1.70,
        priceMin: 1.65,
        priceMax: 1.80,
        storeCount: 1,
        snapshotCount: 1,
      ),
      ProductHistoryPoint(
        date: '2026-04-22',
        priceAvg: 1.75,
        priceMin: 1.70,
        priceMax: 1.85,
        storeCount: 1,
        snapshotCount: 1,
      ),
    ];
  }
}

class FakeVoiceInputService implements VoiceInputService {
  @override
  Future<String?> captureOnce() async => 'milk';
}

class FakeSubscriptionService implements SubscriptionService {
  FakeSubscriptionService({
    required this.profile,
    this.configured = true,
    this.packages = const [
      MonetizationPackage(
        identifier: 'monthly',
        title: 'Premium monthly',
        description: 'Unlock all premium savings features.',
        priceLabel: '\$4.99',
        storeProductId: 'premium_monthly',
        packageType: 'monthly',
      ),
    ],
  });

  MonetizationProfile profile;
  final bool configured;
  final List<MonetizationPackage> packages;

  @override
  bool get isConfigured => configured;

  @override
  Future<void> initialize({required String appUserId}) async {}

  @override
  Future<List<MonetizationPackage>> loadPackages() async => packages;

  @override
  Future<MonetizationProfile> purchasePackage({
    required String userId,
    required MonetizationPackage package,
  }) async {
    profile = MonetizationProfile(
      userId: userId,
      tier: 'premium',
      premiumActive: true,
      adsEnabled: false,
      alertsEnabled: true,
      optimizerMultiStoreEnabled: true,
      maxOptimizerItems: 25,
      maxWatchlistItems: 250,
      maxTargetPriceAlerts: 250,
      revenuecatProductId: package.storeProductId,
      entitlementStatus: 'active',
      entitlementSource: 'test',
    );
    return profile;
  }

  @override
  Future<MonetizationProfile> refreshProfile({required String userId}) async =>
      profile;

  @override
  Future<MonetizationProfile> restorePurchases(
          {required String userId}) async =>
      profile;
}

class FakeAdService implements AppAdService {
  int interstitialCount = 0;

  @override
  bool get isConfigured => true;

  @override
  Widget bannerSlot({
    Key? key,
    required bool enabled,
  }) {
    if (!enabled) {
      return const SizedBox.shrink();
    }

    return SizedBox(
      key: key,
      height: 24,
      child: const Text('Test Ad'),
    );
  }

  @override
  Future<void> initialize() async {}

  @override
  Future<void> maybeShowInterstitial({
    required bool enabled,
    String placement = 'default',
  }) async {
    if (enabled) {
      interstitialCount += 1;
    }
  }
}

class FakeCurrentLocationService implements CurrentLocationService {
  FakeCurrentLocationService(this.result);

  CurrentLocationResult result;
  int requestCount = 0;

  @override
  Future<CurrentLocationResult> requestCurrentLocation() async {
    requestCount += 1;
    return result;
  }
}

void main() {
  AppDependencies buildDependencies({
    MonetizationProfile? profile,
    bool subscriptionConfigured = true,
    QueryApiClient? apiClient,
    CurrentLocationService? currentLocationService,
  }) {
    final userId = 'anon-test';
    final initialProfile = profile ?? MonetizationProfile.free(userId);
    final billingRepository = InMemoryMonetizationProfileRepository(
      anonymousUserId: userId,
    );
    final subscriptionService = FakeSubscriptionService(
      profile: initialProfile,
      configured: subscriptionConfigured,
    );
    final monetizationService = MonetizationService(
      userId: userId,
      repository: billingRepository,
      subscriptionService: subscriptionService,
    );
    billingRepository.saveProfile(initialProfile);

    return AppDependencies(
      anonymousUserId: userId,
      apiClient: apiClient ?? FakeApiClient(),
      shoppingListsRepository: InMemoryShoppingListsRepository(),
      watchlistRepository: InMemoryWatchlistRepository(),
      monetizationProfileRepository: billingRepository,
      monetizationService: monetizationService,
      adService: FakeAdService(),
      voiceInputService: FakeVoiceInputService(),
      recentActivityService: InMemoryRecentActivityService(),
      currentLocationService: currentLocationService ??
          FakeCurrentLocationService(
            const CurrentLocationResult(
              status: CurrentLocationStatus.locationUnavailable,
            ),
          ),
      firestoreConfigured: false,
      firestoreStatus: 'Test mode',
      subscriptionConfigured: subscriptionConfigured,
      admobConfigured: true,
    );
  }

  testWidgets('english rendering shows localized app shell', (tester) async {
    final dependencies = buildDependencies();
    await dependencies.recentActivityService.rememberSearch('cheap milk');

    await tester.pumpWidget(
      PricerApp(
        dependencies: dependencies,
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('daily-insight-card')), findsOneWidget);
    await tester.scrollUntilVisible(
      find.byKey(const Key('search-input')),
      200,
      scrollable: find.byType(Scrollable).first,
    );

    expect(find.text('Search'), findsOneWidget);
    expect(find.text('Search products or add to basket...'), findsOneWidget);
  });

  testWidgets('bulgarian rendering shows localized app shell', (tester) async {
    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(),
        locale: const Locale('bg'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('daily-insight-card')), findsOneWidget);
    await tester.scrollUntilVisible(
      find.byKey(const Key('search-input')),
      200,
      scrollable: find.byType(Scrollable).first,
    );

    expect(find.text('Search'), findsNothing);
    expect(find.text('Search products or add to basket...'), findsOneWidget);
    expect(find.byKey(const Key('search-input')), findsOneWidget);
  });

  testWidgets('unsupported locale falls back safely to english',
      (tester) async {
    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(),
        locale: const Locale('de'),
      ),
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(const Key('search-input')),
      200,
      scrollable: find.byType(Scrollable).first,
    );

    expect(find.text('Search'), findsOneWidget);
    expect(find.text('Search products or add to basket...'), findsOneWidget);
  });

  testWidgets('home search input renders at the top', (tester) async {
    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('home-search-entry-card')), findsOneWidget);
    expect(find.byKey(const Key('search-input')), findsOneWidget);
    expect(find.text('Search products or add to basket...'), findsOneWidget);
    expect(find.byKey(const Key('add-basket-button')), findsOneWidget);
  });

  testWidgets('home search enter navigates to search route', (tester) async {
    final apiClient = FakeApiClient();
    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('search-input')), 'milk');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('route-search-screen')), findsOneWidget);
    expect(apiClient.lastProductSearchQuery, 'milk');
    expect(find.byKey(const Key('product-search-screen')), findsOneWidget);
    expect(find.text('Fresh milk'), findsOneWidget);
  });

  testWidgets('home add-to-basket parses draft items and navigates',
      (tester) async {
    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('search-input')),
      'milk, eggs, bread',
    );
    await tester.tap(find.byKey(const Key('add-basket-button')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('route-optimize-screen')), findsOneWidget);
    final input =
        tester.widget<TextField>(find.byKey(const Key('basket-input-field')));
    expect(input.controller?.text, 'milk\neggs\nbread');
  });

  testWidgets('home search empty input does nothing safely', (tester) async {
    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('search-button')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('home-search-entry-card')), findsOneWidget);
    expect(find.byKey(const Key('route-search-screen')), findsNothing);

    await tester.tap(find.byKey(const Key('add-basket-button')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('route-optimize-screen')), findsNothing);
  });

  testWidgets('optimize route without args shows empty basket state',
      (tester) async {
    final apiClient = FakeApiClient();

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.optimize);
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('route-optimize-screen')), findsOneWidget);
    expect(find.byKey(const Key('basket-empty-state')), findsOneWidget);
    expect(find.byKey(const Key('basket-input-field')), findsOneWidget);
    expect(apiClient.basketOptimizeCalls, 0);
  });

  testWidgets('optimize route draft items render in input', (tester) async {
    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: FakeApiClient()),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.optimize, arguments: {
      'items': ['milk', '10 eggs'],
    });
    await tester.pumpAndSettle();

    final input =
        tester.widget<TextField>(find.byKey(const Key('basket-input-field')));
    expect(input.controller?.text, 'milk\n10 eggs');
  });

  testWidgets('optimize button calls API and renders basket result',
      (tester) async {
    final apiClient = FakeApiClient();

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.optimize, arguments: {
      'items': ['milk', 'eggs'],
    });
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('basket-optimize-button')));
    await tester.pumpAndSettle();

    expect(apiClient.basketOptimizeCalls, 1);
    expect(apiClient.lastBasketOptimizeItems, ['milk', 'eggs']);
    expect(apiClient.lastBasketOptimizeStrategy, 'multi_store');
    expect(apiClient.lastBasketIncludeExplanation, isTrue);
    expect(apiClient.lastBasketIncludeConvenienceScoring, isFalse);
    expect(find.byKey(const Key('basket-summary-card')), findsOneWidget);
    expect(find.text('EUR 8.00'), findsOneWidget);
    await tester.drag(
      find.byKey(const Key('optimize-basket-screen')),
      const Offset(0, -500),
    );
    await tester.pumpAndSettle();
    expect(find.text('Lidl'), findsOneWidget);
    expect(find.text('Kaufland'), findsOneWidget);
    await tester.drag(
      find.byKey(const Key('optimize-basket-screen')),
      const Offset(0, -500),
    );
    await tester.pumpAndSettle();
    expect(find.text('Best option: Lidl + Kaufland'), findsOneWidget);
  });

  testWidgets('optimize shows loading while API is pending', (tester) async {
    final completer = Completer<BasketOptimizationResponse>();
    final apiClient = FakeApiClient(basketOptimizationCompleter: completer);

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.optimize, arguments: {
      'items': ['milk'],
    });
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('basket-optimize-button')));
    await tester.pump();

    expect(find.byKey(const Key('basket-loading-state')), findsOneWidget);

    completer.complete(apiClient.basketOptimizationResponse);
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('basket-summary-card')), findsOneWidget);
  });

  testWidgets('optimize API error shows retry', (tester) async {
    final apiClient = FakeApiClient(failBasketOptimize: true);

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.optimize, arguments: {
      'items': ['milk'],
    });
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('basket-optimize-button')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('basket-error-state')), findsOneWidget);

    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();

    expect(apiClient.basketOptimizeCalls, 2);
    expect(find.byKey(const Key('basket-summary-card')), findsOneWidget);
  });

  testWidgets('optimize strategy toggle changes request', (tester) async {
    final apiClient = FakeApiClient();

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.optimize, arguments: {
      'items': ['milk'],
    });
    await tester.pumpAndSettle();

    await tester.tap(find.text('Best single store'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('basket-optimize-button')));
    await tester.pumpAndSettle();

    expect(apiClient.lastBasketOptimizeStrategy, 'single_store');
  });

  testWidgets('optimize screen hides internal metrics', (tester) async {
    final apiClient = FakeApiClient();

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.optimize, arguments: {
      'items': ['milk'],
    });
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('basket-optimize-button')));
    await tester.pumpAndSettle();

    expect(find.textContaining('score_total'), findsNothing);
    expect(find.textContaining('raw metrics'), findsNothing);
    expect(find.textContaining('debug'), findsNothing);
  });

  testWidgets('search route without query shows safe empty state',
      (tester) async {
    final apiClient = FakeApiClient();

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.search);
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('route-search-screen')), findsOneWidget);
    expect(find.byKey(const Key('product-search-empty-query')), findsOneWidget);
    expect(find.byKey(const Key('product-search-input')), findsOneWidget);
    expect(apiClient.productSearchCalls, 0);
  });

  testWidgets('search initial query fetches and renders product results',
      (tester) async {
    final apiClient = FakeApiClient();

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.search, arguments: {'query': 'milk'});
    await tester.pumpAndSettle();

    expect(apiClient.lastProductSearchQuery, 'milk');
    expect(apiClient.lastProductSearchLimit, 25);
    expect(apiClient.lastProductSearchOffset, 0);
    expect(find.text('Fresh milk'), findsOneWidget);
    expect(find.textContaining('grocery / dairy'), findsOneWidget);
    expect(find.textContaining('Brand: Vereya'), findsOneWidget);
    expect(find.text('Good deal'), findsOneWidget);
    expect(find.textContaining('/L'), findsOneWidget);
  });

  testWidgets('search result hides missing unit price without n/a',
      (tester) async {
    final apiClient = FakeApiClient(
      productSearchResponse: const ProductSearchResponse(
        layerMode: 'canonical_with_enrichment',
        total: 1,
        limit: 25,
        offset: 0,
        results: [
          ProductSearchResult(
            canonicalProductId: 'cp_no_unit',
            canonicalName: 'Packaged tea',
            markers: {},
            enrichment: ProductEnrichment(
              categoryL1: 'grocery',
              categoryL2: 'tea',
              categoryL3: null,
              categoryL4: null,
              brand: null,
              baseProduct: 'tea',
              productLine: null,
              flavor: [],
              attributes: [],
              dietTags: [],
              allergens: [],
              productForm: null,
              packaging: null,
              usageContext: [],
              qualityTier: null,
            ),
            bestPrice: ProductBestPrice(
              price: 3.40,
              currency: 'EUR',
            ),
          ),
        ],
      ),
    );

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.search, arguments: {'query': 'tea'});
    await tester.pumpAndSettle();

    expect(find.text('Packaged tea'), findsOneWidget);
    expect(find.textContaining('n/a'), findsNothing);
    expect(find.textContaining('/kg'), findsNothing);
    expect(find.textContaining('/L'), findsNothing);
  });

  testWidgets('search result tap navigates to product route', (tester) async {
    final apiClient = FakeApiClient();

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.search, arguments: {'query': 'milk'});
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('product-search-result-cp_milk')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('route-product-screen')), findsOneWidget);
    expect(apiClient.lastProductId, 'cp_milk');
  });

  testWidgets('search API error shows retry', (tester) async {
    final apiClient = FakeApiClient(failProductSearch: true);

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.search, arguments: {'query': 'milk'});
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('product-search-error')), findsOneWidget);

    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();

    expect(apiClient.productSearchCalls, 2);
    expect(find.text('Fresh milk'), findsOneWidget);
  });

  testWidgets('search empty results shows friendly empty state',
      (tester) async {
    final apiClient = FakeApiClient(
      productSearchResponse: const ProductSearchResponse(
        layerMode: 'canonical_with_enrichment',
        total: 0,
        limit: 25,
        offset: 0,
        results: [],
      ),
    );

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.search, arguments: {'query': 'zzzz'});
    await tester.pumpAndSettle();

    expect(
        find.byKey(const Key('product-search-empty-results')), findsOneWidget);
    expect(find.textContaining('No products matched'), findsOneWidget);
  });

  testWidgets('search in-screen re-search updates query and results',
      (tester) async {
    final apiClient = FakeApiClient();

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.search, arguments: {'query': 'milk'});
    await tester.pumpAndSettle();

    apiClient.productSearchResponse = const ProductSearchResponse(
      layerMode: 'canonical_with_enrichment',
      total: 1,
      limit: 25,
      offset: 0,
      results: [
        ProductSearchResult(
          canonicalProductId: 'cp_coffee',
          canonicalName: 'Coffee',
          markers: {},
          enrichment: ProductEnrichment(
            categoryL1: 'grocery',
            categoryL2: 'coffee',
            categoryL3: null,
            categoryL4: null,
            brand: 'Test Brand',
            baseProduct: 'coffee',
            productLine: null,
            flavor: [],
            attributes: [],
            dietTags: [],
            allergens: [],
            productForm: null,
            packaging: null,
            usageContext: [],
            qualityTier: null,
          ),
        ),
      ],
    );

    await tester.enterText(
      find.byKey(const Key('product-search-input')),
      'coffee',
    );
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();

    expect(apiClient.lastProductSearchQuery, 'coffee');
    expect(find.text('Coffee'), findsOneWidget);
    expect(find.text('Fresh milk'), findsNothing);
  });

  testWidgets('search nearest availability uses saved location selector',
      (tester) async {
    final apiClient = FakeApiClient();

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.search, arguments: {'query': 'milk'});
    await tester.pumpAndSettle();

    expect(
        find.byKey(const Key('nearest-availability-controls')), findsOneWidget);
    await tester.tap(find.byKey(const Key('location-mode-home')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('nearest-button-cp_milk')));
    await tester.pumpAndSettle();

    expect(apiClient.savedUserLocationsCalls, greaterThanOrEqualTo(1));
    expect(apiClient.nearestAvailabilityCalls, 1);
    expect(apiClient.lastNearestOwnerId, 'anon-test');
    expect(apiClient.lastNearestCanonicalProductId, 'cp_milk');
    expect(apiClient.lastNearestSavedLocationId, 'loc_home');
    await tester.scrollUntilVisible(
      find.byKey(const Key('nearest-availability-results')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(
        find.byKey(const Key('nearest-availability-results')), findsOneWidget);
    expect(find.text('Fresh Market Sofia'), findsOneWidget);
  });

  testWidgets('manual nearest availability validates coordinates',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final apiClient = FakeApiClient();

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.search, arguments: {'query': 'milk'});
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('manual-latitude-input')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(
      find.byKey(const Key('manual-latitude-input')),
      '91',
    );
    await tester.scrollUntilVisible(
      find.byKey(const Key('nearest-button-cp_milk')),
      -200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.byKey(const Key('nearest-button-cp_milk')));
    await tester.pumpAndSettle();

    expect(apiClient.nearestAvailabilityCalls, 0);
    await tester.scrollUntilVisible(
      find.byKey(const Key('nearest-availability-validation')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(
      find.byKey(const Key('nearest-availability-validation')),
      findsOneWidget,
    );
    expect(
        find.text('Latitude must be a number from -90 to 90.'), findsOneWidget);
  });

  testWidgets('manual raw address field is displayed but not geocoded',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final apiClient = FakeApiClient();

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.search, arguments: {'query': 'milk'});
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('manual-location-display-name-input')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(
      find.byKey(const Key('manual-location-display-name-input')),
      findsOneWidget,
    );
    expect(
      find.byKey(const Key('manual-location-address-input')),
      findsOneWidget,
    );
    await tester.enterText(
      find.byKey(const Key('manual-location-display-name-input')),
      'School pickup',
    );
    await tester.enterText(
      find.byKey(const Key('manual-location-address-input')),
      'Sofia, bul. Vitosha 24',
    );
    await tester.scrollUntilVisible(
      find.byKey(const Key('nearest-button-cp_milk')),
      -200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.byKey(const Key('nearest-button-cp_milk')));
    await tester.pumpAndSettle();

    expect(apiClient.nearestAvailabilityCalls, 1);
    expect(apiClient.lastNearestSavedLocationId, isNull);
    expect(apiClient.lastNearestLabel, isNull);
    expect(apiClient.lastNearestLatitude, 42.6977);
    expect(apiClient.lastNearestLongitude, 23.3219);
  });

  testWidgets('nearby radius and sort controls are applied', (tester) async {
    tester.view.physicalSize = const Size(800, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final apiClient = FakeApiClient();

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.search, arguments: {'query': 'milk'});
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('nearest-radius-selector')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.byKey(const Key('nearest-radius-selector')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('5 km').last);
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('nearest-sort-dropdown')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cheapest').last);
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('nearest-button-cp_milk')),
      -200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.byKey(const Key('nearest-button-cp_milk')));
    await tester.pumpAndSettle();

    expect(apiClient.nearestAvailabilityCalls, 1);
    expect(apiClient.lastNearestRadiusKm, 5);
    expect(apiClient.lastNearestSort, 'cheapest');
  });

  testWidgets('nearby panel shows no saved locations state', (tester) async {
    final apiClient = FakeApiClient(
      savedUserLocationsResponse: const SavedUserLocationsResponse(
        locations: <SavedUserLocation>[],
        total: 0,
      ),
    );

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.search, arguments: {'query': 'milk'});
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('location-mode-home')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.byKey(const Key('location-mode-home')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('no-saved-locations-state')), findsOneWidget);

    await tester.scrollUntilVisible(
      find.byKey(const Key('nearest-button-cp_milk')),
      -200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.byKey(const Key('nearest-button-cp_milk')));
    await tester.pumpAndSettle();

    expect(apiClient.nearestAvailabilityCalls, 0);
    await tester.scrollUntilVisible(
      find.byKey(const Key('nearest-availability-validation')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(
      find.text(
          'No saved locations yet. Use Manual coordinates for this search.'),
      findsOneWidget,
    );
  });

  testWidgets('current location button is visible without automatic request',
      (tester) async {
    final locationService = FakeCurrentLocationService(
      const CurrentLocationResult(
        status: CurrentLocationStatus.acquired,
        latitude: 42.7,
        longitude: 23.3,
      ),
    );

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(
          apiClient: FakeApiClient(),
          currentLocationService: locationService,
        ),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.search, arguments: {'query': 'milk'});
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('current-location-button')),
      200,
      scrollable: find.byType(Scrollable).first,
    );

    expect(find.byKey(const Key('current-location-button')), findsOneWidget);
    expect(locationService.requestCount, 0);
  });

  testWidgets('current location permission denied state is shown',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final locationService = FakeCurrentLocationService(
      const CurrentLocationResult(
        status: CurrentLocationStatus.permissionDenied,
      ),
    );

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(
          apiClient: FakeApiClient(),
          currentLocationService: locationService,
        ),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.search, arguments: {'query': 'milk'});
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('current-location-button')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.byKey(const Key('current-location-button')));
    await tester.pumpAndSettle();

    expect(locationService.requestCount, 1);
    expect(
      find.byKey(const Key('current-location-permission-denied')),
      findsOneWidget,
    );
  });

  testWidgets('current location coordinates feed nearest search',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final apiClient = FakeApiClient();
    final locationService = FakeCurrentLocationService(
      const CurrentLocationResult(
        status: CurrentLocationStatus.acquired,
        latitude: 42.711111,
        longitude: 23.322222,
      ),
    );

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(
          apiClient: apiClient,
          currentLocationService: locationService,
        ),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.search, arguments: {'query': 'milk'});
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('current-location-button')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.byKey(const Key('current-location-button')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('current-location-acquired')), findsOneWidget);
    expect(find.byKey(const Key('save-current-location-home')), findsOneWidget);
    expect(find.byKey(const Key('save-current-location-work')), findsOneWidget);
    expect(
        find.byKey(const Key('save-current-location-custom')), findsOneWidget);

    await tester.scrollUntilVisible(
      find.byKey(const Key('nearest-button-cp_milk')),
      -200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.byKey(const Key('nearest-button-cp_milk')));
    await tester.pumpAndSettle();

    expect(apiClient.nearestAvailabilityCalls, 1);
    expect(apiClient.lastNearestLatitude, 42.711111);
    expect(apiClient.lastNearestLongitude, 23.322222);
    expect(apiClient.lastNearestSavedLocationId, isNull);
  });

  testWidgets('current location can be saved explicitly as custom',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final apiClient = FakeApiClient();
    final locationService = FakeCurrentLocationService(
      const CurrentLocationResult(
        status: CurrentLocationStatus.acquired,
        latitude: 42.72,
        longitude: 23.34,
      ),
    );

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(
          apiClient: apiClient,
          currentLocationService: locationService,
        ),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.search, arguments: {'query': 'milk'});
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('current-location-button')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(
      find.byKey(const Key('manual-location-display-name-input')),
      'Gym',
    );
    await tester.tap(find.byKey(const Key('current-location-button')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('save-current-location-custom')));
    await tester.pumpAndSettle();

    expect(apiClient.saveUserLocationCalls, 1);
    expect(apiClient.lastSavedUserLocationLabel, 'custom');
    expect(apiClient.lastSavedUserLocationDisplayName, 'Gym');
    expect(apiClient.lastSavedUserLocationLatitude, 42.72);
    expect(apiClient.lastSavedUserLocationLongitude, 23.34);
    expect(apiClient.lastSavedUserLocationSource, 'device');
  });

  testWidgets('manual address is not geocoded before explicit button tap',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final apiClient = FakeApiClient();

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.search, arguments: {'query': 'milk'});
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('manual-location-address-input')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(
      find.byKey(const Key('manual-location-address-input')),
      'Vitosha Boulevard 24',
    );
    await tester.pumpAndSettle();

    expect(apiClient.manualAddressGeocodeCalls, 0);

    await tester.tap(find.byKey(const Key('manual-address-geocode-button')));
    await tester.pumpAndSettle();

    expect(apiClient.manualAddressGeocodeCalls, 1);
    expect(
        apiClient.lastManualAddressGeocodeAddressRaw, 'Vitosha Boulevard 24');
  });

  testWidgets('matched manual address requires confirmation before applying',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final apiClient = FakeApiClient();

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.search, arguments: {'query': 'milk'});
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('manual-location-address-input')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(
      find.byKey(const Key('manual-location-address-input')),
      'Vitosha Boulevard 24',
    );
    await tester.tap(find.byKey(const Key('manual-address-geocode-button')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('manual-address-geocode-matched')),
        findsOneWidget);
    expect(
      tester
          .widget<TextField>(find.byKey(const Key('manual-latitude-input')))
          .controller
          ?.text,
      '42.6977',
    );

    await tester.tap(find.byKey(const Key('manual-address-geocode-confirm')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('manual-address-geocode-confirmed')),
        findsOneWidget);
    expect(
      tester
          .widget<TextField>(find.byKey(const Key('manual-latitude-input')))
          .controller
          ?.text,
      '42.695000',
    );
  });

  testWidgets('ambiguous manual address does not auto-apply coordinates',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final apiClient = FakeApiClient(
      manualAddressGeocodeResponse: const ManualAddressGeocodeResponse(
        status: 'ambiguous',
        cacheHit: false,
        geocode: ManualAddressGeocode(
          geocodeId: 'manual_geo_ambiguous',
          provider: 'fake',
          queryText: 'BG, Sofia Center',
          status: 'ambiguous',
          provenance: {'source': 'manual_address'},
        ),
      ),
    );

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.search, arguments: {'query': 'milk'});
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('manual-location-address-input')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(
      find.byKey(const Key('manual-location-address-input')),
      'Sofia Center',
    );
    await tester.tap(find.byKey(const Key('manual-address-geocode-button')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('manual-address-geocode-ambiguous')),
        findsOneWidget);
    expect(
        find.byKey(const Key('manual-address-geocode-confirm')), findsNothing);
    expect(
      tester
          .widget<TextField>(find.byKey(const Key('manual-latitude-input')))
          .controller
          ?.text,
      '42.6977',
    );
  });

  testWidgets('failed manual address geocode state is shown', (tester) async {
    tester.view.physicalSize = const Size(800, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final apiClient = FakeApiClient(
      manualAddressGeocodeResponse: const ManualAddressGeocodeResponse(
        status: 'failed',
        cacheHit: false,
        geocode: ManualAddressGeocode(
          geocodeId: 'manual_geo_failed',
          provider: 'fake',
          queryText: 'BG, Unknown address',
          status: 'failed',
          confidenceReason: 'no_provider_results',
          provenance: {'source': 'manual_address'},
        ),
      ),
    );

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.search, arguments: {'query': 'milk'});
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('manual-location-address-input')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(
      find.byKey(const Key('manual-location-address-input')),
      'Unknown address',
    );
    await tester.tap(find.byKey(const Key('manual-address-geocode-button')));
    await tester.pumpAndSettle();

    expect(
        find.byKey(const Key('manual-address-geocode-failed')), findsOneWidget);
  });

  testWidgets('confirmed manual address coordinates feed nearest request',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final apiClient = FakeApiClient();

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.search, arguments: {'query': 'milk'});
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('manual-location-address-input')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(
      find.byKey(const Key('manual-location-address-input')),
      'Vitosha Boulevard 24',
    );
    await tester.tap(find.byKey(const Key('manual-address-geocode-button')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('manual-address-geocode-confirm')));
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('nearest-button-cp_milk')),
      -200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.byKey(const Key('nearest-button-cp_milk')));
    await tester.pumpAndSettle();

    expect(apiClient.nearestAvailabilityCalls, 1);
    expect(apiClient.lastNearestLatitude, 42.695);
    expect(apiClient.lastNearestLongitude, 23.321);
  });

  testWidgets('confirmed manual address can be saved as custom',
      (tester) async {
    tester.view.physicalSize = const Size(800, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final apiClient = FakeApiClient();

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.search, arguments: {'query': 'milk'});
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('manual-location-address-input')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(
      find.byKey(const Key('manual-location-display-name-input')),
      'Gym',
    );
    await tester.enterText(
      find.byKey(const Key('manual-location-address-input')),
      'Vitosha Boulevard 24',
    );
    await tester.tap(find.byKey(const Key('manual-address-geocode-button')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('manual-address-geocode-confirm')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('save-geocoded-location-custom')));
    await tester.pumpAndSettle();

    expect(apiClient.saveUserLocationCalls, 1);
    expect(apiClient.lastSavedUserLocationLabel, 'custom');
    expect(apiClient.lastSavedUserLocationDisplayName, 'Gym');
    expect(apiClient.lastSavedUserLocationAddressRaw, 'Vitosha Boulevard 24');
    expect(apiClient.lastSavedUserLocationLatitude, 42.695);
    expect(apiClient.lastSavedUserLocationLongitude, 23.321);
    expect(apiClient.lastSavedUserLocationSource, 'geocoded');
    expect(apiClient.lastSavedUserLocationProvider, 'fake');
    expect(apiClient.lastSavedUserLocationProviderPlaceId, 'fake-vitosha-24');
    expect(apiClient.lastSavedUserLocationProvenance?['geocode_id'],
        'manual_geo_vitosha_24');
  });

  test('search response parser tolerates partial result payloads', () {
    final response = ProductSearchResponse.fromJson({
      'results': [
        {
          'canonical_product_id': 'cp_partial',
        }
      ],
    });

    expect(response.results.single.canonicalProductId, 'cp_partial');
    expect(response.results.single.displayName, 'cp_partial');
    expect(response.results.single.enrichment.categoryPath, isEmpty);
    expect(response.results.single.bestPrice, isNull);
    expect(response.results.single.deal, isNull);
  });

  test('search response parser reads unit prices and zero counts', () {
    final response = ProductSearchResponse.fromJson({
      'results': [
        {
          'canonical_product_id': 'cp_flour',
          'canonical_name': 'Flour',
          'current_offer_summary': {
            'min_current_price': 2.40,
            'currency': 'EUR',
            'current_offer_count': 0,
            'comparison_basis': 'per_kg',
            'price_per_comparison_basis': 2.40,
          },
        },
        {
          'canonical_product_id': 'cp_juice',
          'canonical_name': 'Juice',
          'current_offer_summary': {
            'min_current_price': 1.20,
            'currency': 'EUR',
            'price_normalization': {
              'comparison_basis': 'per_liter',
              'price_per_comparison_basis': 2.40,
            },
          },
        },
        {
          'canonical_product_id': 'cp_unknown',
          'canonical_name': 'Unknown pack',
          'current_offer_summary': {
            'min_current_price': 4.20,
            'currency': 'EUR',
            'comparison_basis': 'unknown',
            'price_per_comparison_basis': null,
          },
        },
      ],
    });

    expect(response.results[0].currentOfferSummary?.currentOfferCount, 0);
    expect(response.results[0].displayBestPrice?.comparisonBasis, 'per_kg');
    expect(response.results[0].displayBestPrice?.pricePerComparisonBasis, 2.40);
    expect(response.results[1].displayBestPrice?.comparisonBasis, 'per_liter');
    expect(response.results[1].displayBestPrice?.pricePerComparisonBasis, 2.40);
    expect(
        response.results[2].displayBestPrice?.pricePerComparisonBasis, isNull);
  });

  testWidgets('home summary shows loading then quick actions', (tester) async {
    final completer = Completer<HomeSummary>();
    final apiClient = FakeApiClient(homeSummaryCompleter: completer);

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pump();

    await tester.scrollUntilVisible(
      find.byKey(const Key('home-summary-loading')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.byKey(const Key('home-summary-loading')), findsOneWidget);

    completer.complete(HomeSummary.empty());
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(const Key('home-quick-actions-section')),
      200,
      scrollable: find.byType(Scrollable).first,
    );

    expect(apiClient.lastHomeSummaryOwnerId, 'anon-test');
    expect(apiClient.lastHomeSummaryOwnerType, 'anonymous');
    expect(find.byKey(const Key('home-summary-loading')), findsNothing);
    expect(find.byKey(const Key('home-quick-actions-section')), findsOneWidget);
  });

  testWidgets('home summary renders top deal cards', (tester) async {
    final apiClient = FakeApiClient(
      homeSummary: HomeSummary(
        topDeals: const [
          HomeDealCard(
            canonicalProductId: 'cp_coffee',
            canonicalName: 'Coffee',
            dealLevel: 'good',
            dealScore: 0.82,
            price: 2.49,
            currency: 'EUR',
            chainName: 'Store A',
          ),
        ],
        watchlistHighlights: const [],
        marketHighlights: const [],
        savedLists: const [],
        quickActions: HomeSummary.empty().quickActions,
        generatedAt: DateTime(2026, 4, 24),
      ),
    );

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('home-top-deals-section')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.byKey(const Key('home-top-deals-section')), findsOneWidget);
    expect(find.text('Coffee'), findsOneWidget);
    expect(find.textContaining('Good deal'), findsOneWidget);
  });

  testWidgets('home summary renders watchlist highlights and saved lists',
      (tester) async {
    final apiClient = FakeApiClient(
      homeSummary: HomeSummary(
        topDeals: const [],
        watchlistHighlights: const [
          HomeWatchlistHighlight(
            watchId: 'wl_1',
            label: 'Coffee',
            canonicalProductId: 'cp_coffee',
            highlightType: 'target_hit',
            message: 'Coffee is below your target price.',
          ),
        ],
        marketHighlights: const [],
        savedLists: const [
          HomeSavedListShortcut(
            listId: 'sl_1',
            name: 'Weekly groceries',
            itemCount: 8,
            action: 'optimize_saved_list',
          ),
        ],
        quickActions: HomeSummary.empty().quickActions,
        generatedAt: DateTime(2026, 4, 24),
      ),
    );

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('home-watchlist-section')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.byKey(const Key('home-watchlist-section')), findsOneWidget);
    expect(find.text('Coffee is below your target price.'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.byKey(const Key('home-saved-lists-section')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.byKey(const Key('home-saved-lists-section')), findsOneWidget);
    expect(find.text('Weekly groceries'), findsOneWidget);
    expect(find.text('8 items'), findsOneWidget);
  });

  testWidgets('home summary hides empty dynamic sections safely',
      (tester) async {
    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: FakeApiClient()),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('home-quick-actions-section')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.byKey(const Key('home-top-deals-section')), findsNothing);
    expect(find.byKey(const Key('home-watchlist-section')), findsNothing);
    expect(find.byKey(const Key('home-saved-lists-section')), findsNothing);
    expect(find.byKey(const Key('home-market-section')), findsNothing);
    expect(find.byKey(const Key('home-quick-actions-section')), findsOneWidget);
  });

  testWidgets('home summary error state retries', (tester) async {
    final apiClient = FakeApiClient(
      failHomeSummary: true,
      homeSummary: HomeSummary.empty(),
    );

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('home-summary-error')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.byKey(const Key('home-summary-error')), findsOneWidget);

    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();

    expect(apiClient.homeSummaryCalls, 2);
    expect(find.byKey(const Key('home-summary-error')), findsNothing);
    await tester.scrollUntilVisible(
      find.byKey(const Key('home-quick-actions-section')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.byKey(const Key('home-quick-actions-section')), findsOneWidget);
  });

  test('home summary parser tolerates partial payloads', () {
    final summary = HomeSummary.fromJson({
      'top_deals': [
        {
          'canonical_product_id': 'cp_tea',
          'canonical_name': 'Tea',
        }
      ],
      'quick_actions': [
        {
          'type': 'search_product',
          'label': 'Search products',
        }
      ],
    });

    expect(summary.topDeals.single.canonicalName, 'Tea');
    expect(summary.watchlistHighlights, isEmpty);
    expect(summary.savedLists, isEmpty);
    expect(summary.marketHighlights, isEmpty);
    expect(summary.quickActions.single.type, 'search_product');
  });

  testWidgets('home quick actions navigate to named routes', (tester) async {
    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: FakeApiClient()),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.text('Optimize a basket'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Optimize a basket'));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('route-optimize-screen')), findsOneWidget);
    expect(find.byType(SnackBar), findsNothing);
  });

  testWidgets('home saved list card navigates to list detail', (tester) async {
    final apiClient = FakeApiClient(
      homeSummary: HomeSummary(
        topDeals: const [],
        watchlistHighlights: const [],
        marketHighlights: const [],
        savedLists: const [
          HomeSavedListShortcut(
            listId: 'sl_weekly',
            name: 'Weekly groceries',
            itemCount: 8,
            action: 'optimize_saved_list',
          ),
        ],
        quickActions: HomeSummary.empty().quickActions,
        generatedAt: DateTime(2026, 4, 24),
      ),
    );

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('home-saved-list-sl_weekly')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    final savedListCenter =
        tester.getCenter(find.byKey(const Key('home-saved-list-sl_weekly')));
    await tester.tapAt(Offset(savedListCenter.dx, 480));
    await tester.pumpAndSettle();

    expect(find.text('Weekly groceries'), findsWidgets);
  });

  testWidgets('home deal card navigates to product detail', (tester) async {
    final apiClient = FakeApiClient(
      homeSummary: HomeSummary(
        topDeals: const [
          HomeDealCard(
            canonicalProductId: 'cp_coffee',
            canonicalName: 'Coffee',
            dealLevel: 'good',
            dealScore: 0.82,
            price: 2.49,
            currency: 'EUR',
            chainName: 'Store A',
          ),
        ],
        watchlistHighlights: const [],
        marketHighlights: const [],
        savedLists: const [],
        quickActions: HomeSummary.empty().quickActions,
        generatedAt: DateTime(2026, 4, 24),
      ),
    );

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('home-deal-cp_coffee')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    final dealCenter =
        tester.getCenter(find.byKey(const Key('home-deal-cp_coffee')));
    await tester.tapAt(Offset(dealCenter.dx, 480));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('route-product-screen')), findsOneWidget);
    expect(find.byKey(const Key('product-detail-screen')), findsOneWidget);
    expect(find.text('Good deal'), findsOneWidget);
  });

  testWidgets('product route without args shows safe state', (tester) async {
    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: FakeApiClient()),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.product);
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('route-product-screen')), findsOneWidget);
    expect(find.text('No product selected'), findsOneWidget);
  });

  testWidgets('product detail loads and renders product fields',
      (tester) async {
    final apiClient = FakeApiClient();

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(
      AppRoutes.product,
      arguments: {'canonical_product_id': 'cp_coffee'},
    );
    await tester.pumpAndSettle();

    expect(apiClient.lastProductId, 'cp_coffee');
    expect(find.byKey(const Key('product-detail-screen')), findsOneWidget);
    expect(find.text('Coffee'), findsWidgets);
    expect(find.textContaining('grocery / coffee'), findsOneWidget);
    expect(find.text('Brand: Test Brand'), findsOneWidget);
    expect(find.text('Base product: coffee'), findsOneWidget);
  });

  testWidgets('product detail renders deal info when available',
      (tester) async {
    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: FakeApiClient()),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(
      AppRoutes.product,
      arguments: {'canonicalProductId': 'cp_coffee'},
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('product-deal-card')), findsOneWidget);
    expect(find.text('Good deal'), findsOneWidget);
    expect(find.textContaining('Store A'), findsOneWidget);
    expect(find.textContaining('/kg'), findsOneWidget);
  });

  testWidgets('product detail survives deal-check failure', (tester) async {
    await tester.pumpWidget(
      PricerApp(
        dependencies:
            buildDependencies(apiClient: FakeApiClient(failDealCheck: true)),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(
      AppRoutes.product,
      arguments: {'id': 'cp_coffee'},
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('product-detail-screen')), findsOneWidget);
    expect(find.text('Coffee'), findsWidgets);
    expect(find.text('Current price'), findsOneWidget);
    expect(find.text('Deal status unavailable.'), findsOneWidget);
  });

  testWidgets('product watchlist button calls client and shows success',
      (tester) async {
    final apiClient = FakeApiClient();

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(
      AppRoutes.product,
      arguments: {'canonical_product_id': 'cp_coffee'},
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('add-product-watchlist-button')));
    await tester.pumpAndSettle();

    expect(apiClient.watchlistAddCalls, 1);
    expect(apiClient.lastWatchlistOwnerId, 'anon-test');
    expect(apiClient.lastWatchlistOwnerType, 'anonymous');
    expect(apiClient.lastWatchlistCanonicalProductId, 'cp_coffee');
    expect(apiClient.lastWatchlistLabel, 'Coffee');
    expect(find.text('Added to watchlist.'), findsOneWidget);
  });

  testWidgets('product API error shows retry', (tester) async {
    final apiClient = FakeApiClient(failProduct: true);

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(
      AppRoutes.product,
      arguments: {'canonical_product_id': 'cp_coffee'},
    );
    await tester.pumpAndSettle();

    expect(
        find.text('We could not load this product right now.'), findsOneWidget);

    apiClient.failProduct = false;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();

    expect(apiClient.productCalls, 2);
    expect(find.byKey(const Key('product-detail-screen')), findsOneWidget);
  });

  testWidgets('home watchlist highlight navigates to watchlist',
      (tester) async {
    final apiClient = FakeApiClient(
      homeSummary: HomeSummary(
        topDeals: const [],
        watchlistHighlights: const [
          HomeWatchlistHighlight(
            watchId: 'wl_1',
            label: 'Coffee',
            canonicalProductId: 'cp_coffee',
            highlightType: 'target_hit',
            message: 'Coffee is below your target price.',
          ),
        ],
        marketHighlights: const [],
        savedLists: const [],
        quickActions: HomeSummary.empty().quickActions,
        generatedAt: DateTime(2026, 4, 24),
      ),
    );

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const Key('home-watch-highlight-wl_1')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    final highlightCenter =
        tester.getCenter(find.byKey(const Key('home-watch-highlight-wl_1')));
    await tester.tapAt(Offset(highlightCenter.dx, 480));
    await tester.pumpAndSettle();

    expect(find.text('Watchlist'), findsWidgets);
  });

  testWidgets('watchlist price screen shows loading state', (tester) async {
    final completer = Completer<WatchlistPriceViewResponse>();
    final apiClient = FakeApiClient(watchlistPriceCompleter: completer);

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.watchlist);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(
      find.byKey(const Key('watchlist-loading-state')),
      findsOneWidget,
    );

    completer.complete(apiClient.watchlistPriceResponse);
    await tester.pumpAndSettle();
  });

  testWidgets('watchlist renders watched item with price and deal',
      (tester) async {
    final apiClient = FakeApiClient();

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.watchlist);
    await tester.pumpAndSettle();

    expect(apiClient.watchlistPriceCalls, greaterThanOrEqualTo(1));
    expect(apiClient.lastWatchlistPricesOwnerId, 'anon-test');
    expect(find.text('Coffee'), findsOneWidget);
    expect(find.textContaining('EUR 2.49'), findsOneWidget);
    expect(find.textContaining('/kg'), findsOneWidget);
    expect(find.text('Store A'), findsOneWidget);
    expect(find.text('Deal good'), findsOneWidget);
    expect(find.text('Target hit'), findsOneWidget);
  });

  testWidgets('watchlist renders missing price state', (tester) async {
    final apiClient = FakeApiClient();

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.watchlist);
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Tea'),
      200,
      scrollable: find.byType(Scrollable).last,
    );

    expect(find.text('Tea'), findsOneWidget);
    expect(find.text('Price missing'), findsOneWidget);
  });

  testWidgets('watchlist item tap navigates to product detail', (tester) async {
    final apiClient = FakeApiClient();

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.watchlist);
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('watchlist-price-card-wl_coffee')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('route-product-screen')), findsOneWidget);
    expect(apiClient.lastProductId, 'cp_coffee');
  });

  testWidgets('watchlist remove calls API and updates list', (tester) async {
    final apiClient = FakeApiClient();

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.watchlist);
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('remove-watch-wl_coffee')));
    await tester.pumpAndSettle();

    expect(apiClient.watchlistRemoveCalls, 1);
    expect(apiClient.lastWatchlistRemoveOwnerId, 'anon-test');
    expect(apiClient.lastRemovedWatchId, 'wl_coffee');
    expect(find.text('Coffee'), findsNothing);
    expect(find.text('Tea'), findsOneWidget);
  });

  testWidgets('watchlist remove failure shows safe error', (tester) async {
    final apiClient = FakeApiClient(failWatchlistRemove: true);

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.watchlist);
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('remove-watch-wl_coffee')));
    await tester.pumpAndSettle();

    expect(apiClient.watchlistRemoveCalls, 1);
    expect(find.text('Could not remove watchlist item.'), findsOneWidget);
    expect(find.text('Coffee'), findsOneWidget);
  });

  testWidgets('watchlist load error retries', (tester) async {
    final apiClient = FakeApiClient(failWatchlistPrices: true);

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.watchlist);
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('watchlist-error-state')), findsOneWidget);

    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();

    expect(apiClient.watchlistPriceCalls, 2);
    expect(find.text('Coffee'), findsOneWidget);
  });

  testWidgets('watchlist empty state navigates to search', (tester) async {
    final apiClient = FakeApiClient(
      watchlistPriceResponse: WatchlistPriceViewResponse.empty(),
    );

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.watchlist);
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('watchlist-empty-state')), findsOneWidget);
    expect(
      find.text('Watch products to track prices and deals.'),
      findsOneWidget,
    );

    await tester.tap(find.text('Search products'));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('route-search-screen')), findsOneWidget);
  });

  test('watchlist price parser tolerates partial payloads', () {
    final response = WatchlistPriceViewResponse.fromJson({
      'items': [
        {
          'watch_id': 'wl_partial',
          'canonical_product_id': 'cp_partial',
          'price': {'price_status': 'missing'},
        },
      ],
    });

    expect(response.items.single.watchId, 'wl_partial');
    expect(response.items.single.displayName, 'cp_partial');
    expect(response.items.single.price.isMissing, isTrue);
    expect(response.items.single.dealLevel, 'normal');
  });

  testWidgets('saved lists load and render', (tester) async {
    final apiClient = FakeApiClient();

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.lists);
    await tester.pumpAndSettle();

    expect(apiClient.savedListsCalls, 1);
    expect(apiClient.lastSavedListsOwnerId, 'anon-test');
    expect(find.byKey(const Key('saved-lists-screen')), findsOneWidget);
    expect(find.text('Weekly groceries'), findsOneWidget);
    expect(find.text('Party snacks'), findsOneWidget);
  });

  testWidgets('saved lists empty state works', (tester) async {
    final apiClient = FakeApiClient(
      savedListsResponse:
          const SavedListsResponse(lists: <SavedListSummary>[], total: 0),
    );

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.lists);
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('saved-lists-empty-state')), findsOneWidget);
    expect(find.text('Create a list to plan your shopping.'), findsOneWidget);
  });

  testWidgets('create saved list calls API and renders new card',
      (tester) async {
    final apiClient = FakeApiClient();

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.lists);
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('create-list-button')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('create-list-name-input')),
      'Weekend',
    );
    await tester.enterText(
      find.byKey(const Key('create-list-items-input')),
      'chips, salsa\njuice',
    );
    await tester.tap(find.byKey(const Key('create-list-submit')));
    await tester.pumpAndSettle();

    expect(apiClient.savedListCreateCalls, 1);
    expect(apiClient.lastSavedListCreateOwnerId, 'anon-test');
    expect(apiClient.lastSavedListCreateName, 'Weekend');
    expect(apiClient.lastSavedListCreateItems, ['chips', 'salsa', 'juice']);
    expect(find.text('Weekend'), findsOneWidget);
  });

  testWidgets('open saved list detail fetches items', (tester) async {
    final apiClient = FakeApiClient();

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.lists);
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('saved-list-card-sl_weekly')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('route-list-detail-screen')), findsOneWidget);
    expect(apiClient.savedListDetailCalls, 1);
    expect(apiClient.lastSavedListDetailId, 'sl_weekly');
    final input = tester.widget<TextField>(
      find.byKey(const Key('saved-list-items-input')),
    );
    expect(input.controller?.text, 'milk\neggs\nbread');
  });

  testWidgets('edit and save saved list calls patch API', (tester) async {
    final apiClient = FakeApiClient();

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(
      AppRoutes.listDetail,
      arguments: {'list_id': 'sl_weekly', 'name': 'Weekly groceries'},
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('saved-list-name-input')),
      'Weekly shop',
    );
    await tester.enterText(
      find.byKey(const Key('saved-list-items-input')),
      'milk\ncoffee, sugar',
    );
    await tester.tap(find.byKey(const Key('save-saved-list-button')));
    await tester.pumpAndSettle();

    expect(apiClient.savedListUpdateCalls, 1);
    expect(apiClient.lastSavedListUpdateId, 'sl_weekly');
    expect(apiClient.lastSavedListUpdateName, 'Weekly shop');
    expect(apiClient.lastSavedListUpdateItems, ['milk', 'coffee', 'sugar']);
    expect(find.text('Saved list updated.'), findsOneWidget);
  });

  testWidgets('optimize saved list navigates with current items',
      (tester) async {
    final apiClient = FakeApiClient();

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator
        .pushNamed(AppRoutes.listDetail, arguments: {'list_id': 'sl_weekly'});
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('saved-list-items-input')),
      'milk\neggs',
    );
    await tester.tap(find.byKey(const Key('optimize-saved-list-button')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('route-optimize-screen')), findsOneWidget);
    final input =
        tester.widget<TextField>(find.byKey(const Key('basket-input-field')));
    expect(input.controller?.text, 'milk\neggs');
  });

  testWidgets('delete saved list calls API and updates UI', (tester) async {
    final apiClient = FakeApiClient();

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.lists);
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('delete-list-sl_weekly')));
    await tester.pumpAndSettle();

    expect(apiClient.savedListDeleteCalls, 1);
    expect(apiClient.lastDeletedListId, 'sl_weekly');
    expect(find.text('Weekly groceries'), findsNothing);
    expect(find.text('Party snacks'), findsOneWidget);
  });

  testWidgets('saved lists error retries', (tester) async {
    final apiClient = FakeApiClient(failSavedLists: true);

    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: apiClient),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.lists);
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('saved-lists-error-state')), findsOneWidget);

    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();

    expect(apiClient.savedListsCalls, 2);
    expect(find.text('Weekly groceries'), findsOneWidget);
  });

  test('saved list parser tolerates partial payloads', () {
    final response = SavedListsResponse.fromJson({
      'lists': [
        {
          'list_id': 'sl_partial',
        },
      ],
    });
    final detail = SavedListDetail.fromJson({
      'list': {
        'list_id': 'sl_partial',
        'items': [
          {'text': 'milk'},
          {'text': ''},
          'eggs',
        ],
      },
    });

    expect(response.lists.single.listId, 'sl_partial');
    expect(response.lists.single.name, 'Saved list');
    expect(detail.items, ['milk', 'eggs']);
  });

  testWidgets('named routes exist and tolerate missing arguments',
      (tester) async {
    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(apiClient: FakeApiClient()),
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed(AppRoutes.search);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('route-search-screen')), findsOneWidget);

    navigator.pop();
    await tester.pumpAndSettle();
    navigator.pushNamed(AppRoutes.lists);
    await tester.pumpAndSettle();
    expect(find.text('Shopping lists'), findsWidgets);

    navigator.pop();
    await tester.pumpAndSettle();
    navigator.pushNamed(AppRoutes.watchlist);
    await tester.pumpAndSettle();
    expect(find.text('Watchlist'), findsWidgets);

    navigator.pop();
    await tester.pumpAndSettle();
    navigator.pushNamed(AppRoutes.optimize);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('route-optimize-screen')), findsOneWidget);

    navigator.pop();
    await tester.pumpAndSettle();
    navigator.pushNamed(AppRoutes.listDetail);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('route-list-detail-screen')), findsOneWidget);
    expect(find.text('No saved list was selected.'), findsWidgets);

    navigator.pop();
    await tester.pumpAndSettle();
    navigator.pushNamed(AppRoutes.product);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('route-product-screen')), findsOneWidget);
    expect(find.text('No product selected'), findsOneWidget);
  });

  testWidgets('watchlist summary banner still renders with localization',
      (tester) async {
    final dependencies = buildDependencies();
    await dependencies.watchlistRepository.upsert(
      productId: 'milk-v',
      displayName: 'Fresh milk Vereya 3% 1L',
      targetPrice: 1.70,
      currentPrice: 1.60,
    );

    await tester.pumpWidget(
      PricerApp(
        dependencies: dependencies,
        locale: const Locale('en'),
      ),
    );
    await tester.tap(find.text('Watchlist'));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('watchlist-drops-summary')), findsOneWidget);
    expect(find.text('Drops summary'), findsOneWidget);
    expect(find.byKey(const Key('watchlist-premium-card')), findsOneWidget);
  });

  testWidgets('paywall renders and hides ads for premium users',
      (tester) async {
    final dependencies = buildDependencies(
      profile: const MonetizationProfile(
        userId: 'anon-test',
        tier: 'premium',
        premiumActive: true,
        adsEnabled: false,
        alertsEnabled: true,
        optimizerMultiStoreEnabled: true,
        maxOptimizerItems: 25,
        maxWatchlistItems: 250,
        maxTargetPriceAlerts: 250,
        entitlementStatus: 'active',
        entitlementSource: 'test',
      ),
    );

    await tester.pumpWidget(
      PricerApp(
        dependencies: dependencies,
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('home-banner-ad')), findsNothing);
    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.push(
      MaterialPageRoute<void>(
        builder: (_) => PaywallScreen(dependencies: dependencies),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('paywall-status-card')), findsOneWidget);
    expect(find.text('Premium is active'), findsWidgets);
  });
}
