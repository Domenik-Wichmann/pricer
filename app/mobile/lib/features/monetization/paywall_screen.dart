import 'package:flutter/material.dart';
import 'package:pricer_mobile/src/generated/l10n/app_localizations.dart';

import '../../core/models/app_models.dart';
import '../../core/services/app_dependencies.dart';
import '../../core/ui/app_spacing.dart';
import '../../core/ui/app_widgets.dart';

class PaywallScreen extends StatefulWidget {
  const PaywallScreen({
    super.key,
    required this.dependencies,
  });

  final AppDependencies dependencies;

  @override
  State<PaywallScreen> createState() => _PaywallScreenState();
}

class _PaywallScreenState extends State<PaywallScreen> {
  bool _loadingPackages = true;
  bool _busy = false;
  String? _message;
  List<MonetizationPackage> _packages = const <MonetizationPackage>[];

  @override
  void initState() {
    super.initState();
    _loadPackages();
  }

  Future<void> _loadPackages() async {
    final packages =
        await widget.dependencies.monetizationService.loadPackages();
    if (!mounted) {
      return;
    }

    setState(() {
      _packages = packages;
      _loadingPackages = false;
    });
  }

  Future<void> _purchase(MonetizationPackage package) async {
    final l10n = AppLocalizations.of(context)!;
    setState(() {
      _busy = true;
      _message = null;
    });

    try {
      final profile =
          await widget.dependencies.monetizationService.purchase(package);
      if (!mounted) {
        return;
      }

      setState(() {
        _message = profile.premiumActive
            ? l10n.premiumPurchaseSuccess
            : l10n.premiumStillPendingMessage;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _message = l10n.premiumPurchaseFailed;
      });
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
        });
      }
    }
  }

  Future<void> _restore() async {
    final l10n = AppLocalizations.of(context)!;
    setState(() {
      _busy = true;
      _message = null;
    });

    try {
      final profile = await widget.dependencies.monetizationService.restore();
      if (!mounted) {
        return;
      }

      setState(() {
        _message = profile.premiumActive
            ? l10n.restorePurchasesSuccess
            : l10n.restorePurchasesNoActive;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _message = l10n.restorePurchasesFailed;
      });
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.paywallTitle),
      ),
      body: StreamBuilder<MonetizationProfile>(
        stream: widget.dependencies.monetizationService.watchProfile(),
        initialData:
            MonetizationProfile.free(widget.dependencies.anonymousUserId),
        builder: (context, snapshot) {
          final profile = snapshot.data ??
              MonetizationProfile.free(widget.dependencies.anonymousUserId);
          return AppScreen(
            child: ListView(
              children: [
                AppSectionCard(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      AppSectionHeader(
                        title: l10n.paywallHeroTitle,
                        subtitle: profile.premiumActive
                            ? l10n.paywallPremiumActive
                            : l10n.paywallHeroSubtitle,
                      ),
                      const SizedBox(height: AppSpacing.md),
                      Wrap(
                        spacing: AppSpacing.xs,
                        runSpacing: AppSpacing.xs,
                        children: [
                          MetricBadge(
                            label: l10n.paywallFeatureLabel,
                            value: l10n.paywallFeatureOptimizer,
                            icon: Icons.auto_graph_outlined,
                          ),
                          MetricBadge(
                            label: l10n.paywallFeatureLabel,
                            value: l10n.paywallFeatureAlerts,
                            icon: Icons.notifications_active_outlined,
                          ),
                          MetricBadge(
                            label: l10n.paywallFeatureLabel,
                            value: l10n.paywallFeatureNoAds,
                            icon: Icons.block_outlined,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                AppSectionCard(
                  key: const Key('paywall-status-card'),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      AppSectionHeader(
                        title: l10n.subscriptionStatusTitle,
                        subtitle: profile.premiumActive
                            ? l10n.subscriptionPremiumStatus
                            : l10n.subscriptionFreeStatus,
                      ),
                      const SizedBox(height: AppSpacing.md),
                      Text(l10n.watchlistLimitValue(profile.maxWatchlistItems)),
                      const SizedBox(height: AppSpacing.xs),
                      Text(l10n.optimizerLimitValue(profile.maxOptimizerItems)),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                if (_message != null) ...[
                  AppSectionCard(
                    child: Text(_message!),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                ],
                if (!widget.dependencies.subscriptionConfigured)
                  AppSectionCard(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          l10n.billingNotConfiguredTitle,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: AppSpacing.xs),
                        Text(l10n.billingNotConfiguredMessage),
                      ],
                    ),
                  )
                else if (_loadingPackages)
                  const SkeletonCard(height: 180)
                else if (_packages.isEmpty)
                  EmptyStateCard(
                    title: l10n.noSubscriptionPackagesTitle,
                    message: l10n.noSubscriptionPackagesMessage,
                  )
                else
                  for (final package in _packages) ...[
                    AppSectionCard(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            package.title,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: AppSpacing.xs),
                          Text(package.description),
                          const SizedBox(height: AppSpacing.md),
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  package.priceLabel,
                                  style:
                                      Theme.of(context).textTheme.headlineSmall,
                                ),
                              ),
                              Flexible(
                                child: FilledButton(
                                  key: Key('purchase-${package.identifier}'),
                                  style: FilledButton.styleFrom(
                                    minimumSize: const Size(0, 52),
                                  ),
                                  onPressed:
                                      _busy ? null : () => _purchase(package),
                                  child: Text(l10n.purchaseButton),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppSpacing.md),
                  ],
              ],
            ),
          );
        },
      ),
      bottomNavigationBar: BottomSummaryBar(
        title: l10n.restorePurchasesTitle,
        subtitle: l10n.restorePurchasesSubtitle,
        actionLabel: l10n.restoreButton,
        onAction: _busy ? () {} : _restore,
      ),
    );
  }
}
