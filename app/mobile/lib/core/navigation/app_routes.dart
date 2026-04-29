import 'package:flutter/material.dart';

import '../../features/basket/optimize_basket_screen.dart';
import '../../features/lists/shopping_list_detail_screen.dart';
import '../../features/lists/shopping_lists_screen.dart';
import '../../features/product/canonical_product_screen.dart';
import '../../features/search/navigation_placeholder_screen.dart';
import '../../features/search/product_search_screen.dart';
import '../../features/watchlist/watchlist_screen.dart';
import '../services/app_dependencies.dart';

class AppRoutes {
  const AppRoutes._();

  static const search = '/search';
  static const watchlist = '/watchlist';
  static const lists = '/lists';
  static const listDetail = '/list_detail';
  static const optimize = '/optimize';
  static const product = '/product';

  static Route<dynamic> onGenerateRoute({
    required RouteSettings settings,
    required AppDependencies dependencies,
  }) {
    switch (settings.name) {
      case search:
        return _pageRoute(
          settings,
          _buildSearchScreen(settings.arguments, dependencies),
        );
      case watchlist:
        return _pageRoute(
          settings,
          WatchlistScreen(dependencies: dependencies),
        );
      case lists:
        return _pageRoute(
          settings,
          ShoppingListsScreen(dependencies: dependencies),
        );
      case listDetail:
        return _pageRoute(
          settings,
          _buildListDetailScreen(settings.arguments, dependencies),
        );
      case optimize:
        return _pageRoute(
          settings,
          _buildOptimizeScreen(settings.arguments, dependencies),
        );
      case product:
        return _pageRoute(
          settings,
          _buildProductScreen(settings.arguments, dependencies),
        );
      default:
        return _pageRoute(
          settings,
          const NavigationPlaceholderScreen(
            key: Key('route-unknown-screen'),
            title: 'Not Found',
            message: 'This destination is not available yet.',
          ),
        );
    }
  }

  static MaterialPageRoute<void> _pageRoute(
    RouteSettings settings,
    Widget child,
  ) {
    return MaterialPageRoute<void>(
      settings: settings,
      builder: (_) => child,
    );
  }

  static Widget _buildListDetailScreen(
    Object? arguments,
    AppDependencies dependencies,
  ) {
    final values = _readArguments(arguments);
    final listId =
        values['listId']?.toString() ?? values['list_id']?.toString() ?? '';
    if (listId.isEmpty) {
      return const NavigationPlaceholderScreen(
        key: Key('route-list-detail-screen'),
        title: 'List Detail',
        message: 'No saved list was selected.',
      );
    }

    return ShoppingListDetailScreen(
      key: const Key('route-list-detail-screen'),
      dependencies: dependencies,
      listId: listId,
      initialName: values['name']?.toString(),
    );
  }

  static Widget _buildSearchScreen(
    Object? arguments,
    AppDependencies dependencies,
  ) {
    final values = _readArguments(arguments);
    final query = values['query']?.toString().trim() ?? '';

    return ProductSearchScreen(
      key: const Key('route-search-screen'),
      dependencies: dependencies,
      initialQuery: query,
    );
  }

  static Widget _buildOptimizeScreen(
    Object? arguments,
    AppDependencies dependencies,
  ) {
    final values = _readArguments(arguments);
    final items = _readStringList(values['items']);

    return OptimizeBasketScreen(
      key: const Key('route-optimize-screen'),
      dependencies: dependencies,
      initialItems: items,
    );
  }

  static Widget _buildProductScreen(
    Object? arguments,
    AppDependencies dependencies,
  ) {
    final values = _readArguments(arguments);
    final productId = values['canonicalProductId']?.toString() ??
        values['canonical_product_id']?.toString() ??
        values['id']?.toString() ??
        '';

    return CanonicalProductScreen(
      key: const Key('route-product-screen'),
      dependencies: dependencies,
      canonicalProductId: productId,
    );
  }

  static Map<String, Object?> _readArguments(Object? arguments) {
    if (arguments is Map) {
      return Map<String, Object?>.from(arguments);
    }
    return const <String, Object?>{};
  }

  static List<String> _readStringList(Object? value) {
    if (value is List) {
      return value
          .map((item) => item.toString().trim())
          .where((item) => item.isNotEmpty)
          .toList();
    }
    return const <String>[];
  }
}
