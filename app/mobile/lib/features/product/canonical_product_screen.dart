import 'package:flutter/material.dart';

import '../../core/models/app_models.dart';
import '../../core/services/api_client.dart';
import '../../core/services/app_dependencies.dart';
import '../../core/ui/app_spacing.dart';
import '../../core/ui/app_widgets.dart';
import '../../core/utils/formatters.dart';

class CanonicalProductScreen extends StatefulWidget {
  const CanonicalProductScreen({
    super.key,
    required this.dependencies,
    required this.canonicalProductId,
  });

  final AppDependencies dependencies;
  final String canonicalProductId;

  @override
  State<CanonicalProductScreen> createState() => _CanonicalProductScreenState();
}

class _CanonicalProductScreenState extends State<CanonicalProductScreen> {
  CanonicalProductDetail? _product;
  ProductDealCheckItem? _dealItem;
  bool _loading = true;
  bool _notFound = false;
  bool _dealUnavailable = false;
  bool _addingWatchlist = false;
  bool _watchlistAdded = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadProduct();
  }

  Future<void> _loadProduct() async {
    setState(() {
      _loading = true;
      _error = null;
      _notFound = false;
      _dealUnavailable = false;
    });

    try {
      final product = await widget.dependencies.apiClient
          .getProductById(widget.canonicalProductId);
      ProductDealCheckItem? dealItem;
      var dealUnavailable = false;

      try {
        final deals = await widget.dependencies.apiClient
            .checkProductDeals([widget.canonicalProductId]);
        dealItem = deals.itemFor(widget.canonicalProductId);
      } catch (_) {
        dealUnavailable = true;
      }

      if (!mounted) {
        return;
      }

      setState(() {
        _product = product;
        _dealItem = dealItem;
        _dealUnavailable = dealUnavailable;
        _loading = false;
      });
    } on ProductNotFoundException {
      if (!mounted) {
        return;
      }
      setState(() {
        _notFound = true;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _error = 'We could not load this product right now.';
        _loading = false;
      });
    }
  }

  Future<void> _addToWatchlist() async {
    final product = _product;
    if (product == null || _addingWatchlist) {
      return;
    }

    setState(() {
      _addingWatchlist = true;
    });

    try {
      await widget.dependencies.apiClient.addWatchlistItem(
        ownerId: widget.dependencies.anonymousUserId,
        ownerType: 'anonymous',
        canonicalProductId: product.canonicalProductId,
        label: product.displayName,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        _watchlistAdded = true;
        _addingWatchlist = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Added to watchlist.')),
      );
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _addingWatchlist = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not add to watchlist.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final title = _product?.displayName ?? 'Product';
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: AppScreen(
        child: _buildBody(context),
      ),
    );
  }

  Widget _buildBody(BuildContext context) {
    if (widget.canonicalProductId.trim().isEmpty) {
      return ListView(
        children: const [
          EmptyStateCard(
            title: 'No product selected',
            message: 'Open a product from a deal or search result.',
          ),
        ],
      );
    }

    if (_loading) {
      return ListView(
        children: const [
          SkeletonCard(height: 112),
          SizedBox(height: AppSpacing.xl),
          SkeletonCard(height: 160),
        ],
      );
    }

    if (_notFound) {
      return ListView(
        children: [
          EmptyStateCard(
            title: 'Product not found',
            message: 'We could not find ${widget.canonicalProductId}.',
          ),
        ],
      );
    }

    if (_error != null) {
      return ListView(
        children: [
          ErrorStateCard(
            message: _error!,
            onRetry: _loadProduct,
          ),
        ],
      );
    }

    final product = _product;
    if (product == null) {
      return ListView(
        children: const [
          EmptyStateCard(
            title: 'Product unavailable',
            message: 'This product could not be displayed.',
          ),
        ],
      );
    }

    return ListView(
      key: const Key('product-detail-screen'),
      children: [
        _ProductOverviewCard(product: product),
        const SizedBox(height: AppSpacing.xl),
        _ProductDealCard(
          dealItem: _dealItem,
          dealUnavailable: _dealUnavailable,
        ),
        const SizedBox(height: AppSpacing.xl),
        _ProductMetadataCard(product: product),
        const SizedBox(height: AppSpacing.xl),
        FilledButton.icon(
          key: const Key('add-product-watchlist-button'),
          onPressed:
              _addingWatchlist || _watchlistAdded ? null : _addToWatchlist,
          icon: _addingWatchlist
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.bookmark_add_outlined),
          label:
              Text(_watchlistAdded ? 'Added to watchlist' : 'Add to watchlist'),
        ),
      ],
    );
  }
}

class _ProductOverviewCard extends StatelessWidget {
  const _ProductOverviewCard({
    required this.product,
  });

  final CanonicalProductDetail product;

  @override
  Widget build(BuildContext context) {
    final category = product.enrichment.categoryPath.join(' / ');
    return AppSectionCard(
      key: const Key('product-overview-card'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            product.displayName,
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: AppSpacing.sm),
          if (category.isNotEmpty)
            Text(
              category,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          if ((product.enrichment.brand ?? '').isNotEmpty)
            Text(
              'Brand: ${product.enrichment.brand}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          if ((product.enrichment.baseProduct ?? '').isNotEmpty)
            Text(
              'Base product: ${product.enrichment.baseProduct}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
        ],
      ),
    );
  }
}

class _ProductDealCard extends StatelessWidget {
  const _ProductDealCard({
    required this.dealItem,
    required this.dealUnavailable,
  });

  final ProductDealCheckItem? dealItem;
  final bool dealUnavailable;

  @override
  Widget build(BuildContext context) {
    if (dealUnavailable) {
      return const AppSectionCard(
        key: Key('product-deal-card'),
        child: AppSectionHeader(
          title: 'Deal status unavailable',
          subtitle: 'Product details are still available.',
        ),
      );
    }

    final item = dealItem;
    if (item == null) {
      return const AppSectionCard(
        key: Key('product-deal-card'),
        child: AppSectionHeader(
          title: 'No current deal signal',
          subtitle: 'We do not have enough current price data yet.',
        ),
      );
    }

    final price = item.bestPrice?.price;
    return AppSectionCard(
      key: const Key('product-deal-card'),
      backgroundColor: const Color(0xFFEAF5EF),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppSectionHeader(
            title: _dealTitle(item.deal.dealLevel),
            subtitle: item.deal.reason.isEmpty ? null : item.deal.reason,
            trailing: price == null
                ? null
                : Text(
                    formatPrice(context, price),
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
          ),
          if ((item.bestPrice?.chainName ?? '').isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              'Best price at ${item.bestPrice!.chainName}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ],
      ),
    );
  }

  String _dealTitle(String level) {
    switch (level) {
      case 'good':
        return 'Good deal';
      case 'expensive':
        return 'Price is high';
      case 'normal':
      default:
        return 'Normal price';
    }
  }
}

class _ProductMetadataCard extends StatelessWidget {
  const _ProductMetadataCard({
    required this.product,
  });

  final CanonicalProductDetail product;

  @override
  Widget build(BuildContext context) {
    final chips = <String>[
      ...product.enrichment.flavor,
      ...product.enrichment.attributes,
      ...product.enrichment.dietTags,
      if ((product.enrichment.productForm ?? '').isNotEmpty)
        product.enrichment.productForm!,
      if ((product.enrichment.packaging ?? '').isNotEmpty)
        product.enrichment.packaging!,
      ...product.markers.values,
    ].where((value) => value.trim().isNotEmpty).toList();

    return AppSectionCard(
      key: const Key('product-metadata-card'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const AppSectionHeader(
            title: 'Product details',
            subtitle: 'Category, attributes, and useful markers.',
          ),
          if (chips.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            Wrap(
              spacing: AppSpacing.xs,
              runSpacing: AppSpacing.xs,
              children: [
                for (final chip in chips)
                  MetricBadge(
                    label: chip,
                    value: '',
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
