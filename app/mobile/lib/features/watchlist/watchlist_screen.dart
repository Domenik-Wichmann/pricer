import 'package:flutter/material.dart';
import 'package:pricer_mobile/src/generated/l10n/app_localizations.dart';

import '../../core/models/app_models.dart';
import '../../core/navigation/app_routes.dart';
import '../../core/services/app_dependencies.dart';
import '../../core/ui/app_spacing.dart';
import '../../core/ui/app_widgets.dart';
import '../../core/utils/formatters.dart';

class WatchlistScreen extends StatefulWidget {
  const WatchlistScreen({
    super.key,
    required this.dependencies,
    this.active = true,
  });

  final AppDependencies dependencies;
  final bool active;

  @override
  State<WatchlistScreen> createState() => _WatchlistScreenState();
}

class _WatchlistScreenState extends State<WatchlistScreen> {
  bool _loading = true;
  bool _loadedOnce = false;
  String? _error;
  List<WatchlistPriceItem> _items = const <WatchlistPriceItem>[];
  final Set<String> _removing = <String>{};

  @override
  void initState() {
    super.initState();
    if (widget.active) {
      _load();
    } else {
      _loading = false;
    }
  }

  @override
  void didUpdateWidget(covariant WatchlistScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.active && !oldWidget.active && !_loadedOnce) {
      _load();
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final response = await widget.dependencies.apiClient.getWatchlistPrices(
        ownerId: widget.dependencies.anonymousUserId,
        ownerType: 'anonymous',
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _items = response.items;
        _loading = false;
        _loadedOnce = true;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _loading = false;
        _loadedOnce = true;
        _error = 'Could not load watchlist prices.';
      });
    }
  }

  Future<void> _removeItem(WatchlistPriceItem item) async {
    if (item.watchId.isEmpty || _removing.contains(item.watchId)) {
      return;
    }
    setState(() {
      _removing.add(item.watchId);
    });

    try {
      await widget.dependencies.apiClient.removeWatchlistItem(
        ownerId: widget.dependencies.anonymousUserId,
        ownerType: 'anonymous',
        watchId: item.watchId,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _items = _items
            .where((candidate) => candidate.watchId != item.watchId)
            .toList();
        _removing.remove(item.watchId);
      });
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _removing.remove(item.watchId);
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not remove watchlist item.')),
      );
    }
  }

  void _openProduct(WatchlistPriceItem item) {
    if (item.canonicalProductId.isEmpty) {
      return;
    }
    Navigator.of(context).pushNamed(
      AppRoutes.product,
      arguments: {'canonicalProductId': item.canonicalProductId},
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.watchlistTitle),
      ),
      body: StreamBuilder<MonetizationProfile>(
        stream: widget.active
            ? widget.dependencies.monetizationService.watchProfile()
            : null,
        initialData:
            MonetizationProfile.free(widget.dependencies.anonymousUserId),
        builder: (context, monetizationSnapshot) {
          final profile = monetizationSnapshot.data ??
              MonetizationProfile.free(widget.dependencies.anonymousUserId);
          return AppScreen(
            child: ListView(
              key: const Key('watchlist-screen'),
              children: [
                if (!profile.alertsEnabled) ...[
                  AppSectionCard(
                    key: const Key('watchlist-premium-card'),
                    backgroundColor: const Color(0xFFFFF4D9),
                    child: AppSectionHeader(
                      title: l10n.watchlistPremiumTitle,
                      subtitle: l10n.watchlistPremiumMessage,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xl),
                ],
                _WatchlistSummaryCard(items: _items),
                const SizedBox(height: AppSpacing.xl),
                ..._buildBody(context),
                const SizedBox(height: AppSpacing.xl),
                Center(
                  child: widget.dependencies.adService.bannerSlot(
                    key: const Key('watchlist-banner-ad'),
                    enabled: profile.adsEnabled,
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  List<Widget> _buildBody(BuildContext context) {
    if (_loading) {
      return const [
        SkeletonCard(key: Key('watchlist-loading-state'), height: 96),
        SizedBox(height: AppSpacing.md),
        SkeletonCard(height: 84),
      ];
    }

    final error = _error;
    if (error != null) {
      return [
        ErrorStateCard(
          key: const Key('watchlist-error-state'),
          message: error,
          onRetry: _load,
        ),
      ];
    }

    if (_items.isEmpty) {
      return [
        EmptyStateCard(
          key: const Key('watchlist-empty-state'),
          title: 'No watched products yet',
          message: 'Watch products to track prices and deals.',
          actionLabel: 'Search products',
          onAction: () => Navigator.of(context).pushNamed(AppRoutes.search),
        ),
      ];
    }

    return [
      for (final item in _items) ...[
        _WatchlistPriceCard(
          item: item,
          removing: _removing.contains(item.watchId),
          onTap: () => _openProduct(item),
          onRemove: () => _removeItem(item),
        ),
        const SizedBox(height: AppSpacing.md),
      ],
    ];
  }
}

class _WatchlistSummaryCard extends StatelessWidget {
  const _WatchlistSummaryCard({
    required this.items,
  });

  final List<WatchlistPriceItem> items;

  @override
  Widget build(BuildContext context) {
    final targetHits = items.where((item) => item.targetHit).length;
    final priced = items.where((item) => item.hasBestPrice).length;

    return AppSectionCard(
      key: const Key('watchlist-drops-summary'),
      backgroundColor: const Color(0xFFEAF5EF),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const AppSectionHeader(
            title: 'Drops summary',
            subtitle: 'Tracked prices and target hits.',
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            items.isEmpty
                ? 'No tracked items yet.'
                : '$targetHits target hit${targetHits == 1 ? '' : 's'} across ${items.length} watched product${items.length == 1 ? '' : 's'}.',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: AppSpacing.xs),
          Text('$priced with current prices.'),
        ],
      ),
    );
  }
}

class _WatchlistPriceCard extends StatelessWidget {
  const _WatchlistPriceCard({
    required this.item,
    required this.removing,
    required this.onTap,
    required this.onRemove,
  });

  final WatchlistPriceItem item;
  final bool removing;
  final VoidCallback onTap;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final bestPrice = item.price.bestPrice;
    final chain = [
      bestPrice?.chainName,
      bestPrice?.storeName,
    ].whereType<String>().where((value) => value.trim().isNotEmpty).join(' / ');
    final unitPriceLabel = formatUnitPrice(
      context,
      price: bestPrice?.pricePerComparisonBasis,
      comparisonBasis: bestPrice?.comparisonBasis,
    );

    return InkWell(
      key: Key('watchlist-price-card-${item.watchId}'),
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: AppSectionCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AppSectionHeader(
              title: item.displayName,
              subtitle: chain.isEmpty ? null : chain,
              trailing: IconButton(
                key: Key('remove-watch-${item.watchId}'),
                tooltip: 'Remove',
                onPressed: removing ? null : onRemove,
                icon: removing
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.close),
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                if (bestPrice?.price == null)
                  const MetricBadge(
                    label: 'Price',
                    value: 'missing',
                    icon: Icons.help_outline,
                  )
                else
                  MetricBadge(
                    label: 'Best price',
                    value: formatPrice(context, bestPrice!.price!),
                    icon: Icons.sell_outlined,
                  ),
                if (unitPriceLabel != null)
                  MetricBadge(
                    label: 'Unit',
                    value: unitPriceLabel,
                    icon: Icons.straighten,
                  ),
                _DealBadge(level: item.dealLevel),
                if (item.targetHit)
                  const MetricBadge(
                    label: 'Target',
                    value: 'hit',
                    color: Color(0xFFCDEBDD),
                    icon: Icons.flag_outlined,
                  ),
              ],
            ),
            if (item.targetPrice != null) ...[
              const SizedBox(height: AppSpacing.sm),
              Text('Target ${formatPrice(context, item.targetPrice!)}'),
            ],
          ],
        ),
      ),
    );
  }
}

class _DealBadge extends StatelessWidget {
  const _DealBadge({
    required this.level,
  });

  final String level;

  @override
  Widget build(BuildContext context) {
    late final Color color;
    late final IconData icon;
    switch (level) {
      case 'good':
        color = const Color(0xFFCDEBDD);
        icon = Icons.trending_down;
        break;
      case 'expensive':
        color = const Color(0xFFFFE1C2);
        icon = Icons.trending_up;
        break;
      default:
        color = Theme.of(context).colorScheme.surfaceContainerHighest;
        icon = Icons.remove;
    }

    return MetricBadge(
      label: 'Deal',
      value: level,
      color: color,
      icon: icon,
    );
  }
}
