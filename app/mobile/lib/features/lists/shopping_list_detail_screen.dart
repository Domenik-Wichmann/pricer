import 'package:flutter/material.dart';
import 'package:pricer_mobile/src/generated/l10n/app_localizations.dart';

import '../../core/models/app_models.dart';
import '../../core/services/app_dependencies.dart';
import '../../core/ui/app_spacing.dart';
import '../../core/ui/app_widgets.dart';
import '../../core/utils/formatters.dart';

class ShoppingListDetailScreen extends StatefulWidget {
  const ShoppingListDetailScreen({
    super.key,
    required this.dependencies,
    required this.shoppingList,
  });

  final AppDependencies dependencies;
  final ShoppingListModel shoppingList;

  @override
  State<ShoppingListDetailScreen> createState() =>
      _ShoppingListDetailScreenState();
}

class _ShoppingListDetailScreenState extends State<ShoppingListDetailScreen> {
  ListComparisonResult? _comparison;
  bool _comparing = false;

  Future<void> _addItem() async {
    final l10n = AppLocalizations.of(context)!;
    final controller = TextEditingController();
    final queryText = await showDialog<String>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: Text(l10n.addItemTitle),
          content: TextField(
            key: const Key('add-list-item-input'),
            controller: controller,
            decoration: InputDecoration(
              labelText: l10n.bulgarianQueryLabel,
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(l10n.cancelButton),
            ),
            FilledButton(
              key: const Key('add-list-item-submit'),
              onPressed: () =>
                  Navigator.of(context).pop(controller.text.trim()),
              child: Text(l10n.addButton),
            ),
          ],
        );
      },
    );

    if (queryText == null || queryText.isEmpty) {
      return;
    }

    await widget.dependencies.shoppingListsRepository.addItem(
      listId: widget.shoppingList.id,
      queryText: queryText,
    );
  }

  Future<void> _compare(List<ShoppingListEntry> items) async {
    setState(() {
      _comparing = true;
    });

    final results = <QueryResultItem>[];
    double total = 0;
    final stores = <String, int>{};

    try {
      for (final item in items) {
        final response =
            await widget.dependencies.apiClient.query(item.queryText);
        if (response.items.isEmpty) {
          continue;
        }

        final best = response.items.first;
        results.add(best);
        total += best.currentPrice * item.quantity;
        stores.update(best.storeNameRaw, (value) => value + 1,
            ifAbsent: () => 1);
      }

      final sortedStores = stores.entries.toList()
        ..sort((left, right) => right.value.compareTo(left.value));

      if (!mounted) {
        return;
      }

      setState(() {
        _comparison = ListComparisonResult(
          items: results,
          totalCost: total,
          cheapestStore: sortedStores.isEmpty ? null : sortedStores.first.key,
        );
      });
    } finally {
      if (mounted) {
        setState(() {
          _comparing = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.shoppingList.name),
        actions: [
          IconButton(
            onPressed: _addItem,
            icon: const Icon(Icons.add),
          ),
        ],
      ),
      body: StreamBuilder<List<ShoppingListEntry>>(
        stream: widget.dependencies.shoppingListsRepository
            .watchItems(widget.shoppingList.id),
        builder: (context, snapshot) {
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
                message: l10n.shoppingListLoadError,
                onRetry: () {},
              ),
            );
          }

          final items = snapshot.data ?? const <ShoppingListEntry>[];
          return Column(
            children: [
              Expanded(
                child: AppScreen(
                  child: ListView(
                    children: [
                      AppSectionCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            AppSectionHeader(
                              title: widget.shoppingList.name,
                              subtitle: l10n.itemsReadyToCompare(items.length),
                            ),
                            const SizedBox(height: AppSpacing.md),
                            if (_comparison != null)
                              Column(
                                children: [
                                  ListTile(
                                    contentPadding: EdgeInsets.zero,
                                    title: Text(_comparison!.cheapestStore ??
                                        l10n.noStoreWinnerYet),
                                    subtitle: Text(l10n.bestOneThumbRerun),
                                    trailing: Text(formatPrice(
                                        context, _comparison!.totalCost)),
                                  ),
                                  const SizedBox(height: AppSpacing.xs),
                                  MetricBadge(
                                    key: const Key('list-rerun-shortcut'),
                                    label: l10n.updatedPricesLabel,
                                    value: l10n.availableNowLabel,
                                    color: const Color(0xFFCDEBDD),
                                    icon: Icons.refresh,
                                  ),
                                ],
                              )
                            else
                              Text(l10n.runComparisonHint),
                          ],
                        ),
                      ),
                      const SizedBox(height: AppSpacing.lg),
                      if (items.isEmpty)
                        EmptyStateCard(
                          title: l10n.addGroceriesFirstTitle,
                          message: l10n.addGroceriesFirstMessage,
                        )
                      else
                        for (final item in items) ...[
                          AppSectionCard(
                            child: ListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text(item.queryText),
                              subtitle: Text(l10n.qtyLabel(item.quantity)),
                              trailing: IconButton(
                                onPressed: () {
                                  widget.dependencies.shoppingListsRepository
                                      .removeItem(
                                    listId: widget.shoppingList.id,
                                    itemId: item.id,
                                  );
                                },
                                icon: const Icon(Icons.delete_outline),
                              ),
                            ),
                          ),
                          const SizedBox(height: AppSpacing.md),
                        ],
                    ],
                  ),
                ),
              ),
              BottomSummaryBar(
                title: _comparison == null
                    ? l10n.refreshPricesTitle
                    : l10n.bestCurrentTotalTitle,
                subtitle: _comparison == null
                    ? l10n.compareListSubtitle
                    : l10n.cheapestStoreTotalSubtitle(
                        _comparison!.cheapestStore ?? l10n.noStoreWinnerYet,
                        formatPrice(context, _comparison!.totalCost),
                      ),
                actionLabel: l10n.runComparisonButton,
                actionKey: const Key('compare-list-button'),
                onAction:
                    items.isEmpty || _comparing ? () {} : () => _compare(items),
                trailing: _comparing
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : null,
              ),
            ],
          );
        },
      ),
    );
  }
}
