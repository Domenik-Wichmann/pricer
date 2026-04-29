class QueryResponse {
  const QueryResponse({
    required this.parsedQuery,
    required this.filtersApplied,
    required this.items,
    required this.cheapestStore,
    required this.totalCost,
  });

  final Map<String, dynamic> parsedQuery;
  final Map<String, dynamic> filtersApplied;
  final List<QueryResultItem> items;
  final String? cheapestStore;
  final double? totalCost;

  factory QueryResponse.fromJson(Map<String, dynamic> json) {
    final itemsJson = (json['items'] as List<dynamic>? ?? <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList();

    return QueryResponse(
      parsedQuery:
          Map<String, dynamic>.from(json['parsed_query'] as Map? ?? const {}),
      filtersApplied: Map<String, dynamic>.from(
          json['filters_applied'] as Map? ?? const {}),
      items: itemsJson.map(QueryResultItem.fromJson).toList(),
      cheapestStore: json['cheapest_store'] as String?,
      totalCost: _readDouble(json['total_cost']),
    );
  }
}

class QueryResultItem {
  const QueryResultItem({
    required this.sourceProductId,
    required this.productNameRaw,
    required this.displayEn,
    required this.categoryCode,
    required this.productType,
    required this.productFamily,
    required this.brand,
    required this.storeNameRaw,
    required this.locationCode,
    required this.currentPrice,
    required this.retailPrice,
    required this.promoPrice,
    required this.matchScore,
    required this.matchReasons,
    required this.historyAvgPrice,
    required this.storeCount,
    required this.rankScore,
  });

  final String sourceProductId;
  final String productNameRaw;
  final String? displayEn;
  final String? categoryCode;
  final String? productType;
  final String? productFamily;
  final String? brand;
  final String storeNameRaw;
  final String? locationCode;
  final double currentPrice;
  final double? retailPrice;
  final double? promoPrice;
  final double? matchScore;
  final List<String> matchReasons;
  final double? historyAvgPrice;
  final int storeCount;
  final double? rankScore;

  String get displayName => (displayEn?.trim().isNotEmpty ?? false)
      ? displayEn!.trim()
      : productNameRaw;

  double? get savingsVsAverage {
    if (historyAvgPrice == null) {
      return null;
    }

    return historyAvgPrice! - currentPrice;
  }

  factory QueryResultItem.fromJson(Map<String, dynamic> json) {
    final reasonsText = json['match_reasons'] as String? ?? '';
    return QueryResultItem(
      sourceProductId: json['source_product_id'] as String? ?? '',
      productNameRaw: json['product_name_raw'] as String? ?? '',
      displayEn: json['display_en'] as String?,
      categoryCode: json['category_code'] as String?,
      productType: json['product_type'] as String?,
      productFamily: json['product_family'] as String?,
      brand: json['brand'] as String?,
      storeNameRaw: json['store_name_raw'] as String? ?? '',
      locationCode: json['location_code'] as String?,
      currentPrice: _readDouble(json['current_price']) ?? 0,
      retailPrice: _readDouble(json['retail_price']),
      promoPrice: _readDouble(json['promo_price']),
      matchScore: _readDouble(json['match_score']),
      matchReasons: reasonsText
          .split('|')
          .map((value) => value.trim())
          .where((value) => value.isNotEmpty)
          .toList(),
      historyAvgPrice: _readDouble(json['history_avg_price']),
      storeCount: _readInt(json['store_count']) ?? 0,
      rankScore: _readDouble(json['rank_score']),
    );
  }
}

class ProductHistoryPoint {
  const ProductHistoryPoint({
    required this.date,
    required this.priceAvg,
    required this.priceMin,
    required this.priceMax,
    required this.storeCount,
    required this.snapshotCount,
  });

  final String date;
  final double priceAvg;
  final double priceMin;
  final double priceMax;
  final int storeCount;
  final int snapshotCount;

  factory ProductHistoryPoint.fromJson(Map<String, dynamic> json) {
    return ProductHistoryPoint(
      date: json['date'] as String? ?? '',
      priceAvg: _readDouble(json['price_avg']) ?? 0,
      priceMin: _readDouble(json['price_min']) ?? 0,
      priceMax: _readDouble(json['price_max']) ?? 0,
      storeCount: _readInt(json['store_count']) ?? 0,
      snapshotCount: _readInt(json['snapshot_count']) ?? 0,
    );
  }
}

class HomeSummary {
  const HomeSummary({
    required this.topDeals,
    required this.watchlistHighlights,
    required this.marketHighlights,
    required this.savedLists,
    required this.quickActions,
    required this.generatedAt,
  });

  final List<HomeDealCard> topDeals;
  final List<HomeWatchlistHighlight> watchlistHighlights;
  final List<HomeMarketHighlight> marketHighlights;
  final List<HomeSavedListShortcut> savedLists;
  final List<HomeQuickAction> quickActions;
  final DateTime? generatedAt;

  bool get hasAnyDynamicSection =>
      topDeals.isNotEmpty ||
      watchlistHighlights.isNotEmpty ||
      marketHighlights.isNotEmpty ||
      savedLists.isNotEmpty;

  factory HomeSummary.empty() {
    return const HomeSummary(
      topDeals: <HomeDealCard>[],
      watchlistHighlights: <HomeWatchlistHighlight>[],
      marketHighlights: <HomeMarketHighlight>[],
      savedLists: <HomeSavedListShortcut>[],
      quickActions: <HomeQuickAction>[
        HomeQuickAction(type: 'search_product', label: 'Search products'),
        HomeQuickAction(type: 'optimize_basket', label: 'Optimize a basket'),
        HomeQuickAction(type: 'view_watchlist', label: 'View watchlist'),
      ],
      generatedAt: null,
    );
  }

  factory HomeSummary.fromJson(Map<String, dynamic> json) {
    return HomeSummary(
      topDeals: _readObjectList(json['top_deals'])
          .map(HomeDealCard.fromJson)
          .toList(),
      watchlistHighlights: _readObjectList(json['watchlist_highlights'])
          .map(HomeWatchlistHighlight.fromJson)
          .toList(),
      marketHighlights: _readObjectList(json['market_highlights'])
          .map(HomeMarketHighlight.fromJson)
          .toList(),
      savedLists: _readObjectList(json['saved_lists'])
          .map(HomeSavedListShortcut.fromJson)
          .toList(),
      quickActions: _readObjectList(json['quick_actions'])
          .map(HomeQuickAction.fromJson)
          .toList(),
      generatedAt: _readDateValue(json['generated_at']),
    );
  }
}

class HomeDealCard {
  const HomeDealCard({
    required this.canonicalProductId,
    required this.canonicalName,
    required this.dealLevel,
    required this.dealScore,
    required this.price,
    required this.currency,
    this.chainName,
  });

  final String canonicalProductId;
  final String canonicalName;
  final String dealLevel;
  final double? dealScore;
  final double? price;
  final String currency;
  final String? chainName;

  factory HomeDealCard.fromJson(Map<String, dynamic> json) {
    return HomeDealCard(
      canonicalProductId: json['canonical_product_id'] as String? ?? '',
      canonicalName: json['canonical_name'] as String? ?? '',
      dealLevel: json['deal_level'] as String? ?? '',
      dealScore: _readDouble(json['deal_score']),
      price: _readDouble(json['price']),
      currency: json['currency'] as String? ?? 'EUR',
      chainName: json['chain_name'] as String?,
    );
  }
}

class HomeWatchlistHighlight {
  const HomeWatchlistHighlight({
    required this.watchId,
    required this.label,
    required this.canonicalProductId,
    required this.highlightType,
    required this.message,
  });

  final String watchId;
  final String label;
  final String canonicalProductId;
  final String highlightType;
  final String message;

  factory HomeWatchlistHighlight.fromJson(Map<String, dynamic> json) {
    return HomeWatchlistHighlight(
      watchId: json['watch_id'] as String? ?? '',
      label: json['label'] as String? ?? '',
      canonicalProductId: json['canonical_product_id'] as String? ?? '',
      highlightType: json['highlight_type'] as String? ?? '',
      message: json['message'] as String? ?? '',
    );
  }
}

class HomeSavedListShortcut {
  const HomeSavedListShortcut({
    required this.listId,
    required this.name,
    required this.itemCount,
    required this.action,
  });

  final String listId;
  final String name;
  final int itemCount;
  final String action;

  factory HomeSavedListShortcut.fromJson(Map<String, dynamic> json) {
    return HomeSavedListShortcut(
      listId: json['list_id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      itemCount: _readInt(json['item_count']) ?? 0,
      action: json['action'] as String? ?? '',
    );
  }
}

class HomeMarketHighlight {
  const HomeMarketHighlight({
    required this.type,
    required this.label,
    required this.trend,
    required this.message,
    this.changePercent,
  });

  final String type;
  final String label;
  final String trend;
  final double? changePercent;
  final String message;

  factory HomeMarketHighlight.fromJson(Map<String, dynamic> json) {
    return HomeMarketHighlight(
      type: json['type'] as String? ?? '',
      label: json['label'] as String? ?? '',
      trend: json['trend'] as String? ?? '',
      changePercent: _readDouble(json['change_percent']),
      message: json['message'] as String? ?? '',
    );
  }
}

class HomeQuickAction {
  const HomeQuickAction({
    required this.type,
    required this.label,
  });

  final String type;
  final String label;

  factory HomeQuickAction.fromJson(Map<String, dynamic> json) {
    return HomeQuickAction(
      type: json['type'] as String? ?? '',
      label: json['label'] as String? ?? '',
    );
  }
}

class ProductSearchResponse {
  const ProductSearchResponse({
    required this.layerMode,
    required this.total,
    required this.limit,
    required this.offset,
    required this.results,
  });

  final String layerMode;
  final int total;
  final int limit;
  final int offset;
  final List<ProductSearchResult> results;

  factory ProductSearchResponse.fromJson(Map<String, dynamic> json) {
    final rows = _readObjectList(json['results']).isNotEmpty
        ? _readObjectList(json['results'])
        : _readObjectList(json['items']);

    return ProductSearchResponse(
      layerMode: json['layer_mode'] as String? ?? 'canonical_with_enrichment',
      total: _readInt(json['total']) ?? rows.length,
      limit: _readInt(json['limit']) ?? rows.length,
      offset: _readInt(json['offset']) ?? 0,
      results: rows.map(ProductSearchResult.fromJson).toList(),
    );
  }
}

class ProductSearchResult {
  const ProductSearchResult({
    required this.canonicalProductId,
    required this.canonicalName,
    required this.markers,
    required this.enrichment,
    this.bestPrice,
    this.deal,
  });

  final String canonicalProductId;
  final String canonicalName;
  final Map<String, String> markers;
  final ProductEnrichment enrichment;
  final ProductBestPrice? bestPrice;
  final ProductDealInfo? deal;

  String get displayName {
    if (canonicalName.trim().isNotEmpty) {
      return canonicalName.trim();
    }
    if (canonicalProductId.trim().isNotEmpty) {
      return canonicalProductId.trim();
    }
    return 'Product';
  }

  factory ProductSearchResult.fromJson(Map<String, dynamic> json) {
    final bestPriceJson = json['best_price'];
    final dealJson = json['deal'];
    return ProductSearchResult(
      canonicalProductId: json['canonical_product_id'] as String? ?? '',
      canonicalName: json['canonical_name'] as String? ?? '',
      markers: _readStringMap(json['markers']),
      enrichment: ProductEnrichment.fromJson(
        Map<String, dynamic>.from(json['enrichment'] as Map? ?? const {}),
      ),
      bestPrice: bestPriceJson is Map
          ? ProductBestPrice.fromJson(Map<String, dynamic>.from(bestPriceJson))
          : null,
      deal: dealJson is Map
          ? ProductDealInfo.fromJson(Map<String, dynamic>.from(dealJson))
          : null,
    );
  }
}

class SavedUserLocationsResponse {
  const SavedUserLocationsResponse({
    required this.locations,
    required this.total,
  });

  final List<SavedUserLocation> locations;
  final int total;

  factory SavedUserLocationsResponse.fromJson(Map<String, dynamic> json) {
    final locations = _readObjectList(json['locations'])
        .map(SavedUserLocation.fromJson)
        .toList();
    return SavedUserLocationsResponse(
      locations: locations,
      total: _readInt(json['total']) ?? locations.length,
    );
  }
}

class SavedUserLocation {
  const SavedUserLocation({
    required this.locationId,
    required this.userId,
    required this.label,
    required this.displayName,
    required this.latitude,
    required this.longitude,
    required this.defaultRadiusKm,
    required this.defaultSort,
    required this.source,
    required this.isDefault,
    this.addressRaw,
    this.provider,
    this.providerPlaceId,
    this.formattedAddress,
    this.confidence,
    this.confidenceReason,
    this.provenance = const <String, dynamic>{},
  });

  final String locationId;
  final String userId;
  final String label;
  final String displayName;
  final String? addressRaw;
  final double latitude;
  final double longitude;
  final double defaultRadiusKm;
  final String defaultSort;
  final String source;
  final bool isDefault;
  final String? provider;
  final String? providerPlaceId;
  final String? formattedAddress;
  final double? confidence;
  final String? confidenceReason;
  final Map<String, dynamic> provenance;

  factory SavedUserLocation.fromJson(Map<String, dynamic> json) {
    return SavedUserLocation(
      locationId: json['location_id'] as String? ?? '',
      userId: json['user_id'] as String? ?? '',
      label: json['label'] as String? ?? 'custom',
      displayName: json['display_name'] as String? ?? 'Location',
      addressRaw: json['address_raw'] as String?,
      latitude: _readDouble(json['latitude']) ?? 0,
      longitude: _readDouble(json['longitude']) ?? 0,
      defaultRadiusKm: _readDouble(json['default_radius_km']) ?? 10,
      defaultSort: json['default_sort'] as String? ?? 'nearest',
      source: json['source'] as String? ?? 'manual',
      isDefault: json['is_default'] == true,
      provider: json['provider'] as String?,
      providerPlaceId: json['provider_place_id'] as String?,
      formattedAddress: json['formatted_address'] as String?,
      confidence: _readDouble(json['confidence']),
      confidenceReason: json['confidence_reason'] as String?,
      provenance:
          Map<String, dynamic>.from(json['provenance'] as Map? ?? const {}),
    );
  }
}

class ManualAddressGeocodeResponse {
  const ManualAddressGeocodeResponse({
    required this.status,
    required this.cacheHit,
    this.geocode,
    this.error,
  });

  final String status;
  final bool cacheHit;
  final ManualAddressGeocode? geocode;
  final String? error;

  bool get isMatchedWithCoordinates =>
      status == 'matched' && (geocode?.hasCoordinates ?? false);

  factory ManualAddressGeocodeResponse.fromJson(Map<String, dynamic> json) {
    final geocodeJson = json['geocode'] is Map
        ? Map<String, dynamic>.from(json['geocode'] as Map)
        : null;
    return ManualAddressGeocodeResponse(
      status: json['status'] as String? ?? '',
      cacheHit: json['cache_hit'] == true,
      geocode: geocodeJson == null
          ? null
          : ManualAddressGeocode.fromJson(geocodeJson),
      error: json['error'] as String?,
    );
  }
}

class ManualAddressGeocode {
  const ManualAddressGeocode({
    required this.geocodeId,
    required this.provider,
    required this.queryText,
    required this.status,
    required this.provenance,
    this.providerPlaceId,
    this.formattedAddress,
    this.latitude,
    this.longitude,
    this.confidence,
    this.confidenceReason,
    this.rawProviderResult,
  });

  final String geocodeId;
  final String? provider;
  final String? providerPlaceId;
  final String queryText;
  final String? formattedAddress;
  final double? latitude;
  final double? longitude;
  final double? confidence;
  final String? confidenceReason;
  final String status;
  final Map<String, dynamic> provenance;
  final Object? rawProviderResult;

  bool get hasCoordinates => latitude != null && longitude != null;

  factory ManualAddressGeocode.fromJson(Map<String, dynamic> json) {
    return ManualAddressGeocode(
      geocodeId: json['geocode_id'] as String? ?? '',
      provider: json['provider'] as String?,
      providerPlaceId: json['provider_place_id'] as String?,
      queryText: json['query_text'] as String? ?? '',
      formattedAddress: json['formatted_address'] as String?,
      latitude: _readDouble(json['latitude']),
      longitude: _readDouble(json['longitude']),
      confidence: _readDouble(json['confidence']),
      confidenceReason: json['confidence_reason'] as String?,
      status: json['status'] as String? ?? '',
      provenance:
          Map<String, dynamic>.from(json['provenance'] as Map? ?? const {}),
      rawProviderResult: json['raw_provider_result'],
    );
  }
}

class NearestAvailabilityResponse {
  const NearestAvailabilityResponse({
    required this.status,
    required this.resultCount,
    required this.offers,
    required this.location,
    this.productName,
  });

  final String status;
  final int resultCount;
  final List<NearestAvailabilityOffer> offers;
  final Map<String, dynamic> location;
  final String? productName;

  factory NearestAvailabilityResponse.fromJson(Map<String, dynamic> json) {
    final product = Map<String, dynamic>.from(json['product'] as Map? ?? {});
    return NearestAvailabilityResponse(
      status: json['status'] as String? ?? '',
      resultCount: _readInt(json['result_count']) ?? 0,
      offers: _readObjectList(json['offers'])
          .map(NearestAvailabilityOffer.fromJson)
          .toList(),
      location: Map<String, dynamic>.from(json['location'] as Map? ?? const {}),
      productName: product['canonical_name'] as String?,
    );
  }
}

class NearestAvailabilityOffer {
  const NearestAvailabilityOffer({
    required this.storeNameRaw,
    required this.distanceKm,
    required this.effectivePrice,
    required this.currency,
    this.formattedAddress,
    this.chainName,
  });

  final String storeNameRaw;
  final String? chainName;
  final String? formattedAddress;
  final double distanceKm;
  final double effectivePrice;
  final String currency;

  factory NearestAvailabilityOffer.fromJson(Map<String, dynamic> json) {
    return NearestAvailabilityOffer(
      storeNameRaw: json['store_name_raw'] as String? ?? 'Store',
      chainName: json['chain_name'] as String?,
      formattedAddress: json['formatted_address'] as String?,
      distanceKm: _readDouble(json['distance_km']) ?? 0,
      effectivePrice: _readDouble(json['effective_price']) ?? 0,
      currency: json['currency'] as String? ?? 'EUR',
    );
  }
}

class CanonicalProductDetail {
  const CanonicalProductDetail({
    required this.canonicalProductId,
    required this.canonicalName,
    required this.markers,
    required this.enrichment,
  });

  final String canonicalProductId;
  final String canonicalName;
  final Map<String, String> markers;
  final ProductEnrichment enrichment;

  String get displayName =>
      canonicalName.isNotEmpty ? canonicalName : canonicalProductId;

  factory CanonicalProductDetail.fromJson(Map<String, dynamic> json) {
    return CanonicalProductDetail(
      canonicalProductId: json['canonical_product_id'] as String? ?? '',
      canonicalName: json['canonical_name'] as String? ?? '',
      markers: _readStringMap(json['markers']),
      enrichment: ProductEnrichment.fromJson(
        Map<String, dynamic>.from(json['enrichment'] as Map? ?? const {}),
      ),
    );
  }
}

class ProductEnrichment {
  const ProductEnrichment({
    required this.categoryL1,
    required this.categoryL2,
    required this.categoryL3,
    required this.categoryL4,
    required this.brand,
    required this.baseProduct,
    required this.productLine,
    required this.flavor,
    required this.attributes,
    required this.dietTags,
    required this.allergens,
    required this.productForm,
    required this.packaging,
    required this.usageContext,
    required this.qualityTier,
  });

  final String? categoryL1;
  final String? categoryL2;
  final String? categoryL3;
  final String? categoryL4;
  final String? brand;
  final String? baseProduct;
  final String? productLine;
  final List<String> flavor;
  final List<String> attributes;
  final List<String> dietTags;
  final List<String> allergens;
  final String? productForm;
  final String? packaging;
  final List<String> usageContext;
  final String? qualityTier;

  List<String> get categoryPath {
    return [categoryL1, categoryL2, categoryL3, categoryL4]
        .whereType<String>()
        .map((value) => value.trim())
        .where((value) => value.isNotEmpty)
        .toList();
  }

  factory ProductEnrichment.fromJson(Map<String, dynamic> json) {
    return ProductEnrichment(
      categoryL1: json['category_l1'] as String?,
      categoryL2: json['category_l2'] as String?,
      categoryL3: json['category_l3'] as String?,
      categoryL4: json['category_l4'] as String?,
      brand: json['brand'] as String?,
      baseProduct: json['base_product'] as String?,
      productLine: json['product_line'] as String?,
      flavor: _readStringList(json['flavor']),
      attributes: _readStringList(json['attributes']),
      dietTags: _readStringList(json['diet_tags']),
      allergens: _readStringList(json['allergens']),
      productForm: json['product_form'] as String?,
      packaging: json['packaging'] as String?,
      usageContext: _readStringList(json['usage_context']),
      qualityTier: json['quality_tier'] as String?,
    );
  }
}

class ProductDealCheckResult {
  const ProductDealCheckResult({
    required this.currency,
    required this.items,
  });

  final String currency;
  final List<ProductDealCheckItem> items;

  ProductDealCheckItem? itemFor(String canonicalProductId) {
    for (final item in items) {
      if (item.canonicalProductId == canonicalProductId) {
        return item;
      }
    }
    return null;
  }

  factory ProductDealCheckResult.fromJson(Map<String, dynamic> json) {
    return ProductDealCheckResult(
      currency: json['currency'] as String? ?? 'EUR',
      items: _readObjectList(json['items'])
          .map(ProductDealCheckItem.fromJson)
          .toList(),
    );
  }
}

class ProductDealCheckItem {
  const ProductDealCheckItem({
    required this.canonicalProductId,
    required this.priceStatus,
    required this.bestPrice,
    required this.deal,
  });

  final String canonicalProductId;
  final String priceStatus;
  final ProductBestPrice? bestPrice;
  final ProductDealInfo deal;

  factory ProductDealCheckItem.fromJson(Map<String, dynamic> json) {
    final bestPriceJson = json['best_price'];
    return ProductDealCheckItem(
      canonicalProductId: json['canonical_product_id'] as String? ?? '',
      priceStatus: json['price_status'] as String? ?? '',
      bestPrice: bestPriceJson is Map
          ? ProductBestPrice.fromJson(Map<String, dynamic>.from(bestPriceJson))
          : null,
      deal: ProductDealInfo.fromJson(
        Map<String, dynamic>.from(json['deal'] as Map? ?? const {}),
      ),
    );
  }
}

class ProductBestPrice {
  const ProductBestPrice({
    required this.price,
    required this.currency,
    this.chainName,
    this.storeName,
  });

  final double? price;
  final String currency;
  final String? chainName;
  final String? storeName;

  factory ProductBestPrice.fromJson(Map<String, dynamic> json) {
    return ProductBestPrice(
      price: _readDouble(json['price']),
      currency: json['currency'] as String? ?? 'EUR',
      chainName: json['chain_name'] as String?,
      storeName: json['store_name'] as String?,
    );
  }
}

class ProductDealInfo {
  const ProductDealInfo({
    required this.dealLevel,
    required this.dealScore,
    required this.reason,
    required this.targetHit,
  });

  final String dealLevel;
  final double? dealScore;
  final String reason;
  final bool targetHit;

  factory ProductDealInfo.fromJson(Map<String, dynamic> json) {
    return ProductDealInfo(
      dealLevel: json['deal_level'] as String? ?? 'normal',
      dealScore: _readDouble(json['deal_score']),
      reason: json['reason'] as String? ?? '',
      targetHit: json['target_hit'] == true,
    );
  }
}

class WatchlistAddResult {
  const WatchlistAddResult({
    required this.watchId,
    required this.canonicalProductId,
  });

  final String watchId;
  final String canonicalProductId;

  factory WatchlistAddResult.fromJson(Map<String, dynamic> json) {
    final item = Map<String, dynamic>.from(json['item'] as Map? ?? json);
    return WatchlistAddResult(
      watchId: item['watch_id'] as String? ?? '',
      canonicalProductId: item['canonical_product_id'] as String? ?? '',
    );
  }
}

class WatchlistPriceViewResponse {
  const WatchlistPriceViewResponse({
    required this.currency,
    required this.total,
    required this.items,
  });

  final String currency;
  final int total;
  final List<WatchlistPriceItem> items;

  factory WatchlistPriceViewResponse.fromJson(Map<String, dynamic> json) {
    final items = _readObjectList(json['items'])
        .map(WatchlistPriceItem.fromJson)
        .toList();
    return WatchlistPriceViewResponse(
      currency: json['currency'] as String? ?? 'EUR',
      total: _readInt(json['total']) ?? items.length,
      items: items,
    );
  }

  factory WatchlistPriceViewResponse.empty() {
    return const WatchlistPriceViewResponse(
      currency: 'EUR',
      total: 0,
      items: <WatchlistPriceItem>[],
    );
  }
}

class WatchlistPriceItem {
  const WatchlistPriceItem({
    required this.watchId,
    required this.canonicalProductId,
    required this.label,
    required this.targetPrice,
    required this.product,
    required this.price,
    required this.deal,
  });

  final String watchId;
  final String canonicalProductId;
  final String label;
  final double? targetPrice;
  final WatchlistProductSummary product;
  final WatchlistPriceInfo price;
  final ProductDealInfo? deal;

  String get displayName {
    if (label.trim().isNotEmpty) {
      return label.trim();
    }
    if (product.canonicalName.trim().isNotEmpty) {
      return product.canonicalName.trim();
    }
    return canonicalProductId;
  }

  bool get hasBestPrice => price.bestPrice?.price != null;
  bool get targetHit => deal?.targetHit == true;
  String get dealLevel => deal?.dealLevel ?? 'normal';

  factory WatchlistPriceItem.fromJson(Map<String, dynamic> json) {
    final priceJson = Map<String, dynamic>.from(json['price'] as Map? ?? {});
    final productJson =
        Map<String, dynamic>.from(json['product'] as Map? ?? {});
    final dealJson = json['deal'] is Map
        ? Map<String, dynamic>.from(json['deal'] as Map)
        : null;
    return WatchlistPriceItem(
      watchId: json['watch_id'] as String? ?? '',
      canonicalProductId: json['canonical_product_id'] as String? ?? '',
      label: json['label'] as String? ?? '',
      targetPrice: _readDouble(json['target_price']),
      product: WatchlistProductSummary.fromJson(productJson),
      price: WatchlistPriceInfo.fromJson(priceJson),
      deal: dealJson == null ? null : ProductDealInfo.fromJson(dealJson),
    );
  }
}

class WatchlistProductSummary {
  const WatchlistProductSummary({
    required this.canonicalProductId,
    required this.canonicalName,
  });

  final String canonicalProductId;
  final String canonicalName;

  factory WatchlistProductSummary.fromJson(Map<String, dynamic> json) {
    return WatchlistProductSummary(
      canonicalProductId: json['canonical_product_id'] as String? ?? '',
      canonicalName: json['canonical_name'] as String? ?? '',
    );
  }
}

class WatchlistPriceInfo {
  const WatchlistPriceInfo({
    required this.priceStatus,
    required this.bestPrice,
  });

  final String priceStatus;
  final ProductBestPrice? bestPrice;

  bool get isMissing => priceStatus != 'priced' || bestPrice?.price == null;

  factory WatchlistPriceInfo.fromJson(Map<String, dynamic> json) {
    final bestPriceJson = json['best_price'] is Map
        ? Map<String, dynamic>.from(json['best_price'] as Map)
        : null;
    return WatchlistPriceInfo(
      priceStatus: json['price_status'] as String? ?? 'missing',
      bestPrice: bestPriceJson == null
          ? null
          : ProductBestPrice.fromJson(bestPriceJson),
    );
  }
}

class ShoppingListModel {
  const ShoppingListModel({
    required this.id,
    required this.name,
    required this.createdAt,
    required this.updatedAt,
    required this.itemCount,
  });

  final String id;
  final String name;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final int itemCount;
}

class SavedListsResponse {
  const SavedListsResponse({
    required this.lists,
    required this.total,
  });

  final List<SavedListSummary> lists;
  final int total;

  factory SavedListsResponse.fromJson(Map<String, dynamic> json) {
    final lists =
        _readObjectList(json['lists']).map(SavedListSummary.fromJson).toList();
    return SavedListsResponse(
      lists: lists,
      total: _readInt(json['total']) ?? lists.length,
    );
  }
}

class SavedListSummary {
  const SavedListSummary({
    required this.listId,
    required this.name,
    required this.itemCount,
    required this.createdAt,
    required this.updatedAt,
  });

  final String listId;
  final String name;
  final int itemCount;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  factory SavedListSummary.fromJson(Map<String, dynamic> json) {
    final items = _readSavedListItems(json['items']);
    return SavedListSummary(
      listId: json['list_id'] as String? ?? '',
      name: json['name'] as String? ?? 'Saved list',
      itemCount: _readInt(json['item_count']) ?? items.length,
      createdAt: _readDateValue(json['created_at']),
      updatedAt: _readDateValue(json['updated_at']),
    );
  }
}

class SavedListDetail {
  const SavedListDetail({
    required this.listId,
    required this.name,
    required this.items,
    required this.createdAt,
    required this.updatedAt,
  });

  final String listId;
  final String name;
  final List<String> items;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  int get itemCount => items.length;

  factory SavedListDetail.fromJson(Map<String, dynamic> json) {
    final list = Map<String, dynamic>.from(json['list'] as Map? ?? json);
    return SavedListDetail(
      listId: list['list_id'] as String? ?? '',
      name: list['name'] as String? ?? 'Saved list',
      items: _readSavedListItems(list['items']),
      createdAt: _readDateValue(list['created_at']),
      updatedAt: _readDateValue(list['updated_at']),
    );
  }

  SavedListSummary toSummary() {
    return SavedListSummary(
      listId: listId,
      name: name,
      itemCount: itemCount,
      createdAt: createdAt,
      updatedAt: updatedAt,
    );
  }
}

class ShoppingListEntry {
  const ShoppingListEntry({
    required this.id,
    required this.queryText,
    required this.quantity,
    required this.addedAt,
    this.matchedProductId,
  });

  final String id;
  final String queryText;
  final String? matchedProductId;
  final int quantity;
  final DateTime? addedAt;
}

class WatchlistEntry {
  const WatchlistEntry({
    required this.productId,
    required this.displayName,
    required this.addedAt,
    this.targetPrice,
    this.currentPrice,
  });

  final String productId;
  final String displayName;
  final DateTime? addedAt;
  final double? targetPrice;
  final double? currentPrice;
}

class MonetizationProfile {
  const MonetizationProfile({
    required this.userId,
    required this.tier,
    required this.premiumActive,
    required this.adsEnabled,
    required this.alertsEnabled,
    required this.optimizerMultiStoreEnabled,
    required this.maxOptimizerItems,
    required this.maxWatchlistItems,
    required this.maxTargetPriceAlerts,
    this.revenuecatCustomerId,
    this.revenuecatEntitlementId,
    this.revenuecatProductId,
    this.entitlementStatus,
    this.entitlementSource,
    this.expiresAt,
    this.updatedAt,
  });

  final String userId;
  final String tier;
  final bool premiumActive;
  final bool adsEnabled;
  final bool alertsEnabled;
  final bool optimizerMultiStoreEnabled;
  final int maxOptimizerItems;
  final int maxWatchlistItems;
  final int maxTargetPriceAlerts;
  final String? revenuecatCustomerId;
  final String? revenuecatEntitlementId;
  final String? revenuecatProductId;
  final String? entitlementStatus;
  final String? entitlementSource;
  final DateTime? expiresAt;
  final DateTime? updatedAt;

  bool get isFreeTier => !premiumActive;

  factory MonetizationProfile.free(String userId) {
    return MonetizationProfile(
      userId: userId,
      tier: 'free',
      premiumActive: false,
      adsEnabled: true,
      alertsEnabled: false,
      optimizerMultiStoreEnabled: false,
      maxOptimizerItems: 8,
      maxWatchlistItems: 20,
      maxTargetPriceAlerts: 3,
      entitlementStatus: 'inactive',
      entitlementSource: 'default_free',
    );
  }

  factory MonetizationProfile.fromJson(Map<String, dynamic> json,
      {required String userId}) {
    return MonetizationProfile(
      userId: json['user_id'] as String? ?? userId,
      tier: json['tier'] as String? ?? 'free',
      premiumActive: json['premium_active'] as bool? ?? false,
      adsEnabled: json['ads_enabled'] as bool? ?? true,
      alertsEnabled: json['alerts_enabled'] as bool? ?? false,
      optimizerMultiStoreEnabled:
          json['optimizer_multi_store_enabled'] as bool? ?? false,
      maxOptimizerItems: _readInt(json['max_optimizer_items']) ?? 8,
      maxWatchlistItems: _readInt(json['max_watchlist_items']) ?? 20,
      maxTargetPriceAlerts: _readInt(json['max_target_price_alerts']) ?? 3,
      revenuecatCustomerId: json['revenuecat_customer_id'] as String?,
      revenuecatEntitlementId: json['revenuecat_entitlement_id'] as String?,
      revenuecatProductId: json['revenuecat_product_id'] as String?,
      entitlementStatus: json['entitlement_status'] as String?,
      entitlementSource: json['entitlement_source'] as String?,
      expiresAt: _readDateValue(json['expires_at']),
      updatedAt: _readDateValue(json['updated_at']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'user_id': userId,
      'tier': tier,
      'premium_active': premiumActive,
      'ads_enabled': adsEnabled,
      'alerts_enabled': alertsEnabled,
      'optimizer_multi_store_enabled': optimizerMultiStoreEnabled,
      'max_optimizer_items': maxOptimizerItems,
      'max_watchlist_items': maxWatchlistItems,
      'max_target_price_alerts': maxTargetPriceAlerts,
      'revenuecat_customer_id': revenuecatCustomerId,
      'revenuecat_entitlement_id': revenuecatEntitlementId,
      'revenuecat_product_id': revenuecatProductId,
      'entitlement_status': entitlementStatus,
      'entitlement_source': entitlementSource,
      'expires_at': expiresAt?.toIso8601String(),
      'updated_at': updatedAt?.toIso8601String(),
    };
  }
}

class MonetizationPackage {
  const MonetizationPackage({
    required this.identifier,
    required this.title,
    required this.description,
    required this.priceLabel,
    required this.storeProductId,
    required this.packageType,
  });

  final String identifier;
  final String title;
  final String description;
  final String priceLabel;
  final String storeProductId;
  final String packageType;
}

class ListComparisonResult {
  const ListComparisonResult({
    required this.items,
    required this.totalCost,
    required this.cheapestStore,
  });

  final List<QueryResultItem> items;
  final double totalCost;
  final String? cheapestStore;
}

class BasketOptimizationResponse {
  const BasketOptimizationResponse({
    required this.optimizerResult,
    required this.explanation,
  });

  final BasketOptimizerResult optimizerResult;
  final BasketExplanation? explanation;

  factory BasketOptimizationResponse.fromJson(Map<String, dynamic> json) {
    return BasketOptimizationResponse(
      optimizerResult: BasketOptimizerResult.fromJson(
        Map<String, dynamic>.from(json['optimizer_result'] as Map? ?? const {}),
      ),
      explanation: json['explanation'] is Map
          ? BasketExplanation.fromJson(
              Map<String, dynamic>.from(json['explanation'] as Map),
            )
          : null,
    );
  }
}

class BasketOptimizerResult {
  const BasketOptimizerResult({
    required this.optimizationType,
    required this.currency,
    required this.recommendedStrategy,
    required this.bestOption,
    required this.bestSingleStoreOption,
    required this.bestMultiStoreOption,
    required this.warnings,
  });

  final String optimizationType;
  final String currency;
  final String recommendedStrategy;
  final BasketOption? bestOption;
  final BasketOption? bestSingleStoreOption;
  final BasketOption? bestMultiStoreOption;
  final List<BasketWarning> warnings;

  BasketOption? get recommendedOption {
    if (optimizationType == 'multi_store') {
      if (recommendedStrategy == 'multi_store') {
        return bestMultiStoreOption ?? bestSingleStoreOption;
      }
      return bestSingleStoreOption ?? bestMultiStoreOption;
    }
    return bestOption;
  }

  factory BasketOptimizerResult.fromJson(Map<String, dynamic> json) {
    final optimizationType = json['optimization_type'] as String? ?? '';
    final recommendedStrategy = json['recommended_strategy'] as String? ??
        (optimizationType == 'multi_store' ? 'single_store' : 'single_store');
    return BasketOptimizerResult(
      optimizationType: optimizationType,
      currency: json['currency'] as String? ?? 'EUR',
      recommendedStrategy: recommendedStrategy,
      bestOption: json['best_option'] is Map
          ? BasketOption.fromJson(
              Map<String, dynamic>.from(json['best_option'] as Map),
            )
          : null,
      bestSingleStoreOption: json['best_single_store_option'] is Map
          ? BasketOption.fromJson(
              Map<String, dynamic>.from(
                  json['best_single_store_option'] as Map),
            )
          : null,
      bestMultiStoreOption: json['best_multi_store_option'] is Map
          ? BasketOption.fromJson(
              Map<String, dynamic>.from(json['best_multi_store_option'] as Map),
            )
          : null,
      warnings: _readObjectList(json['warnings'])
          .map(BasketWarning.fromJson)
          .toList(),
    );
  }
}

class BasketOption {
  const BasketOption({
    required this.actualTotal,
    required this.currency,
    required this.storeCount,
    required this.chainName,
    required this.storeName,
    required this.pricedItemCount,
    required this.missingItemCount,
    required this.staleItemCount,
    required this.savingsVsBestSingleStore,
    required this.stores,
    required this.items,
    required this.warnings,
  });

  final double? actualTotal;
  final String currency;
  final int storeCount;
  final String? chainName;
  final String? storeName;
  final int pricedItemCount;
  final int missingItemCount;
  final int staleItemCount;
  final double? savingsVsBestSingleStore;
  final List<BasketStoreOption> stores;
  final List<BasketOptimizedItem> items;
  final List<BasketWarning> warnings;

  List<BasketStoreOption> get displayStores {
    if (stores.isNotEmpty) {
      return stores;
    }
    return [
      BasketStoreOption(
        chainName: chainName,
        storeName: storeName,
        actualTotal: actualTotal,
        items: items,
      ),
    ];
  }

  factory BasketOption.fromJson(Map<String, dynamic> json) {
    return BasketOption(
      actualTotal: _readDouble(json['actual_total']),
      currency: json['currency'] as String? ?? 'EUR',
      storeCount: _readInt(json['store_count']) ?? 1,
      chainName: json['chain_name'] as String?,
      storeName: json['store_name'] as String?,
      pricedItemCount: _readInt(json['priced_item_count']) ?? 0,
      missingItemCount: _readInt(json['missing_item_count']) ?? 0,
      staleItemCount: _readInt(json['stale_item_count']) ?? 0,
      savingsVsBestSingleStore:
          _readDouble(json['savings_vs_best_single_store']),
      stores: _readObjectList(json['stores'])
          .map(BasketStoreOption.fromJson)
          .toList(),
      items: _readObjectList(json['items'])
          .map(BasketOptimizedItem.fromJson)
          .toList(),
      warnings: _readObjectList(json['warnings'])
          .map(BasketWarning.fromJson)
          .toList(),
    );
  }
}

class BasketStoreOption {
  const BasketStoreOption({
    required this.chainName,
    required this.storeName,
    required this.actualTotal,
    required this.items,
  });

  final String? chainName;
  final String? storeName;
  final double? actualTotal;
  final List<BasketOptimizedItem> items;

  String get displayName {
    final store = storeName?.trim() ?? '';
    if (store.isNotEmpty) {
      return store;
    }
    final chain = chainName?.trim() ?? '';
    return chain.isNotEmpty ? chain : 'Store';
  }

  factory BasketStoreOption.fromJson(Map<String, dynamic> json) {
    return BasketStoreOption(
      chainName: json['chain_name'] as String?,
      storeName: json['store_name'] as String?,
      actualTotal: _readDouble(json['actual_total']),
      items: _readObjectList(json['items'])
          .map(BasketOptimizedItem.fromJson)
          .toList(),
    );
  }
}

class BasketOptimizedItem {
  const BasketOptimizedItem({
    required this.inputText,
    required this.canonicalName,
    required this.quantity,
    required this.unitPrice,
    required this.lineTotal,
    required this.priceStatus,
    required this.warnings,
  });

  final String inputText;
  final String? canonicalName;
  final double? quantity;
  final double? unitPrice;
  final double? lineTotal;
  final String priceStatus;
  final List<BasketWarning> warnings;

  String get displayName {
    final name = canonicalName?.trim() ?? '';
    if (name.isNotEmpty) {
      return name;
    }
    return inputText.trim().isNotEmpty ? inputText.trim() : 'Item';
  }

  factory BasketOptimizedItem.fromJson(Map<String, dynamic> json) {
    return BasketOptimizedItem(
      inputText: json['input_text'] as String? ?? '',
      canonicalName: json['canonical_name'] as String?,
      quantity: _readDouble(json['quantity']),
      unitPrice: _readDouble(json['unit_price']),
      lineTotal: _readDouble(json['line_total']),
      priceStatus: json['price_status'] as String? ?? '',
      warnings: _readObjectList(json['warnings'])
          .map(BasketWarning.fromJson)
          .toList(),
    );
  }
}

class BasketWarning {
  const BasketWarning({
    required this.code,
    required this.message,
    this.inputText,
  });

  final String code;
  final String message;
  final String? inputText;

  factory BasketWarning.fromJson(Map<String, dynamic> json) {
    return BasketWarning(
      code: json['code'] as String? ?? json['type'] as String? ?? '',
      message: json['message'] as String? ?? '',
      inputText: json['input_text'] as String?,
    );
  }
}

class BasketExplanation {
  const BasketExplanation({
    required this.headline,
    required this.summaryText,
    required this.limitations,
    required this.itemNotes,
  });

  final String headline;
  final String summaryText;
  final List<BasketExplanationEntry> limitations;
  final List<BasketExplanationEntry> itemNotes;

  factory BasketExplanation.fromJson(Map<String, dynamic> json) {
    return BasketExplanation(
      headline: json['headline'] as String? ?? '',
      summaryText: json['summary_text'] as String? ?? '',
      limitations: _readObjectList(json['limitations'])
          .map(BasketExplanationEntry.fromJson)
          .toList(),
      itemNotes: _readObjectList(json['item_notes'])
          .map(BasketExplanationEntry.fromJson)
          .toList(),
    );
  }
}

class BasketExplanationEntry {
  const BasketExplanationEntry({
    required this.type,
    required this.message,
  });

  final String type;
  final String message;

  factory BasketExplanationEntry.fromJson(Map<String, dynamic> json) {
    return BasketExplanationEntry(
      type: json['type'] as String? ?? '',
      message: json['message'] as String? ?? '',
    );
  }
}

DateTime? _readDateValue(Object? value) {
  if (value == null) {
    return null;
  }

  if (value is DateTime) {
    return value;
  }

  return DateTime.tryParse(value.toString());
}

double? _readDouble(Object? value) {
  if (value == null) {
    return null;
  }

  if (value is num) {
    return value.toDouble();
  }

  return double.tryParse(value.toString());
}

int? _readInt(Object? value) {
  if (value == null) {
    return null;
  }

  if (value is num) {
    return value.toInt();
  }

  return int.tryParse(value.toString());
}

List<Map<String, dynamic>> _readObjectList(Object? value) {
  return (value as List<dynamic>? ?? <dynamic>[])
      .whereType<Map>()
      .map((entry) => Map<String, dynamic>.from(entry))
      .toList();
}

List<String> _readStringList(Object? value) {
  return (value as List<dynamic>? ?? <dynamic>[])
      .map((entry) => entry.toString().trim())
      .where((entry) => entry.isNotEmpty)
      .toList();
}

List<String> _readSavedListItems(Object? value) {
  return (value as List<dynamic>? ?? <dynamic>[])
      .map((entry) {
        if (entry is String) {
          return entry.trim();
        }
        if (entry is Map) {
          return entry['text']?.toString().trim() ?? '';
        }
        return '';
      })
      .where((entry) => entry.isNotEmpty)
      .toList();
}

Map<String, String> _readStringMap(Object? value) {
  return Map<String, dynamic>.from(value as Map? ?? const {})
      .map((key, value) => MapEntry(key, value?.toString() ?? ''))
    ..removeWhere((key, value) => value.trim().isEmpty);
}
