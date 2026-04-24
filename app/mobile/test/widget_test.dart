import 'package:flutter/widgets.dart';
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

class _SmokeApiClient extends QueryApiClient {
  _SmokeApiClient() : super(baseUrl: 'http://example.test');

  @override
  Future<QueryResponse> query(String query) async {
    return const QueryResponse(
      parsedQuery: {'raw_query': 'milk'},
      filtersApplied: {},
      cheapestStore: 'Store A',
      totalCost: 1.60,
      items: [],
    );
  }
}

class _SmokeVoiceInputService implements VoiceInputService {
  @override
  Future<String?> captureOnce() async => null;
}

class _SmokeSubscriptionService implements SubscriptionService {
  @override
  bool get isConfigured => false;

  @override
  Future<void> initialize({required String appUserId}) async {}

  @override
  Future<List<MonetizationPackage>> loadPackages() async =>
      const <MonetizationPackage>[];

  @override
  Future<MonetizationProfile> purchasePackage({
    required String userId,
    required MonetizationPackage package,
  }) async {
    return MonetizationProfile.free(userId);
  }

  @override
  Future<MonetizationProfile> refreshProfile({required String userId}) async {
    return MonetizationProfile.free(userId);
  }

  @override
  Future<MonetizationProfile> restorePurchases({required String userId}) async {
    return MonetizationProfile.free(userId);
  }
}

class _SmokeAdService implements AppAdService {
  @override
  bool get isConfigured => false;

  @override
  Widget bannerSlot({
    Key? key,
    required bool enabled,
  }) {
    return const SizedBox.shrink();
  }

  @override
  Future<void> initialize() async {}

  @override
  Future<void> maybeShowInterstitial({
    required bool enabled,
    String placement = 'default',
  }) async {}
}

void main() {
  testWidgets('localized app shell boots in english', (tester) async {
    final billingRepository = InMemoryMonetizationProfileRepository(
      anonymousUserId: 'anon-smoke',
    );
    final dependencies = AppDependencies(
      anonymousUserId: 'anon-smoke',
      apiClient: _SmokeApiClient(),
      shoppingListsRepository: InMemoryShoppingListsRepository(),
      watchlistRepository: InMemoryWatchlistRepository(),
      monetizationProfileRepository: billingRepository,
      monetizationService: MonetizationService(
        userId: 'anon-smoke',
        repository: billingRepository,
        subscriptionService: _SmokeSubscriptionService(),
      ),
      adService: _SmokeAdService(),
      voiceInputService: _SmokeVoiceInputService(),
      recentActivityService: InMemoryRecentActivityService(),
      firestoreConfigured: false,
      firestoreStatus: 'Test mode',
      subscriptionConfigured: false,
      admobConfigured: false,
    );

    await tester.pumpWidget(
      PricerApp(
        dependencies: dependencies,
      ),
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(const Key('search-input')),
      200,
      scrollable: find.byType(Scrollable).first,
    );

    expect(find.text('Search'), findsOneWidget);
    expect(find.byKey(const Key('search-input')), findsOneWidget);
  });
}
