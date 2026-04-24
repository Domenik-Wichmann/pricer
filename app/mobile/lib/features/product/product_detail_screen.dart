import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:pricer_mobile/src/generated/l10n/app_localizations.dart';

import '../../core/models/app_models.dart';
import '../../core/services/app_dependencies.dart';
import '../../core/ui/app_spacing.dart';
import '../../core/ui/app_widgets.dart';
import '../../core/utils/formatters.dart';
import '../monetization/paywall_screen.dart';

class ProductDetailScreen extends StatelessWidget {
  const ProductDetailScreen({
    super.key,
    required this.dependencies,
    required this.item,
  });

  final AppDependencies dependencies;
  final QueryResultItem item;

  double _historyAverage(List<ProductHistoryPoint> history) {
    if (history.isEmpty) {
      return item.historyAvgPrice ?? item.currentPrice;
    }

    final total = history.fold<double>(0, (sum, point) => sum + point.priceAvg);
    return total / history.length;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        title: Text(item.displayName),
      ),
      body: FutureBuilder<List<ProductHistoryPoint>>(
        future: dependencies.apiClient.getProductHistory(item.sourceProductId),
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return AppScreen(
              child: ListView(
                children: const [
                  SkeletonCard(height: 96),
                  SizedBox(height: AppSpacing.lg),
                  SkeletonCard(height: 260),
                  SizedBox(height: AppSpacing.lg),
                  SkeletonCard(height: 80),
                ],
              ),
            );
          }

          if (snapshot.hasError) {
            return AppScreen(
              child: ErrorStateCard(
                message: l10n.productHistoryLoadError,
                onRetry: () => Navigator.of(context).pop(),
              ),
            );
          }

          final history = snapshot.data ?? const <ProductHistoryPoint>[];
          final averagePrice = _historyAverage(history);
          return ListView(
            padding: const EdgeInsets.all(AppSpacing.lg),
            children: [
              AppSectionCard(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.displayName,
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      formatPrice(context, item.currentPrice),
                      style: Theme.of(context).textTheme.displaySmall,
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(l10n.bestStoreToday(item.storeNameRaw)),
                    const SizedBox(height: AppSpacing.md),
                    GoodPriceBadge(
                      key: const Key('good-price-indicator'),
                      currentPrice: item.currentPrice,
                      averagePrice: averagePrice,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              ChartFrame(
                title: l10n.priceHistoryTitle,
                subtitle: l10n.priceHistorySubtitle,
                child: history.isEmpty
                    ? Center(child: Text(l10n.noHistoryYet))
                    : LineChart(
                        LineChartData(
                          minY: history
                                  .map((point) => point.priceMin)
                                  .reduce((a, b) => a < b ? a : b) -
                              0.1,
                          maxY: history
                                  .map((point) => point.priceMax)
                                  .reduce((a, b) => a > b ? a : b) +
                              0.1,
                          titlesData: const FlTitlesData(
                            rightTitles: AxisTitles(
                                sideTitles: SideTitles(showTitles: false)),
                            topTitles: AxisTitles(
                                sideTitles: SideTitles(showTitles: false)),
                          ),
                          gridData: const FlGridData(show: false),
                          borderData: FlBorderData(show: false),
                          lineBarsData: [
                            LineChartBarData(
                              isCurved: true,
                              barWidth: 3,
                              color: Theme.of(context).colorScheme.primary,
                              spots: [
                                for (var i = 0; i < history.length; i += 1)
                                  FlSpot(i.toDouble(), history[i].priceAvg),
                              ],
                            ),
                          ],
                        ),
                      ),
              ),
              const SizedBox(height: AppSpacing.lg),
              AppSectionCard(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AppSectionHeader(
                      title: l10n.recentPricePointsTitle,
                      subtitle: l10n.recentPricePointsSubtitle,
                    ),
                    const SizedBox(height: AppSpacing.md),
                    if (history.isEmpty)
                      EmptyStateCard(
                        title: l10n.noRecordedHistoryTitle,
                        message: l10n.noRecordedHistoryMessage,
                      )
                    else
                      for (final point in history) ...[
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(point.date),
                          subtitle: Text(
                            l10n.priceRangeLabel(
                              formatPrice(context, point.priceMin),
                              formatPrice(context, point.priceMax),
                            ),
                          ),
                          trailing: Text(formatPrice(context, point.priceAvg)),
                        ),
                        if (point != history.last) const Divider(height: 1),
                      ],
                  ],
                ),
              ),
            ],
          );
        },
      ),
      bottomNavigationBar: BottomSummaryBar(
        title: l10n.trackPriceDropsTitle,
        subtitle: l10n.trackPriceDropsSubtitle,
        actionLabel: l10n.watchItemButton,
        onAction: () async {
          final profile = await dependencies.monetizationService.readProfile();
          if (!profile.alertsEnabled && context.mounted) {
            await Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => PaywallScreen(
                  dependencies: dependencies,
                ),
              ),
            );
            return;
          }

          await dependencies.watchlistRepository.upsert(
            productId: item.sourceProductId,
            displayName: item.displayName,
            currentPrice: item.currentPrice,
          );
        },
        trailing: OutlinedButton(
          onPressed: () async {
            final listId = await dependencies.shoppingListsRepository
                .ensureList(l10n.quickListName);
            await dependencies.shoppingListsRepository.addItem(
              listId: listId,
              queryText: item.productNameRaw,
              matchedProductId: item.sourceProductId,
            );
          },
          child: Text(l10n.addToListButton),
        ),
      ),
    );
  }
}
