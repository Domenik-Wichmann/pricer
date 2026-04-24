import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/app_models.dart';

class QueryApiClient {
  QueryApiClient({
    required this.baseUrl,
    http.Client? httpClient,
  }) : _httpClient = httpClient ?? http.Client();

  final String baseUrl;
  final http.Client _httpClient;

  Future<QueryResponse> query(String query) async {
    final response = await _httpClient.post(
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
    final response = await _httpClient
        .get(Uri.parse('$baseUrl/product/$sourceProductId/history'));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw QueryApiException(
          'History request failed with ${response.statusCode}.');
    }

    final decoded = jsonDecode(response.body);
    final rows = (decoded as List<dynamic>).whereType<Map<String, dynamic>>();
    return rows.map(ProductHistoryPoint.fromJson).toList();
  }
}

class QueryApiException implements Exception {
  QueryApiException(this.message);

  final String message;

  @override
  String toString() => message;
}
