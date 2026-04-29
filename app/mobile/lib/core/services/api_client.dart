import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/app_models.dart';

class QueryApiClient {
  QueryApiClient({
    required this.baseUrl,
    http.Client? httpClient,
    this.requestTimeout = const Duration(seconds: 10),
  }) : _httpClient = httpClient ?? http.Client();

  final String baseUrl;
  final http.Client _httpClient;
  final Duration requestTimeout;

  Future<QueryResponse> query(String query) async {
    final response = await _post(
      Uri.parse('$baseUrl/query'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({'query': query}),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw QueryApiException(
          'Query request failed with ${response.statusCode}.');
    }

    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    return QueryResponse.fromJson(decoded);
  }

  Future<List<ProductHistoryPoint>> getProductHistory(
      String sourceProductId) async {
    final response =
        await _get(Uri.parse('$baseUrl/product/$sourceProductId/history'));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw QueryApiException(
          'History request failed with ${response.statusCode}.');
    }

    final decoded = jsonDecode(response.body);
    final rows = (decoded as List<dynamic>).whereType<Map<String, dynamic>>();
    return rows.map(ProductHistoryPoint.fromJson).toList();
  }

  Future<HomeSummary> getHomeSummary({
    required String ownerId,
    String ownerType = 'anonymous',
  }) async {
    final response = await _get(
      Uri.parse('$baseUrl/home/summary'),
      headers: {
        'x-pricer-owner-id': ownerId,
        'x-pricer-owner-type': ownerType,
      },
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw QueryApiException(
          'Home summary request failed with ${response.statusCode}.');
    }

    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    return HomeSummary.fromJson(decoded);
  }

  Future<SavedListsResponse> getSavedLists({
    required String ownerId,
    String ownerType = 'anonymous',
  }) async {
    final response = await _get(
      Uri.parse('$baseUrl/lists'),
      headers: {
        'x-pricer-owner-id': ownerId,
        'x-pricer-owner-type': ownerType,
      },
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw QueryApiException(
          'Saved lists request failed with ${response.statusCode}.');
    }

    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    return SavedListsResponse.fromJson(decoded);
  }

  Future<SavedListDetail> createSavedList({
    required String ownerId,
    String ownerType = 'anonymous',
    required String name,
    required List<String> items,
  }) async {
    final response = await _post(
      Uri.parse('$baseUrl/lists'),
      headers: {
        'content-type': 'application/json',
        'x-pricer-owner-id': ownerId,
        'x-pricer-owner-type': ownerType,
      },
      body: jsonEncode({
        'name': name,
        'items': items,
      }),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw QueryApiException(
          'Create saved list request failed with ${response.statusCode}.');
    }

    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    return SavedListDetail.fromJson(decoded);
  }

  Future<SavedListDetail> getSavedList({
    required String ownerId,
    String ownerType = 'anonymous',
    required String listId,
  }) async {
    final response = await _get(
      Uri.parse('$baseUrl/lists/$listId'),
      headers: {
        'x-pricer-owner-id': ownerId,
        'x-pricer-owner-type': ownerType,
      },
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw QueryApiException(
          'Saved list request failed with ${response.statusCode}.');
    }

    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    return SavedListDetail.fromJson(decoded);
  }

  Future<SavedListDetail> updateSavedList({
    required String ownerId,
    String ownerType = 'anonymous',
    required String listId,
    required String name,
    required List<String> items,
  }) async {
    final response = await _patch(
      Uri.parse('$baseUrl/lists/$listId'),
      headers: {
        'content-type': 'application/json',
        'x-pricer-owner-id': ownerId,
        'x-pricer-owner-type': ownerType,
      },
      body: jsonEncode({
        'name': name,
        'items': items,
      }),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw QueryApiException(
          'Update saved list request failed with ${response.statusCode}.');
    }

    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    return SavedListDetail.fromJson(decoded);
  }

  Future<void> deleteSavedList({
    required String ownerId,
    String ownerType = 'anonymous',
    required String listId,
  }) async {
    final response = await _delete(
      Uri.parse('$baseUrl/lists/$listId'),
      headers: {
        'x-pricer-owner-id': ownerId,
        'x-pricer-owner-type': ownerType,
      },
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw QueryApiException(
          'Delete saved list request failed with ${response.statusCode}.');
    }
  }

  Future<ProductSearchResponse> searchProducts({
    required String query,
    int limit = 25,
    int offset = 0,
  }) async {
    final response = await _post(
      Uri.parse('$baseUrl/products/search'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({
        'query': query,
        'layer_mode': 'canonical_with_enrichment',
        'limit': limit,
        'offset': offset,
      }),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw QueryApiException(
          'Product search request failed with ${response.statusCode}.');
    }

    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    return ProductSearchResponse.fromJson(decoded);
  }

  Future<SavedUserLocationsResponse> getSavedUserLocations({
    required String ownerId,
    String ownerType = 'anonymous',
  }) async {
    final response = await _get(
      Uri.parse('$baseUrl/user/locations'),
      headers: {
        'x-pricer-owner-id': ownerId,
        'x-pricer-owner-type': ownerType,
      },
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw QueryApiException(
          'Saved locations request failed with ${response.statusCode}.');
    }

    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    return SavedUserLocationsResponse.fromJson(decoded);
  }

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
    final body = jsonEncode({
      'label': label,
      'display_name': displayName,
      if (addressRaw != null && addressRaw.trim().isNotEmpty)
        'address_raw': addressRaw.trim(),
      'latitude': latitude,
      'longitude': longitude,
      'default_radius_km': defaultRadiusKm,
      'default_sort': defaultSort,
      'source': source,
      'is_default': isDefault,
      if (provider != null && provider.trim().isNotEmpty)
        'provider': provider.trim(),
      if (providerPlaceId != null && providerPlaceId.trim().isNotEmpty)
        'provider_place_id': providerPlaceId.trim(),
      if (formattedAddress != null && formattedAddress.trim().isNotEmpty)
        'formatted_address': formattedAddress.trim(),
      if (confidence != null) 'confidence': confidence,
      if (confidenceReason != null && confidenceReason.trim().isNotEmpty)
        'confidence_reason': confidenceReason.trim(),
      if (provenance != null && provenance.isNotEmpty) 'provenance': provenance,
    });
    final response = locationId == null || locationId.trim().isEmpty
        ? await _post(
            Uri.parse('$baseUrl/user/locations'),
            headers: {
              'content-type': 'application/json',
              'x-pricer-owner-id': ownerId,
              'x-pricer-owner-type': ownerType,
            },
            body: body,
          )
        : await _patch(
            Uri.parse('$baseUrl/user/locations/$locationId'),
            headers: {
              'content-type': 'application/json',
              'x-pricer-owner-id': ownerId,
              'x-pricer-owner-type': ownerType,
            },
            body: body,
          );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw QueryApiException(
          'Save location request failed with ${response.statusCode}.');
    }

    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    return SavedUserLocation.fromJson(
      Map<String, dynamic>.from(decoded['location'] as Map? ?? decoded),
    );
  }

  Future<ManualAddressGeocodeResponse> geocodeManualAddress({
    required String ownerId,
    String ownerType = 'anonymous',
    required String addressRaw,
    String? city,
    String country = 'BG',
    String? displayName,
  }) async {
    final response = await _post(
      Uri.parse('$baseUrl/user/locations/geocode-address'),
      headers: {
        'content-type': 'application/json',
        'x-pricer-owner-id': ownerId,
        'x-pricer-owner-type': ownerType,
      },
      body: jsonEncode({
        'address_raw': addressRaw.trim(),
        if (city != null && city.trim().isNotEmpty) 'city': city.trim(),
        if (country.trim().isNotEmpty) 'country': country.trim(),
        if (displayName != null && displayName.trim().isNotEmpty)
          'display_name': displayName.trim(),
      }),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw QueryApiException(
          'Manual address geocode request failed with ${response.statusCode}.');
    }

    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    return ManualAddressGeocodeResponse.fromJson(decoded);
  }

  Future<void> deleteSavedUserLocation({
    required String ownerId,
    String ownerType = 'anonymous',
    required String locationId,
  }) async {
    final response = await _delete(
      Uri.parse('$baseUrl/user/locations/$locationId'),
      headers: {
        'x-pricer-owner-id': ownerId,
        'x-pricer-owner-type': ownerType,
      },
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw QueryApiException(
          'Delete location request failed with ${response.statusCode}.');
    }
  }

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
    final response = await _post(
      Uri.parse('$baseUrl/products/nearest-availability'),
      headers: {
        'content-type': 'application/json',
        'x-pricer-owner-id': ownerId,
        'x-pricer-owner-type': ownerType,
      },
      body: jsonEncode({
        if (canonicalProductId != null && canonicalProductId.trim().isNotEmpty)
          'canonical_product_id': canonicalProductId.trim(),
        if (query != null && query.trim().isNotEmpty) 'query': query.trim(),
        if (latitude != null) 'latitude': latitude,
        if (longitude != null) 'longitude': longitude,
        if (savedLocationId != null && savedLocationId.trim().isNotEmpty)
          'saved_location_id': savedLocationId.trim(),
        if (label != null && label.trim().isNotEmpty) 'label': label.trim(),
        if (radiusKm != null) 'radius_km': radiusKm,
        'sort': sort,
        'limit': limit,
      }),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw QueryApiException(
          'Nearest availability request failed with ${response.statusCode}.');
    }

    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    return NearestAvailabilityResponse.fromJson(decoded);
  }

  Future<BasketOptimizationResponse> optimizeBasket({
    required List<String> items,
    String strategy = 'multi_store',
    bool includeExplanation = true,
    bool includeConvenienceScoring = false,
  }) async {
    final response = await _post(
      Uri.parse('$baseUrl/basket/optimize'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({
        'items': items,
        'layer_mode': 'canonical_with_enrichment',
        'optimizer_options': {
          'strategy': strategy,
          'include_explanation': includeExplanation,
          'include_convenience_scoring': includeConvenienceScoring,
        },
        if (includeConvenienceScoring)
          'user_context': {'single_store_preferred': true},
      }),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw QueryApiException(
          'Basket optimization request failed with ${response.statusCode}.');
    }

    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    return BasketOptimizationResponse.fromJson(decoded);
  }

  Future<CanonicalProductDetail> getProductById(
      String canonicalProductId) async {
    final response =
        await _get(Uri.parse('$baseUrl/products/$canonicalProductId'));

    if (response.statusCode == 404) {
      throw ProductNotFoundException(canonicalProductId);
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw QueryApiException(
          'Product request failed with ${response.statusCode}.');
    }

    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    return CanonicalProductDetail.fromJson(decoded);
  }

  Future<ProductDealCheckResult> checkProductDeals(
    List<String> canonicalProductIds,
  ) async {
    final response = await _post(
      Uri.parse('$baseUrl/products/deal-check'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({'canonical_product_ids': canonicalProductIds}),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw QueryApiException(
          'Deal check request failed with ${response.statusCode}.');
    }

    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    return ProductDealCheckResult.fromJson(decoded);
  }

  Future<WatchlistAddResult> addWatchlistItem({
    required String ownerId,
    String ownerType = 'anonymous',
    required String canonicalProductId,
    String? label,
  }) async {
    final response = await _post(
      Uri.parse('$baseUrl/watchlist'),
      headers: {
        'content-type': 'application/json',
        'x-pricer-owner-id': ownerId,
        'x-pricer-owner-type': ownerType,
      },
      body: jsonEncode({
        'canonical_product_id': canonicalProductId,
        if (label != null && label.trim().isNotEmpty) 'label': label.trim(),
      }),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw QueryApiException(
          'Watchlist request failed with ${response.statusCode}.');
    }

    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    return WatchlistAddResult.fromJson(decoded);
  }

  Future<WatchlistPriceViewResponse> getWatchlistPrices({
    required String ownerId,
    String ownerType = 'anonymous',
  }) async {
    final response = await _get(
      Uri.parse('$baseUrl/watchlist/prices'),
      headers: {
        'x-pricer-owner-id': ownerId,
        'x-pricer-owner-type': ownerType,
      },
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw QueryApiException(
          'Watchlist prices request failed with ${response.statusCode}.');
    }

    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    return WatchlistPriceViewResponse.fromJson(decoded);
  }

  Future<void> removeWatchlistItem({
    required String ownerId,
    String ownerType = 'anonymous',
    required String watchId,
  }) async {
    final response = await _delete(
      Uri.parse('$baseUrl/watchlist/$watchId'),
      headers: {
        'x-pricer-owner-id': ownerId,
        'x-pricer-owner-type': ownerType,
      },
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw QueryApiException(
          'Watchlist delete request failed with ${response.statusCode}.');
    }
  }

  Future<http.Response> _get(
    Uri uri, {
    Map<String, String>? headers,
  }) {
    return _httpClient.get(uri, headers: headers).timeout(requestTimeout);
  }

  Future<http.Response> _post(
    Uri uri, {
    Map<String, String>? headers,
    Object? body,
  }) {
    return _httpClient
        .post(uri, headers: headers, body: body)
        .timeout(requestTimeout);
  }

  Future<http.Response> _patch(
    Uri uri, {
    Map<String, String>? headers,
    Object? body,
  }) {
    return _httpClient
        .patch(uri, headers: headers, body: body)
        .timeout(requestTimeout);
  }

  Future<http.Response> _delete(
    Uri uri, {
    Map<String, String>? headers,
  }) {
    return _httpClient.delete(uri, headers: headers).timeout(requestTimeout);
  }
}

class QueryApiException implements Exception {
  QueryApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class ProductNotFoundException extends QueryApiException {
  ProductNotFoundException(this.productId)
      : super('Product $productId was not found.');

  final String productId;
}
