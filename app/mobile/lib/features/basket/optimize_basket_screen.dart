import 'package:flutter/material.dart';

import '../../core/models/app_models.dart';
import '../../core/services/app_dependencies.dart';
import '../../core/ui/app_spacing.dart';
import '../../core/ui/app_widgets.dart';
import '../../core/utils/formatters.dart';

class OptimizeBasketScreen extends StatefulWidget {
  const OptimizeBasketScreen({
    super.key,
    required this.dependencies,
    required this.initialItems,
  });

  final AppDependencies dependencies;
  final List<String> initialItems;

  @override
  State<OptimizeBasketScreen> createState() => _OptimizeBasketScreenState();
}

class _OptimizeBasketScreenState extends State<OptimizeBasketScreen> {
  late final TextEditingController _controller;
  String _strategy = 'multi_store';
  bool _loading = false;
  String? _error;
  BasketOptimizationResponse? _response;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialItems.join('\n'));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  List<String> _parseItems() {
    return _controller.text
        .split(RegExp(r'[,\n]'))
        .map((item) => item.trim())
        .where((item) => item.isNotEmpty)
        .toList();
  }

  Future<void> _optimize() async {
    final items = _parseItems();
    if (items.isEmpty) {
      setState(() {
        _response = null;
        _error = null;
        _loading = false;
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final response = await widget.dependencies.apiClient.optimizeBasket(
        items: items,
        strategy: _strategy,
        includeExplanation: true,
        includeConvenienceScoring: false,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _response = response;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _loading = false;
        _error = 'We could not optimize this basket right now.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasInput = _parseItems().isNotEmpty;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Optimize Basket'),
      ),
      body: AppScreen(
        child: ListView(
          key: const Key('optimize-basket-screen'),
          children: [
            AppSectionCard(
              key: const Key('basket-input-card'),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const AppSectionHeader(
                    title: 'Basket items',
                    subtitle: 'Add one item per line, or separate with commas.',
                  ),
                  const SizedBox(height: AppSpacing.md),
                  TextField(
                    key: const Key('basket-input-field'),
                    controller: _controller,
                    minLines: 4,
                    maxLines: 8,
                    textInputAction: TextInputAction.newline,
                    decoration: const InputDecoration(
                      hintText: 'milk\n10 eggs\ntoilet paper',
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  SegmentedButton<String>(
                    key: const Key('basket-strategy-toggle'),
                    segments: const [
                      ButtonSegment(
                        value: 'single_store',
                        label: Text('Best single store'),
                        icon: Icon(Icons.store_outlined),
                      ),
                      ButtonSegment(
                        value: 'multi_store',
                        label: Text('Best overall'),
                        icon: Icon(Icons.compare_arrows),
                      ),
                    ],
                    selected: {_strategy},
                    onSelectionChanged: _loading
                        ? null
                        : (selection) {
                            setState(() {
                              _strategy = selection.first;
                            });
                          },
                  ),
                  const SizedBox(height: AppSpacing.md),
                  FilledButton.icon(
                    key: const Key('basket-optimize-button'),
                    onPressed: _loading || !hasInput ? null : _optimize,
                    icon: _loading
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.auto_awesome),
                    label: const Text('Optimize'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            ..._buildResultBody(hasInput),
          ],
        ),
      ),
    );
  }

  List<Widget> _buildResultBody(bool hasInput) {
    if (!hasInput && !_loading) {
      return const [
        EmptyStateCard(
          key: Key('basket-empty-state'),
          title: 'Start a basket',
          message: 'Add a few grocery items to compare stores.',
        ),
      ];
    }

    if (_loading) {
      return const [
        SkeletonCard(
          key: Key('basket-loading-state'),
          height: 140,
        ),
      ];
    }

    if (_error != null) {
      return [
        ErrorStateCard(
          key: const Key('basket-error-state'),
          message: _error!,
          onRetry: _optimize,
        ),
      ];
    }

    final response = _response;
    if (response == null) {
      return const <Widget>[];
    }

    final option = response.optimizerResult.recommendedOption;
    if (option == null) {
      return const [
        EmptyStateCard(
          key: Key('basket-no-result-state'),
          title: 'No basket option found',
          message: 'Try fewer items or different wording.',
        ),
      ];
    }

    return [
      _BasketSummaryCard(
        response: response,
        option: option,
      ),
      const SizedBox(height: AppSpacing.xl),
      for (final store in option.displayStores) ...[
        _BasketStoreCard(store: store),
        const SizedBox(height: AppSpacing.sm),
      ],
      if (_visibleWarnings(response, option).isNotEmpty) ...[
        const SizedBox(height: AppSpacing.md),
        _BasketWarningsCard(warnings: _visibleWarnings(response, option)),
      ],
      if (response.explanation != null) ...[
        const SizedBox(height: AppSpacing.xl),
        _BasketExplanationCard(explanation: response.explanation!),
      ],
    ];
  }

  List<String> _visibleWarnings(
    BasketOptimizationResponse response,
    BasketOption option,
  ) {
    final messages = <String>{};
    for (final warning in [
      ...response.optimizerResult.warnings,
      ...option.warnings,
      for (final item in option.items) ...item.warnings,
    ]) {
      final message = warning.message.trim();
      if (message.isNotEmpty) {
        messages.add(message);
      } else if (warning.code == 'missing_price') {
        messages.add('Some items are missing usable prices.');
      } else if (warning.code == 'stale_price_excluded') {
        messages.add('Some stale prices were excluded.');
      } else if (warning.code == 'ambiguous_candidate_auto_selected') {
        messages.add('Some ambiguous items were auto-selected.');
      }
    }
    return messages.toList();
  }
}

class _BasketSummaryCard extends StatelessWidget {
  const _BasketSummaryCard({
    required this.response,
    required this.option,
  });

  final BasketOptimizationResponse response;
  final BasketOption option;

  @override
  Widget build(BuildContext context) {
    final result = response.optimizerResult;
    final strategy = result.recommendedStrategy == 'multi_store'
        ? 'Best overall / multi-store'
        : 'Best single store';
    final total = option.actualTotal;
    final savings = option.savingsVsBestSingleStore;

    return AppSectionCard(
      key: const Key('basket-summary-card'),
      backgroundColor: const Color(0xFFEAF5EF),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          MetricBadge(
            label: 'Recommended',
            value: strategy,
            icon: Icons.check_circle_outline,
            color: const Color(0xFFCDEBDD),
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            total == null
                ? 'Estimated total unavailable'
                : formatPrice(context, total),
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
              [
                'Currency ${option.currency}',
                '${option.displayStores.length} store${option.displayStores.length == 1 ? '' : 's'}',
                if (savings != null && savings > 0)
                  'Savings ${formatPrice(context, savings)}',
              ].join(' - '),
              style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}

class _BasketStoreCard extends StatelessWidget {
  const _BasketStoreCard({
    required this.store,
  });

  final BasketStoreOption store;

  @override
  Widget build(BuildContext context) {
    return AppSectionCard(
      key: Key('basket-store-${store.displayName}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppSectionHeader(
            title: store.displayName,
            subtitle:
                '${store.items.length} item${store.items.length == 1 ? '' : 's'}',
            trailing: Text(
              store.actualTotal == null
                  ? 'EUR'
                  : formatPrice(context, store.actualTotal!),
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ),
          if (store.items.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            for (final item in store.items) _BasketStoreItemTile(item: item),
          ],
        ],
      ),
    );
  }
}

class _BasketStoreItemTile extends StatelessWidget {
  const _BasketStoreItemTile({
    required this.item,
  });

  final BasketOptimizedItem item;

  @override
  Widget build(BuildContext context) {
    final unitPriceLabel = formatUnitPrice(
      context,
      price: item.pricePerComparisonBasis,
      comparisonBasis: item.comparisonBasis,
    );
    final subtitle = [
      item.priceStatus,
      if (unitPriceLabel != null) unitPriceLabel,
    ].where((value) => value.trim().isNotEmpty).join(' - ');

    return ListTile(
      dense: true,
      contentPadding: EdgeInsets.zero,
      title: Text(item.displayName),
      titleTextStyle: Theme.of(context).textTheme.titleSmall,
      subtitle: subtitle.isEmpty
          ? null
          : Text(
              subtitle,
              style: Theme.of(context).textTheme.bodySmall,
            ),
      trailing: Text(
          item.lineTotal == null ? '-' : formatPrice(context, item.lineTotal!)),
    );
  }
}

class _BasketWarningsCard extends StatelessWidget {
  const _BasketWarningsCard({
    required this.warnings,
  });

  final List<String> warnings;

  @override
  Widget build(BuildContext context) {
    return AppSectionCard(
      key: const Key('basket-warnings-card'),
      backgroundColor: const Color(0xFFFFF4D9),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Notes',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: AppSpacing.sm),
          for (final warning in warnings)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.xs),
              child: Text(warning),
            ),
        ],
      ),
    );
  }
}

class _BasketExplanationCard extends StatelessWidget {
  const _BasketExplanationCard({
    required this.explanation,
  });

  final BasketExplanation explanation;

  @override
  Widget build(BuildContext context) {
    return AppSectionCard(
      key: const Key('basket-explanation-card'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppSectionHeader(
            title: explanation.headline.isEmpty
                ? 'Basket explanation'
                : explanation.headline,
            subtitle: explanation.summaryText.isEmpty
                ? null
                : explanation.summaryText,
          ),
          if (explanation.itemNotes.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            for (final note in explanation.itemNotes)
              if (note.message.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                  child: Text(note.message),
                ),
          ],
          if (explanation.limitations.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            Text(
              'Limitations',
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(height: AppSpacing.xs),
            for (final limitation in explanation.limitations)
              if (limitation.message.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                  child: Text(limitation.message),
                ),
          ],
        ],
      ),
    );
  }
}
