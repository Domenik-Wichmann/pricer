import 'package:flutter/material.dart';
import 'package:pricer_mobile/src/generated/l10n/app_localizations.dart';

import '../../core/models/app_models.dart';
import '../../core/navigation/app_routes.dart';
import '../../core/services/app_dependencies.dart';
import '../../core/ui/app_spacing.dart';
import '../../core/ui/app_widgets.dart';
import '../../core/utils/formatters.dart';
import '../lists/shopping_list_detail_screen.dart';
import '../monetization/paywall_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    required this.dependencies,
  });

  final AppDependencies dependencies;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final TextEditingController _controller = TextEditingController();
  bool _recentSearchesLoading = true;
  bool _homeSummaryLoading = true;
  String? _homeSummaryError;
  HomeSummary? _homeSummary;
  List<String> _recentSearches = const <String>[];
  bool _homeStreamsEnabled = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _homeStreamsEnabled = true;
      });
    });
    _loadRecentSearches();
    _loadHomeSummary();
  }

  @override
  void didUpdateWidget(covariant HomeScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.dependencies != widget.dependencies) {
      _loadRecentSearches();
      _loadHomeSummary();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _loadRecentSearches() async {
    final values =
        await widget.dependencies.recentActivityService.loadRecentSearches();
    if (!mounted) {
      return;
    }

    setState(() {
      _recentSearches = values;
      _recentSearchesLoading = false;
    });
  }

  Future<void> _loadHomeSummary() async {
    setState(() {
      _homeSummaryLoading = true;
      _homeSummaryError = null;
    });

    try {
      final summary = await widget.dependencies.apiClient.getHomeSummary(
        ownerId: widget.dependencies.anonymousUserId,
        ownerType: 'anonymous',
      );
      if (!mounted) {
        return;
      }

      setState(() {
        _homeSummary = summary;
        _homeSummaryLoading = false;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _homeSummaryLoading = false;
        _homeSummaryError = 'We could not load your home summary right now.';
      });
    }
  }

  List<String> _parseDraftBasketItems(String value) {
    return value
        .split(RegExp(r'[,\n]'))
        .map((item) => item.trim())
        .where((item) => item.isNotEmpty)
        .toList();
  }

  void _submitHomeSearch([String? overrideQuery]) {
    final query = (overrideQuery ?? _controller.text).trim();
    if (query.isEmpty) {
      return;
    }

    Navigator.of(context).pushNamed(
      AppRoutes.search,
      arguments: {'query': query},
    );
  }

  void _submitDraftBasket() {
    final items = _parseDraftBasketItems(_controller.text);
    if (items.isEmpty) {
      return;
    }

    Navigator.of(context).pushNamed(
      AppRoutes.optimize,
      arguments: {'items': items},
    );
  }

  Future<void> _captureVoice() async {
    final words = await widget.dependencies.voiceInputService.captureOnce();
    if (words == null || words.trim().isEmpty) {
      return;
    }

    _controller.text = words;
    _submitHomeSearch(words);
  }

  String _buildInsightHeadline({
    required AppLocalizations l10n,
    required int dropCount,
    required List<ShoppingListModel> lists,
  }) {
    if (dropCount > 0) {
      return l10n.watchlistDropsReady(dropCount);
    }

    if (lists.isNotEmpty) {
      return l10n.rerunListInsight(lists.first.name);
    }

    if (_recentSearches.isNotEmpty) {
      return l10n.rerunSearchInsight(_recentSearches.first);
    }

    return l10n.searchStapleInsight;
  }

  String _buildInsightCaption({
    required AppLocalizations l10n,
    required int watchCount,
    required int dropCount,
  }) {
    if (dropCount > 0) {
      return l10n.watchlistDropsCaption;
    }

    if (watchCount > 0) {
      return l10n.watchlistReadyCaption(watchCount);
    }

    return l10n.recentRerunCaption;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return StreamBuilder<List<WatchlistEntry>>(
      stream: _homeStreamsEnabled
          ? widget.dependencies.watchlistRepository.watchEntries()
          : null,
      initialData: const <WatchlistEntry>[],
      builder: (context, watchSnapshot) {
        return StreamBuilder<List<ShoppingListModel>>(
          stream: _homeStreamsEnabled
              ? widget.dependencies.shoppingListsRepository.watchLists()
              : null,
          initialData: const <ShoppingListModel>[],
          builder: (context, listSnapshot) {
            return StreamBuilder<MonetizationProfile>(
              stream: _homeStreamsEnabled
                  ? widget.dependencies.monetizationService.watchProfile()
                  : null,
              initialData:
                  MonetizationProfile.free(widget.dependencies.anonymousUserId),
              builder: (context, monetizationSnapshot) {
                final watchEntries =
                    watchSnapshot.data ?? const <WatchlistEntry>[];
                final recentLists =
                    listSnapshot.data ?? const <ShoppingListModel>[];
                final profile = monetizationSnapshot.data ??
                    MonetizationProfile.free(
                        widget.dependencies.anonymousUserId);
                final dropCount = watchEntries.where((entry) {
                  if (entry.targetPrice == null || entry.currentPrice == null) {
                    return false;
                  }

                  return entry.currentPrice! <= entry.targetPrice!;
                }).length;

                return AppScreen(
                  child: ListView(
                    children: [
                      Text(
                        l10n.appTitle,
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                      const SizedBox(height: AppSpacing.xs),
                      Text(
                        l10n.homeTagline,
                        style: Theme.of(context).textTheme.bodyLarge,
                      ),
                      const SizedBox(height: AppSpacing.lg),
                      HomeSearchBar(
                        key: const Key('home-search-entry-card'),
                        controller: _controller,
                        onSubmitted: _submitHomeSearch,
                        onVoice: _captureVoice,
                        actions: Wrap(
                          spacing: AppSpacing.sm,
                          runSpacing: AppSpacing.sm,
                          children: [
                            FilledButton.icon(
                              key: const Key('search-button'),
                              onPressed: () => _submitHomeSearch(),
                              icon: const Icon(Icons.search),
                              label: Text(l10n.searchButton),
                            ),
                            OutlinedButton.icon(
                              key: const Key('add-basket-button'),
                              onPressed: _submitDraftBasket,
                              icon: const Icon(Icons.playlist_add),
                              label: const Text('Add to basket'),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: AppSpacing.xl),
                      QuickInsightCard(
                        headline: _buildInsightHeadline(
                          l10n: l10n,
                          dropCount: dropCount,
                          lists: recentLists,
                        ),
                        caption: _buildInsightCaption(
                          l10n: l10n,
                          watchCount: watchEntries.length,
                          dropCount: dropCount,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.xl),
                      ..._buildHomeSummarySections(),
                      if (_homeSummaryLoading ||
                          _homeSummaryError != null ||
                          _hasHomeSummaryContent(_homeSummary))
                        const SizedBox(height: AppSpacing.xl),
                      AppSectionCard(
                        key: const Key('premium-home-card'),
                        backgroundColor: profile.premiumActive
                            ? const Color(0xFFEAF5EF)
                            : const Color(0xFFFFF4D9),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            AppSectionHeader(
                              title: profile.premiumActive
                                  ? l10n.premiumActiveHomeTitle
                                  : l10n.premiumHomeTitle,
                              subtitle: profile.premiumActive
                                  ? l10n.premiumActiveHomeSubtitle
                                  : l10n.premiumHomeSubtitle,
                            ),
                            const SizedBox(height: AppSpacing.md),
                            FilledButton.tonal(
                              key: const Key('open-paywall-button'),
                              onPressed: () {
                                Navigator.of(context).push(
                                  MaterialPageRoute<void>(
                                    builder: (_) => PaywallScreen(
                                      dependencies: widget.dependencies,
                                    ),
                                  ),
                                );
                              },
                              child: Text(
                                profile.premiumActive
                                    ? l10n.managePlanButton
                                    : l10n.viewPremiumButton,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: AppSpacing.lg),
                      AppSectionCard(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            AppSectionHeader(
                              title: l10n.recentSearchesTitle,
                              subtitle: l10n.recentSearchesSubtitle,
                            ),
                            const SizedBox(height: AppSpacing.md),
                            if (_recentSearchesLoading)
                              const SkeletonCard(height: 56)
                            else if (_recentSearches.isEmpty)
                              EmptyStateCard(
                                title: l10n.recentSearchesEmptyTitle,
                                message: l10n.recentSearchesEmptyMessage,
                                actionLabel: l10n.recentSearchesSampleAction,
                                onAction: () {
                                  _controller.text = 'евтино мляко';
                                },
                              )
                            else
                              Wrap(
                                key: const Key('recent-searches'),
                                spacing: AppSpacing.xs,
                                runSpacing: AppSpacing.xs,
                                children: [
                                  for (final query in _recentSearches)
                                    ActionChip(
                                      label: Text(query),
                                      onPressed: () {
                                        _controller.text = query;
                                        _submitHomeSearch(query);
                                      },
                                    ),
                                ],
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(height: AppSpacing.lg),
                      AppSectionCard(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            AppSectionHeader(
                              title: l10n.recentListsTitle,
                              subtitle: l10n.recentListsSubtitle,
                            ),
                            const SizedBox(height: AppSpacing.md),
                            if (listSnapshot.connectionState ==
                                ConnectionState.waiting)
                              const SkeletonCard(height: 72)
                            else if (recentLists.isEmpty)
                              EmptyStateCard(
                                title: l10n.recentListsEmptyTitle,
                                message: l10n.recentListsEmptyMessage,
                              )
                            else
                              Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  for (final shoppingList
                                      in recentLists.take(3)) ...[
                                    ListTile(
                                      contentPadding: EdgeInsets.zero,
                                      title: Text(shoppingList.name),
                                      subtitle: Text(l10n
                                          .qtyLabel(shoppingList.itemCount)),
                                      trailing: OutlinedButton(
                                        onPressed: () {
                                          Navigator.of(context).push(
                                            MaterialPageRoute<void>(
                                              builder: (_) =>
                                                  ShoppingListDetailScreen(
                                                dependencies:
                                                    widget.dependencies,
                                                listId: shoppingList.id,
                                                initialName: shoppingList.name,
                                              ),
                                            ),
                                          );
                                        },
                                        child: Text(l10n.rerunButton),
                                      ),
                                    ),
                                    if (shoppingList !=
                                        recentLists.take(3).last)
                                      const Divider(height: 1),
                                  ],
                                ],
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(height: AppSpacing.lg),
                      AppSectionCard(
                        child: Text(
                          widget.dependencies.firestoreConfigured
                              ? l10n.firestoreConnectedStatus
                              : widget.dependencies.firestoreStatus
                                      .contains('bootstrap failed')
                                  ? l10n.firestoreBootstrapFailedStatus
                                  : l10n.firestoreNotConfiguredStatus,
                          key: const Key('firestore-status'),
                        ),
                      ),
                      const SizedBox(height: AppSpacing.lg),
                      Center(
                        child: widget.dependencies.adService.bannerSlot(
                          key: const Key('home-banner-ad'),
                          enabled: profile.adsEnabled,
                        ),
                      ),
                    ],
                  ),
                );
              },
            );
          },
        );
      },
    );
  }

  bool _hasHomeSummaryContent(HomeSummary? summary) {
    if (summary == null) {
      return false;
    }
    return summary.hasAnyDynamicSection || summary.quickActions.isNotEmpty;
  }

  List<Widget> _buildHomeSummarySections() {
    if (_homeSummaryLoading) {
      return [
        const SkeletonCard(
          key: Key('home-summary-loading'),
          height: 120,
        ),
      ];
    }

    if (_homeSummaryError != null) {
      return [
        ErrorStateCard(
          key: const Key('home-summary-error'),
          message: _homeSummaryError!,
          onRetry: _loadHomeSummary,
        ),
      ];
    }

    final summary = _homeSummary;
    if (summary == null) {
      return const <Widget>[];
    }

    final sections = <Widget>[];
    if (summary.topDeals.isNotEmpty) {
      sections.add(_HomeTopDealsSection(
        deals: summary.topDeals.take(4).toList(),
        onDealTap: _openDeal,
      ));
    }
    if (summary.watchlistHighlights.isNotEmpty) {
      sections.add(_HomeWatchlistSection(
        highlights: summary.watchlistHighlights.take(4).toList(),
        onHighlightTap: _openWatchlistHighlight,
      ));
    }
    if (summary.savedLists.isNotEmpty) {
      sections.add(_HomeSavedListsSection(
        lists: summary.savedLists.take(4).toList(),
        onListTap: _openSavedList,
      ));
    }
    if (summary.marketHighlights.isNotEmpty) {
      sections.add(_HomeMarketSection(
          highlights: summary.marketHighlights.take(4).toList()));
    }
    if (summary.quickActions.isNotEmpty) {
      sections.add(_HomeQuickActionsSection(
        actions: summary.quickActions,
        onAction: _handleQuickAction,
      ));
    }

    return [
      for (final section in sections) ...[
        section,
        if (section != sections.last) const SizedBox(height: AppSpacing.lg),
      ],
    ];
  }

  void _handleQuickAction(HomeQuickAction action) {
    switch (action.type) {
      case 'search_product':
        Navigator.of(context).pushNamed(AppRoutes.search);
        break;
      case 'optimize_basket':
        Navigator.of(context).pushNamed(AppRoutes.optimize);
        break;
      case 'view_watchlist':
        Navigator.of(context).pushNamed(AppRoutes.watchlist);
        break;
      case 'view_saved_lists':
      case 'saved_lists':
        Navigator.of(context).pushNamed(AppRoutes.lists);
        break;
      default:
        Navigator.of(context).pushNamed(AppRoutes.search);
    }
  }

  void _openSavedList(HomeSavedListShortcut list) {
    Navigator.of(context).pushNamed(
      AppRoutes.listDetail,
      arguments: {
        'listId': list.listId,
        'list_id': list.listId,
        'name': list.name,
        'itemCount': list.itemCount,
      },
    );
  }

  void _openWatchlistHighlight(HomeWatchlistHighlight highlight) {
    Navigator.of(context).pushNamed(
      AppRoutes.watchlist,
      arguments: {
        'watchId': highlight.watchId,
        'canonicalProductId': highlight.canonicalProductId,
        'canonical_product_id': highlight.canonicalProductId,
      },
    );
  }

  void _openDeal(HomeDealCard deal) {
    Navigator.of(context).pushNamed(
      AppRoutes.product,
      arguments: {
        'canonicalProductId': deal.canonicalProductId,
        'canonical_product_id': deal.canonicalProductId,
        'canonicalName': deal.canonicalName,
      },
    );
  }
}

class HomeSearchBar extends StatelessWidget {
  const HomeSearchBar({
    super.key,
    required this.controller,
    required this.onSubmitted,
    required this.onVoice,
    required this.actions,
  });

  final TextEditingController controller;
  final ValueChanged<String> onSubmitted;
  final VoidCallback onVoice;
  final Widget actions;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: BorderRadius.circular(24),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.06),
                blurRadius: 18,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: TextField(
            key: const Key('search-input'),
            controller: controller,
            textInputAction: TextInputAction.search,
            onSubmitted: onSubmitted,
            decoration: InputDecoration(
              hintText: 'Search products or add to basket...',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: IconButton(
                key: const Key('voice-button'),
                onPressed: onVoice,
                icon: const Icon(Icons.mic_none),
              ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(24),
                borderSide: BorderSide.none,
              ),
              filled: true,
              fillColor: Colors.transparent,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md,
                vertical: AppSpacing.sm,
              ),
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        actions,
      ],
    );
  }
}

class SectionHeader extends StatelessWidget {
  const SectionHeader({
    super.key,
    required this.title,
    this.subtitle,
  });

  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
        if (subtitle != null) ...[
          const SizedBox(height: AppSpacing.xxs),
          Text(
            subtitle!,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ],
    );
  }
}

class _HomePolishCard extends StatelessWidget {
  const _HomePolishCard({
    required this.child,
    this.onTap,
    this.width,
    this.padding = const EdgeInsets.all(AppSpacing.md),
  });

  final Widget child;
  final VoidCallback? onTap;
  final double? width;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final content = AnimatedContainer(
      duration: const Duration(milliseconds: 120),
      width: width,
      padding: padding,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 14,
            offset: const Offset(0, 5),
          ),
        ],
        border: Border.all(
          color: Theme.of(context).colorScheme.outlineVariant,
        ),
      ),
      child: child,
    );

    if (onTap == null) {
      return content;
    }

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: content,
      ),
    );
  }
}

class _HomeTopDealsSection extends StatelessWidget {
  const _HomeTopDealsSection({
    required this.deals,
    required this.onDealTap,
  });

  final List<HomeDealCard> deals;
  final ValueChanged<HomeDealCard> onDealTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      key: const Key('home-top-deals-section'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(
          title: 'Top Deals',
          subtitle: 'Good prices worth checking first.',
        ),
        const SizedBox(height: AppSpacing.md),
        SizedBox(
          height: 174,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: deals.length,
            separatorBuilder: (_, __) => const SizedBox(width: AppSpacing.md),
            itemBuilder: (context, index) {
              final deal = deals[index];
              return DealCard(
                key: Key('home-deal-${deal.canonicalProductId}'),
                deal: deal,
                onTap: () => onDealTap(deal),
              );
            },
          ),
        ),
      ],
    );
  }
}

class DealCard extends StatelessWidget {
  const DealCard({
    super.key,
    required this.deal,
    required this.onTap,
  });

  final HomeDealCard deal;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final name = deal.canonicalName.isNotEmpty
        ? deal.canonicalName
        : deal.canonicalProductId;
    return _HomePolishCard(
      width: 228,
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const MetricBadge(
            label: 'Good',
            value: 'deal',
            color: Color(0xFFCDEBDD),
            icon: Icons.local_offer_outlined,
          ),
          const Spacer(),
          Text(
            name,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            deal.price == null
                ? deal.currency
                : formatPrice(context, deal.price!),
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: AppSpacing.xxs),
          Text(
            (deal.chainName ?? '').isNotEmpty
                ? deal.chainName!
                : 'Available now',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}

class _HomeWatchlistSection extends StatelessWidget {
  const _HomeWatchlistSection({
    required this.highlights,
    required this.onHighlightTap,
  });

  final List<HomeWatchlistHighlight> highlights;
  final ValueChanged<HomeWatchlistHighlight> onHighlightTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      key: const Key('home-watchlist-section'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(
          title: 'Watchlist Highlights',
          subtitle: 'Tracked products needing a quick look.',
        ),
        const SizedBox(height: AppSpacing.md),
        for (final highlight in highlights) ...[
          WatchlistCard(
            key: Key('home-watch-highlight-${highlight.watchId}'),
            highlight: highlight,
            icon: _watchIcon(highlight.highlightType),
            onTap: () => onHighlightTap(highlight),
          ),
          if (highlight != highlights.last)
            const SizedBox(height: AppSpacing.sm),
        ],
      ],
    );
  }

  IconData _watchIcon(String type) {
    switch (type) {
      case 'target_hit':
        return Icons.flag_outlined;
      case 'missing_price':
        return Icons.help_outline;
      case 'good_deal':
      default:
        return Icons.local_offer_outlined;
    }
  }
}

class WatchlistCard extends StatelessWidget {
  const WatchlistCard({
    super.key,
    required this.highlight,
    required this.icon,
    required this.onTap,
  });

  final HomeWatchlistHighlight highlight;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return _HomePolishCard(
      onTap: onTap,
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Row(
        children: [
          Icon(icon, size: 22),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  highlight.label,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                ),
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  highlight.message,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right),
        ],
      ),
    );
  }
}

class _HomeSavedListsSection extends StatelessWidget {
  const _HomeSavedListsSection({
    required this.lists,
    required this.onListTap,
  });

  final List<HomeSavedListShortcut> lists;
  final ValueChanged<HomeSavedListShortcut> onListTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      key: const Key('home-saved-lists-section'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(
          title: 'Saved Lists',
          subtitle: 'Shortcuts for repeat shops.',
        ),
        const SizedBox(height: AppSpacing.md),
        for (final list in lists) ...[
          SavedListCard(
            key: Key('home-saved-list-${list.listId}'),
            list: list,
            onTap: () => onListTap(list),
          ),
          if (list != lists.last) const SizedBox(height: AppSpacing.sm),
        ],
      ],
    );
  }
}

class SavedListCard extends StatelessWidget {
  const SavedListCard({
    super.key,
    required this.list,
    required this.onTap,
  });

  final HomeSavedListShortcut list;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return _HomePolishCard(
      onTap: onTap,
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  list.name,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                ),
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  '${list.itemCount} items',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: onTap,
            child: const Text('Optimize'),
          ),
        ],
      ),
    );
  }
}

class _HomeMarketSection extends StatelessWidget {
  const _HomeMarketSection({
    required this.highlights,
  });

  final List<HomeMarketHighlight> highlights;

  @override
  Widget build(BuildContext context) {
    return Column(
      key: const Key('home-market-section'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(title: 'Market Highlights'),
        const SizedBox(height: AppSpacing.sm),
        for (final highlight in highlights) ...[
          MarketHighlightItem(highlight: highlight),
          if (highlight != highlights.last)
            const SizedBox(height: AppSpacing.xs),
        ],
      ],
    );
  }
}

class MarketHighlightItem extends StatelessWidget {
  const MarketHighlightItem({
    super.key,
    required this.highlight,
  });

  final HomeMarketHighlight highlight;

  @override
  Widget build(BuildContext context) {
    final up = highlight.trend != 'down';
    return _HomePolishCard(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: AppSpacing.xs,
      ),
      child: Row(
        children: [
          Icon(
            up ? Icons.trending_up : Icons.trending_down,
            size: 18,
            color: up ? const Color(0xFF9A5B00) : const Color(0xFF257A4A),
          ),
          const SizedBox(width: AppSpacing.xs),
          Expanded(
            child: Text(
              _marketLabel(highlight),
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
        ],
      ),
    );
  }

  String _marketLabel(HomeMarketHighlight highlight) {
    if (highlight.changePercent == null) {
      return highlight.message.isNotEmpty ? highlight.message : highlight.label;
    }
    final percent = (highlight.changePercent!.abs() * 100).toStringAsFixed(1);
    final arrow = highlight.trend == 'down' ? 'down' : 'up';
    return '${highlight.label} $arrow $percent% this week';
  }
}

class _HomeQuickActionsSection extends StatelessWidget {
  const _HomeQuickActionsSection({
    required this.actions,
    required this.onAction,
  });

  final List<HomeQuickAction> actions;
  final ValueChanged<HomeQuickAction> onAction;

  @override
  Widget build(BuildContext context) {
    return Column(
      key: const Key('home-quick-actions-section'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(title: 'Quick Actions'),
        const SizedBox(height: AppSpacing.sm),
        QuickActionsRow(actions: actions, onAction: onAction),
      ],
    );
  }
}

class QuickActionsRow extends StatelessWidget {
  const QuickActionsRow({
    super.key,
    required this.actions,
    required this.onAction,
  });

  final List<HomeQuickAction> actions;
  final ValueChanged<HomeQuickAction> onAction;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: AppSpacing.xs,
      runSpacing: AppSpacing.xs,
      children: [
        for (final action in actions)
          OutlinedButton(
            onPressed: () => onAction(action),
            child: Text(action.label),
          ),
      ],
    );
  }
}
