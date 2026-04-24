import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pricer_mobile/app.dart';
import 'package:pricer_mobile/core/models/app_models.dart';
import 'package:pricer_mobile/core/services/ad_service.dart';
import 'package:pricer_mobile/core/services/api_client.dart';
import 'package:pricer_mobile/core/services/app_dependencies.dart';
import 'package:pricer_mobile/core/services/billing_repositories.dart';
import 'package:pricer_mobile/core/services/firestore_repositories.dart';
import 'package:pricer_mobile/core/services/monetization_service.dart';
import 'package:pricer_mobile/core/services/recent_activity_service.dart';
import 'package:pricer_mobile/core/services/voice_input_service.dart';

class FakeApiClient extends QueryApiClient {
  FakeApiClient() : super(baseUrl: 'http://example.test');

  @override
  Future<QueryResponse> query(String query) async {
    if (query == 'broken') {
      throw QueryApiException('broken');
    }

    return const QueryResponse(
      parsedQuery: {'raw_query': 'milk'},
      filtersApplied: {},
      cheapestStore: 'Store A',
      totalCost: 1.60,
      items: [
        QueryResultItem(
          sourceProductId: 'milk-v',
          productNameRaw: 'milk',
          displayEn: 'Fresh milk Vereya 3% 1L',
          categoryCode: '6',
          productType: 'fresh_milk',
          productFamily: 'milk',
          brand: 'Vereya',
          storeNameRaw: 'Store A',
          locationCode: '1000',
          currentPrice: 1.60,
          retailPrice: 1.80,
          promoPrice: 1.60,
          matchScore: 0.95,
          matchReasons: ['exact_normalized_name'],
          historyAvgPrice: 1.75,
          storeCount: 1,
          rankScore: 1.2,
        ),
      ],
    );
  }

  @override
  Future<List<ProductHistoryPoint>> getProductHistory(
      String sourceProductId) async {
    return const [
      ProductHistoryPoint(
        date: '2026-04-21',
        priceAvg: 1.70,
        priceMin: 1.65,
        priceMax: 1.80,
        storeCount: 1,
        snapshotCount: 1,
      ),
      ProductHistoryPoint(
        date: '2026-04-22',
        priceAvg: 1.75,
        priceMin: 1.70,
        priceMax: 1.85,
        storeCount: 1,
        snapshotCount: 1,
      ),
    ];
  }
}

class FakeVoiceInputService implements VoiceInputService {
  @override
  Future<String?> captureOnce() async => 'milk';
}

class FakeSubscriptionService implements SubscriptionService {
  FakeSubscriptionService({
    required this.profile,
    this.configured = true,
    this.packages = const [
      MonetizationPackage(
        identifier: 'monthly',
        title: 'Premium monthly',
        description: 'Unlock all premium savings features.',
        priceLabel: '\$4.99',
        storeProductId: 'premium_monthly',
        packageType: 'monthly',
      ),
    ],
  });

  MonetizationProfile profile;
  final bool configured;
  final List<MonetizationPackage> packages;

  @override
  bool get isConfigured => configured;

  @override
  Future<void> initialize({required String appUserId}) async {}

  @override
  Future<List<MonetizationPackage>> loadPackages() async => packages;

  @override
  Future<MonetizationProfile> purchasePackage({
    required String userId,
    required MonetizationPackage package,
  }) async {
    profile = MonetizationProfile(
      userId: userId,
      tier: 'premium',
      premiumActive: true,
      adsEnabled: false,
      alertsEnabled: true,
      optimizerMultiStoreEnabled: true,
      maxOptimizerItems: 25,
      maxWatchlistItems: 250,
      maxTargetPriceAlerts: 250,
      revenuecatProductId: package.storeProductId,
      entitlementStatus: 'active',
      entitlementSource: 'test',
    );
    return profile;
  }

  @override
  Future<MonetizationProfile> refreshProfile({required String userId}) async =>
      profile;

  @override
  Future<MonetizationProfile> restorePurchases(
          {required String userId}) async =>
      profile;
}

class FakeAdService implements AppAdService {
  int interstitialCount = 0;

  @override
  bool get isConfigured => true;

  @override
  Widget bannerSlot({
    Key? key,
    required bool enabled,
  }) {
    if (!enabled) {
      return const SizedBox.shrink();
    }

    return SizedBox(
      key: key,
      height: 24,
      child: const Text('Test Ad'),
    );
  }

  @override
  Future<void> initialize() async {}

  @override
  Future<void> maybeShowInterstitial({
    required bool enabled,
    String placement = 'default',
  }) async {
    if (enabled) {
      interstitialCount += 1;
    }
  }
}

void main() {
  AppDependencies buildDependencies({
    MonetizationProfile? profile,
    bool subscriptionConfigured = true,
  }) {
    final userId = 'anon-test';
    final initialProfile = profile ?? MonetizationProfile.free(userId);
    final billingRepository = InMemoryMonetizationProfileRepository(
      anonymousUserId: userId,
    );
    final subscriptionService = FakeSubscriptionService(
      profile: initialProfile,
      configured: subscriptionConfigured,
    );
    final monetizationService = MonetizationService(
      userId: userId,
      repository: billingRepository,
      subscriptionService: subscriptionService,
    );
    billingRepository.saveProfile(initialProfile);

    return AppDependencies(
      anonymousUserId: userId,
      apiClient: FakeApiClient(),
      shoppingListsRepository: InMemoryShoppingListsRepository(),
      watchlistRepository: InMemoryWatchlistRepository(),
      monetizationProfileRepository: billingRepository,
      monetizationService: monetizationService,
      adService: FakeAdService(),
      voiceInputService: FakeVoiceInputService(),
      recentActivityService: InMemoryRecentActivityService(),
      firestoreConfigured: false,
      firestoreStatus: 'Test mode',
      subscriptionConfigured: subscriptionConfigured,
      admobConfigured: true,
    );
  }

  testWidgets('english rendering shows localized app shell', (tester) async {
    final dependencies = buildDependencies();
    await dependencies.recentActivityService.rememberSearch('cheap milk');

    await tester.pumpWidget(
      PricerApp(
        dependencies: dependencies,
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(const Key('search-input')),
      200,
      scrollable: find.byType(Scrollable).first,
    );

    expect(find.text('Search'), findsOneWidget);
    expect(find.text('What do you want to buy?'), findsOneWidget);
    expect(find.byKey(const Key('daily-insight-card')), findsOneWidget);
  });

  testWidgets('bulgarian rendering shows localized app shell', (tester) async {
    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(),
        locale: const Locale('bg'),
      ),
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(const Key('search-input')),
      200,
      scrollable: find.byType(Scrollable).first,
    );

    expect(find.text('Search'), findsNothing);
    expect(find.text('What do you want to buy?'), findsNothing);
    expect(find.byKey(const Key('daily-insight-card')), findsOneWidget);
    expect(find.byKey(const Key('search-input')), findsOneWidget);
  });

  testWidgets('unsupported locale falls back safely to english',
      (tester) async {
    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(),
        locale: const Locale('de'),
      ),
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(const Key('search-input')),
      200,
      scrollable: find.byType(Scrollable).first,
    );

    expect(find.text('Search'), findsOneWidget);
    expect(find.text('What do you want to buy?'), findsOneWidget);
  });

  testWidgets('search flow still renders localized results', (tester) async {
    await tester.pumpWidget(
      PricerApp(
        dependencies: buildDependencies(),
        locale: const Locale('en'),
      ),
    );
    await tester.scrollUntilVisible(
      find.byKey(const Key('search-input')),
      200,
      scrollable: find.byType(Scrollable).first,
    );

    await tester.enterText(find.byKey(const Key('search-input')), 'milk');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('results-summary-card')), findsOneWidget);
    expect(find.text('Cheapest basket today'), findsOneWidget);
    expect(find.byKey(const Key('share-results-button')), findsOneWidget);
  });

  testWidgets('watchlist summary banner still renders with localization',
      (tester) async {
    final dependencies = buildDependencies();
    await dependencies.watchlistRepository.upsert(
      productId: 'milk-v',
      displayName: 'Fresh milk Vereya 3% 1L',
      targetPrice: 1.70,
      currentPrice: 1.60,
    );

    await tester.pumpWidget(
      PricerApp(
        dependencies: dependencies,
        locale: const Locale('en'),
      ),
    );
    await tester.tap(find.text('Watchlist'));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('watchlist-drops-summary')), findsOneWidget);
    expect(find.text('Drops summary'), findsOneWidget);
    expect(find.byKey(const Key('watchlist-premium-card')), findsOneWidget);
  });

  testWidgets('paywall renders and hides ads for premium users',
      (tester) async {
    final dependencies = buildDependencies(
      profile: const MonetizationProfile(
        userId: 'anon-test',
        tier: 'premium',
        premiumActive: true,
        adsEnabled: false,
        alertsEnabled: true,
        optimizerMultiStoreEnabled: true,
        maxOptimizerItems: 25,
        maxWatchlistItems: 250,
        maxTargetPriceAlerts: 250,
        entitlementStatus: 'active',
        entitlementSource: 'test',
      ),
    );

    await tester.pumpWidget(
      PricerApp(
        dependencies: dependencies,
        locale: const Locale('en'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('home-banner-ad')), findsNothing);
    await tester.scrollUntilVisible(
      find.byKey(const Key('open-paywall-button')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.byKey(const Key('open-paywall-button')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('paywall-status-card')), findsOneWidget);
    expect(find.text('Premium is active'), findsWidgets);
  });
}
