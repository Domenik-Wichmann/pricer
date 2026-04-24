import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:pricer_mobile/src/generated/l10n/app_localizations.dart';

import '../../core/models/app_models.dart';
import '../../core/services/app_dependencies.dart';
import '../../core/ui/app_spacing.dart';
import '../../core/ui/app_widgets.dart';
import '../../core/utils/formatters.dart';
import '../monetization/paywall_screen.dart';
import '../product/product_detail_screen.dart';

class ResultsScreen extends StatelessWidget {
  const ResultsScreen({
    super.key,
    required this.dependencies,
    required this.queryText,
    required this.response,
  });

  final AppDependencies dependencies;
  final String queryText;
  final QueryResponse response;

  double get _savingsTotal {
    return response.items.fold<double>(0, (sum, item) {
      final value = item.savingsVsAverage;
      if (value == null || value <= 0) {
        return sum;
      }

      return sum + value;
    });
  }

  Future<void> _addToList(BuildContext context, QueryResultItem item) async {
    final l10n = AppLocalizations.of(context)!;
    final controller = TextEditingController(text: l10n.quickListName);
    final listName = await showDialog<String>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: Text(l10n.saveToShoppingListTitle),
          content: TextField(
            controller: controller,
            decoration: InputDecoration(
              labelText: l10n.listNameLabel,
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(l10n.cancelButton),
            ),
            FilledButton(
              onPressed: () =>
                  Navigator.of(context).pop(controller.text.trim()),
              child: Text(l10n.saveButton),
            ),
          ],
        );
      },
    );

    if (listName == null) {
      return;
    }

    final listId =
        await dependencies.shoppingListsRepository.ensureList(listName);
    await dependencies.shoppingListsRepository.addItem(
      listId: listId,
      queryText: item.productNameRaw,
      matchedProductId: item.sourceProductId,
    );

    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content:
                Text(l10n.savedToListSnackBar(item.displayName, listName))),
      );
    }
  }

  Future<void> _saveAllToList(BuildContext context) async {
    final l10n = AppLocalizations.of(context)!;
    final profile = await dependencies.monetizationService.readProfile();
    await dependencies.adService.maybeShowInterstitial(
      enabled: profile.adsEnabled,
      placement: 'save_results',
    );
    final listName = l10n.defaultSavedResultListName;
    final listId =
        await dependencies.shoppingListsRepository.ensureList(listName);
    for (final item in response.items) {
      await dependencies.shoppingListsRepository.addItem(
        listId: listId,
        queryText: item.productNameRaw,
        matchedProductId: item.sourceProductId,
      );
    }

    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.resultSavedSnackBar(listName))),
      );
    }
  }

  Future<void> _addToWatchlist(
      BuildContext context, QueryResultItem item) async {
    final l10n = AppLocalizations.of(context)!;
    await dependencies.watchlistRepository.upsert(
      productId: item.sourceProductId,
      displayName: item.displayName,
      currentPrice: item.currentPrice,
    );

    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text(l10n.addedToWatchlistSnackBar(item.displayName))),
      );
    }
  }

  Future<void> _share(BuildContext context) async {
    final l10n = AppLocalizations.of(context)!;
    final text = response.items.isEmpty
        ? l10n.shareNoMatchText(queryText)
        : l10n.shareResultText(
            formatPrice(context, _savingsTotal),
            queryText,
            response.cheapestStore ?? l10n.noStoreMatchYet,
          );
    await Clipboard.setData(ClipboardData(text: text));
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.shareCopiedSnackBar)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final subtitle = _savingsTotal > 0
        ? l10n.savingsVsAverage(formatPrice(context, _savingsTotal))
        : l10n.cheapestTodayForQuery;

    return Scaffold(
      appBar: AppBar(
        title: Text(queryText),
        actions: [
          IconButton(
            key: const Key('share-results-button'),
            onPressed: response.items.isEmpty ? null : () => _share(context),
            icon: const Icon(Icons.ios_share_outlined),
          ),
        ],
      ),
      body: response.items.isEmpty
          ? AppScreen(
              child: EmptyStateCard(
                title: l10n.resultsNoMatchesTitle,
                message: l10n.resultsNoMatchesMessage,
                actionLabel: l10n.tryAgainButton,
                onAction: () => Navigator.of(context).pop(),
              ),
            )
          : StreamBuilder<MonetizationProfile>(
              stream: dependencies.monetizationService.watchProfile(),
              initialData:
                  MonetizationProfile.free(dependencies.anonymousUserId),
              builder: (context, snapshot) {
                final profile = snapshot.data ??
                    MonetizationProfile.free(dependencies.anonymousUserId);

                return Column(
                  children: [
                    Expanded(
                      child: ListView(
                        padding: const EdgeInsets.all(AppSpacing.lg),
                        children: [
                          AppSectionCard(
                            key: const Key('results-summary-card'),
                            backgroundColor: const Color(0xFFEAF5EF),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                AppSectionHeader(
                                  title: l10n.resultsSummaryTitle,
                                  subtitle: l10n.resultsSummarySubtitle,
                                ),
                                const SizedBox(height: AppSpacing.md),
                                Row(
                                  children: [
                                    Expanded(
                                      child: Column(
                                        mainAxisSize: MainAxisSize.min,
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            formatNullablePrice(
                                                context, response.totalCost),
                                            style: Theme.of(context)
                                                .textTheme
                                                .headlineMedium,
                                          ),
                                          const SizedBox(height: AppSpacing.xs),
                                          Text(response.cheapestStore ??
                                              l10n.noStoreMatchYet),
                                        ],
                                      ),
                                    ),
                                    Column(
                                      mainAxisSize: MainAxisSize.min,
                                      crossAxisAlignment:
                                          CrossAxisAlignment.end,
                                      children: [
                                        MetricBadge(
                                          label: l10n.youSaveLabel,
                                          value: formatPrice(
                                              context, _savingsTotal),
                                          color: const Color(0xFFCDEBDD),
                                          icon: Icons.savings_outlined,
                                        ),
                                        const SizedBox(height: AppSpacing.xs),
                                        MetricBadge(
                                          label: l10n.badgeLabel,
                                          value: l10n.cheapestTodayBadge,
                                          color: const Color(0xFFFFF1C7),
                                          icon:
                                              Icons.workspace_premium_outlined,
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                                const SizedBox(height: AppSpacing.sm),
                                Text(subtitle),
                              ],
                            ),
                          ),
                          const SizedBox(height: AppSpacing.lg),
                          if (!profile.optimizerMultiStoreEnabled) ...[
                            AppSectionCard(
                              key: const Key('results-premium-upsell'),
                              backgroundColor: const Color(0xFFFFF4D9),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Icon(Icons.workspace_premium_outlined),
                                  const SizedBox(width: AppSpacing.md),
                                  Expanded(
                                    child: Column(
                                      mainAxisSize: MainAxisSize.min,
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          l10n.multiStorePremiumTitle,
                                          style: Theme.of(context)
                                              .textTheme
                                              .titleMedium,
                                        ),
                                        const SizedBox(height: AppSpacing.xs),
                                        Text(l10n.multiStorePremiumMessage),
                                        const SizedBox(height: AppSpacing.sm),
                                        FilledButton.tonal(
                                          onPressed: () {
                                            Navigator.of(context).push(
                                              MaterialPageRoute<void>(
                                                builder: (_) => PaywallScreen(
                                                  dependencies: dependencies,
                                                ),
                                              ),
                                            );
                                          },
                                          child: Text(l10n.unlockPremiumButton),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: AppSpacing.lg),
                          ],
                          for (var index = 0;
                              index < response.items.length;
                              index += 1) ...[
                            _ResultCard(
                              key: Key('result-card-$index'),
                              item: response.items[index],
                              onDetails: () {
                                Navigator.of(context).push(
                                  MaterialPageRoute<void>(
                                    builder: (_) => ProductDetailScreen(
                                      dependencies: dependencies,
                                      item: response.items[index],
                                    ),
                                  ),
                                );
                              },
                              onList: () =>
                                  _addToList(context, response.items[index]),
                              onWatch: () => _addToWatchlist(
                                  context, response.items[index]),
                            ),
                            const SizedBox(height: AppSpacing.md),
                          ],
                        ],
                      ),
                    ),
                    Center(
                      child: dependencies.adService.bannerSlot(
                        key: const Key('results-banner-ad'),
                        enabled: profile.adsEnabled,
                      ),
                    ),
                    BottomSummaryBar(
                      title: l10n.saveResultTitle,
                      subtitle: l10n.saveResultSubtitle,
                      actionLabel: l10n.saveAsListButton,
                      onAction: () => _saveAllToList(context),
                      trailing: IconButton(
                        key: const Key('share-results-secondary'),
                        onPressed: () => _share(context),
                        icon: const Icon(Icons.share_outlined),
                      ),
                    ),
                  ],
                );
              },
            ),
    );
  }
}

class _ResultCard extends StatelessWidget {
  const _ResultCard({
    super.key,
    required this.item,
    required this.onDetails,
    required this.onList,
    required this.onWatch,
  });

  final QueryResultItem item;
  final VoidCallback onDetails;
  final VoidCallback onList;
  final VoidCallback onWatch;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final savings = item.savingsVsAverage;
    return AppSectionCard(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.displayName,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(item.storeNameRaw),
                  ],
                ),
              ),
              if (savings != null && savings > 0)
                MetricBadge(
                  label: l10n.saveLabel,
                  value: formatPrice(context, savings),
                  color: const Color(0xFFCDEBDD),
                  icon: Icons.trending_down,
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              Text(
                formatPrice(context, item.currentPrice),
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(width: AppSpacing.sm),
              if (item.historyAvgPrice != null)
                Text(l10n.vsAverageShort(
                    formatPrice(context, item.historyAvgPrice!))),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.xs,
            runSpacing: AppSpacing.xs,
            children: [
              MetricBadge(
                label: l10n.storeLabel,
                value: item.storeNameRaw,
                icon: Icons.storefront_outlined,
              ),
              if (item.matchReasons.isNotEmpty)
                MetricBadge(
                  label: l10n.matchLabel,
                  value: item.matchReasons.first.replaceAll('_', ' '),
                  icon: Icons.check_circle_outline,
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Wrap(
            spacing: AppSpacing.xs,
            runSpacing: AppSpacing.xs,
            children: [
              OutlinedButton(
                onPressed: onWatch,
                child: Text(l10n.watchButton),
              ),
              OutlinedButton(
                onPressed: onList,
                child: Text(l10n.addToListButton),
              ),
              FilledButton.tonal(
                onPressed: onDetails,
                child: Text(l10n.detailsButton),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
