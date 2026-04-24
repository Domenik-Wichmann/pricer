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
