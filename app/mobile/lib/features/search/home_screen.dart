import 'package:flutter/material.dart';
import 'package:pricer_mobile/src/generated/l10n/app_localizations.dart';

import '../../core/models/app_models.dart';
import '../../core/services/app_dependencies.dart';
import '../../core/ui/app_spacing.dart';
import '../../core/ui/app_widgets.dart';
import '../lists/shopping_list_detail_screen.dart';
import '../monetization/paywall_screen.dart';
import '../results/results_screen.dart';

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
  bool _loading = false;
  bool _recentSearchesLoading = true;
  String? _error;
  List<String> _recentSearches = const <String>[];

  @override
  void initState() {
    super.initState();
    _loadRecentSearches();
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

  Future<void> _runSearch([String? overrideQuery]) async {
    final query = (overrideQuery ?? _controller.text).trim();
    if (query.isEmpty || _loading) {
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await widget.dependencies.recentActivityService.rememberSearch(query);
      final response = await widget.dependencies.apiClient.query(query);
      await _loadRecentSearches();
      if (!mounted) {
        return;
      }

      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => ResultsScreen(
            dependencies: widget.dependencies,
            queryText: query,
            response: response,
          ),
        ),
      );
    } catch (_) {
      if (!mounted) {
        return;
      }
      final l10n = AppLocalizations.of(context)!;
      setState(() {
        _error = l10n.loadResultsError;
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  Future<void> _captureVoice() async {
    if (_loading) {
      return;
    }

    final words = await widget.dependencies.voiceInputService.captureOnce();
    if (words == null || words.trim().isEmpty) {
      return;
    }

    _controller.text = words;
    await _runSearch(words);
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
      stream: widget.dependencies.watchlistRepository.watchEntries(),
      builder: (context, watchSnapshot) {
        return StreamBuilder<List<ShoppingListModel>>(
          stream: widget.dependencies.shoppingListsRepository.watchLists(),
          builder: (context, listSnapshot) {
            return StreamBuilder<MonetizationProfile>(
              stream: widget.dependencies.monetizationService.watchProfile(),
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
                      const SizedBox(height: AppSpacing.lg),
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
                              title: l10n.homeSearchCardTitle,
                              subtitle: l10n.homeSearchCardSubtitle,
                            ),
                            const SizedBox(height: AppSpacing.md),
                            TextField(
                              key: const Key('search-input'),
                              controller: _controller,
                              textInputAction: TextInputAction.search,
                              onSubmitted: (_) => _runSearch(),
                              decoration: InputDecoration(
                                labelText: l10n.searchFieldLabel,
                                hintText: l10n.searchFieldHint,
                                suffixIcon: IconButton(
                                  key: const Key('voice-button'),
                                  onPressed: _captureVoice,
                                  icon: const Icon(Icons.mic_none),
                                ),
                              ),
                            ),
                            const SizedBox(height: AppSpacing.md),
                            FilledButton.icon(
                              key: const Key('search-button'),
                              onPressed: _loading ? null : _runSearch,
                              icon: _loading
                                  ? const SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2),
                                    )
                                  : const Icon(Icons.search),
                              label: Text(l10n.searchButton),
                            ),
                            if (_error != null) ...[
                              const SizedBox(height: AppSpacing.md),
                              ErrorStateCard(
                                message: _error!,
                                onRetry: _runSearch,
                              ),
                            ],
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
                                        _runSearch(query);
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
                                                shoppingList: shoppingList,
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
}
