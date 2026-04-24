import 'package:flutter/material.dart';
import 'package:pricer_mobile/src/generated/l10n/app_localizations.dart';

import '../../core/models/app_models.dart';
import '../../core/services/app_dependencies.dart';
import '../../core/ui/app_spacing.dart';
import '../../core/ui/app_widgets.dart';
import '../../core/utils/formatters.dart';

class WatchlistScreen extends StatelessWidget {
  const WatchlistScreen({
    super.key,
    required this.dependencies,
  });

  final AppDependencies dependencies;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.watchlistTitle),
      ),
      body: StreamBuilder<List<WatchlistEntry>>(
        stream: dependencies.watchlistRepository.watchEntries(),
        builder: (context, snapshot) {
          return StreamBuilder<MonetizationProfile>(
            stream: dependencies.monetizationService.watchProfile(),
            initialData: MonetizationProfile.free(dependencies.anonymousUserId),
            builder: (context, monetizationSnapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return AppScreen(
                  child: ListView(
                    children: const [
                      SkeletonCard(height: 96),
                      SizedBox(height: AppSpacing.md),
                      SkeletonCard(height: 84),
                    ],
                  ),
                );
              }

              if (snapshot.hasError) {
                return AppScreen(
                  child: ErrorStateCard(
                    message: l10n.watchlistLoadError,
                    onRetry: () {},
                  ),
                );
              }

              final entries = snapshot.data ?? const <WatchlistEntry>[];
              final profile = monetizationSnapshot.data ??
                  MonetizationProfile.free(dependencies.anonymousUserId);
              final drops = entries.where((entry) {
                if (entry.targetPrice == null || entry.currentPrice == null) {
                  return false;
                }

                return entry.currentPrice! <= entry.targetPrice!;
              }).length;

              return AppScreen(
                child: ListView(
                  children: [
                    if (!profile.alertsEnabled) ...[
                      AppSectionCard(
                        key: const Key('watchlist-premium-card'),
                        backgroundColor: const Color(0xFFFFF4D9),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            AppSectionHeader(
                              title: l10n.watchlistPremiumTitle,
                              subtitle: l10n.watchlistPremiumMessage,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: AppSpacing.lg),
                    ],
                    AppSectionCard(
                      key: const Key('watchlist-drops-summary'),
                      backgroundColor: const Color(0xFFEAF5EF),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          AppSectionHeader(
                            title: l10n.dropsSummaryTitle,
                            subtitle: l10n.dropsSummarySubtitle,
                          ),
                          const SizedBox(height: AppSpacing.md),
                          Text(
                            entries.isEmpty
                                ? l10n.noTrackedItemsYet
                                : l10n.watchlistDropsStatus(
                                    drops, entries.length),
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    if (entries.isEmpty)
                      EmptyStateCard(
                        title: l10n.watchlistEmptyTitle,
                        message: l10n.watchlistEmptyMessage,
                      )
                    else
                      for (final entry in entries) ...[
                        AppSectionCard(
                          child: ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(entry.displayName),
                            subtitle: Text(l10n.currentPriceLabel(
                                formatNullablePrice(
                                    context, entry.currentPrice))),
                            trailing: IconButton(
                              key: Key('remove-watch-${entry.productId}'),
                              onPressed: () => dependencies.watchlistRepository
                                  .remove(entry.productId),
                              icon: const Icon(Icons.close),
                            ),
                          ),
                        ),
                        const SizedBox(height: AppSpacing.md),
                      ],
                    const SizedBox(height: AppSpacing.lg),
                    Center(
                      child: dependencies.adService.bannerSlot(
                        key: const Key('watchlist-banner-ad'),
                        enabled: profile.adsEnabled,
                      ),
                    ),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }
}
