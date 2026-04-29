import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:pricer_mobile/core/models/app_models.dart';
import 'package:pricer_mobile/core/services/ad_service.dart';
import 'package:pricer_mobile/core/services/api_client.dart';
import 'package:pricer_mobile/core/services/app_dependencies.dart';
import 'package:pricer_mobile/core/services/billing_repositories.dart';
import 'package:pricer_mobile/core/services/current_location_service.dart';
import 'package:pricer_mobile/core/services/firestore_repositories.dart';
import 'package:pricer_mobile/core/services/monetization_service.dart';
import 'package:pricer_mobile/core/services/recent_activity_service.dart';
import 'package:pricer_mobile/core/services/voice_input_service.dart';
import 'package:pricer_mobile/main.dart';

class _ImmediateApiClient extends QueryApiClient {
  _ImmediateApiClient() : super(baseUrl: 'http://example.test');

  @override
  Future<HomeSummary> getHomeSummary({
    required String ownerId,
    String ownerType = 'anonymous',
  }) async {
    return HomeSummary.empty();
  }
}

class _QuietVoiceInputService implements VoiceInputService {
  @override
  Future<String?> captureOnce() async => null;
}

class _FailingProfileRepository implements MonetizationProfileRepository {
  @override
  Future<MonetizationProfile> readProfile() {
    throw StateError('firestore billing read failed');
  }

  @override
  Future<void> saveProfile(MonetizationProfile profile) async {}

  @override
  Stream<MonetizationProfile> watchProfile() {
    throw StateError('firestore billing watch failed');
  }
}

AppDependencies _testDependencies({
  QueryApiClient? apiClient,
  String userId = 'anon-startup-test',
}) {
  final billingRepository = InMemoryMonetizationProfileRepository(
    anonymousUserId: userId,
  );
  return AppDependencies(
    anonymousUserId: userId,
    apiClient: apiClient ?? _ImmediateApiClient(),
    shoppingListsRepository: InMemoryShoppingListsRepository(),
    watchlistRepository: InMemoryWatchlistRepository(),
    monetizationProfileRepository: billingRepository,
    monetizationService: MonetizationService(
      userId: userId,
      repository: billingRepository,
      subscriptionService: DisabledSubscriptionService(),
    ),
    adService: DisabledAdService(),
    voiceInputService: _QuietVoiceInputService(),
    recentActivityService: InMemoryRecentActivityService(),
    currentLocationService: const DisabledCurrentLocationService(),
    firestoreConfigured: false,
    firestoreStatus: 'Test fallback mode',
    subscriptionConfigured: false,
    admobConfigured: false,
  );
}

void main() {
  testWidgets('shell renders while full bootstrap is still pending',
      (tester) async {
    final pendingBootstrap = Completer<AppDependencies>();

    await tester.pumpWidget(
      PricerBootstrapApp(
        initialDependencies: _testDependencies(),
        bootstrapper: () => pendingBootstrap.future,
      ),
    );
    await tester.pump();

    expect(find.byKey(const Key('search-input')), findsOneWidget);
  });

  testWidgets('shell remains visible when bootstrap fails', (tester) async {
    await tester.pumpWidget(
      PricerBootstrapApp(
        initialDependencies: _testDependencies(),
        bootstrapper: () async {
          throw StateError('firebase init failed');
        },
      ),
    );
    await tester.pump();
    await tester.pump();

    expect(find.byKey(const Key('search-input')), findsOneWidget);
  });

  test('Firestore billing read failure falls back to a free profile', () async {
    final service = MonetizationService(
      userId: 'anon-billing-failure',
      repository: _FailingProfileRepository(),
      subscriptionService: DisabledSubscriptionService(),
    );

    final profile = await service.initialize();

    expect(profile.userId, 'anon-billing-failure');
    expect(profile.premiumActive, isFalse);
    expect(profile.adsEnabled, isTrue);
  });

  testWidgets('missing monetization config does not block startup',
      (tester) async {
    await tester.pumpWidget(
      PricerBootstrapApp(
        initialDependencies: AppDependencies.startupFallback(),
        bootstrapper: () async => AppDependencies.startupFallback(),
      ),
    );
    await tester.pump();

    expect(find.byKey(const Key('search-input')), findsOneWidget);
  });

  testWidgets('home summary timeout shows the existing error state',
      (tester) async {
    final hangingClient = QueryApiClient(
      baseUrl: 'http://example.test',
      requestTimeout: const Duration(milliseconds: 10),
      httpClient: MockClient((request) => Completer<http.Response>().future),
    );

    await tester.pumpWidget(
      PricerBootstrapApp(
        initialDependencies: _testDependencies(apiClient: hangingClient),
        bootstrapper: () async => _testDependencies(apiClient: hangingClient),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 250));

    await tester.scrollUntilVisible(
      find.byKey(const Key('home-summary-error')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.byKey(const Key('home-summary-error')), findsOneWidget);
  });

  test('QueryApiClient applies bounded request timeouts', () async {
    final client = QueryApiClient(
      baseUrl: 'http://example.test',
      requestTimeout: const Duration(milliseconds: 10),
      httpClient: MockClient((request) => Completer<http.Response>().future),
    );

    await expectLater(
      client.getHomeSummary(ownerId: 'anon-timeout'),
      throwsA(isA<TimeoutException>()),
    );
  });
}
