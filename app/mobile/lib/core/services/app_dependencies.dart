import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../../firebase_options.dart';
import 'ad_service.dart';
import 'api_client.dart';
import 'billing_repositories.dart';
import 'firebase_bootstrap.dart';
import 'firestore_repositories.dart';
import 'local_identity_service.dart';
import 'monetization_config.dart';
import 'monetization_service.dart';
import 'recent_activity_service.dart';
import 'voice_input_service.dart';

class AppDependencies {
  const AppDependencies({
    required this.anonymousUserId,
    required this.apiClient,
    required this.shoppingListsRepository,
    required this.watchlistRepository,
    required this.monetizationProfileRepository,
    required this.monetizationService,
    required this.adService,
    required this.voiceInputService,
    required this.recentActivityService,
    required this.firestoreConfigured,
    required this.firestoreStatus,
    required this.subscriptionConfigured,
    required this.admobConfigured,
  });

  final String anonymousUserId;
  final QueryApiClient apiClient;
  final ShoppingListsRepository shoppingListsRepository;
  final WatchlistRepository watchlistRepository;
  final MonetizationProfileRepository monetizationProfileRepository;
  final MonetizationService monetizationService;
  final AppAdService adService;
  final VoiceInputService voiceInputService;
  final RecentActivityService recentActivityService;
  final bool firestoreConfigured;
  final String firestoreStatus;
  final bool subscriptionConfigured;
  final bool admobConfigured;

  static Future<AppDependencies> bootstrap() async {
    final apiBaseUrl = const String.fromEnvironment(
      'PRICER_API_BASE_URL',
      defaultValue: 'http://localhost:5001',
    );

    final identityService = LocalIdentityService();
    final anonymousUserId = await identityService.getOrCreateAnonymousId();
    final apiClient = QueryApiClient(
      baseUrl: apiBaseUrl,
      httpClient: http.Client(),
    );
    final monetizationConfig = MonetizationConfig.fromEnvironment();
    final subscriptionService = monetizationConfig.revenueCatConfigured
        ? RevenueCatSubscriptionService(config: monetizationConfig)
        : DisabledSubscriptionService();
    final adService = monetizationConfig.admobConfigured
        ? GoogleMobileAdsService(config: monetizationConfig)
        : DisabledAdService();

    final firebaseOptions = DefaultFirebaseOptions.currentPlatform;

    if (!FirebaseBootstrapConfig.isConfigured(firebaseOptions)) {
      final billingRepository = InMemoryMonetizationProfileRepository(
        anonymousUserId: anonymousUserId,
      );
      final monetizationService = MonetizationService(
        userId: anonymousUserId,
        repository: billingRepository,
        subscriptionService: subscriptionService,
      );
      await monetizationService.initialize();
      await adService.initialize();

      return AppDependencies(
        anonymousUserId: anonymousUserId,
        apiClient: apiClient,
        shoppingListsRepository: InMemoryShoppingListsRepository(),
        watchlistRepository: InMemoryWatchlistRepository(),
        monetizationProfileRepository: billingRepository,
        monetizationService: monetizationService,
        adService: adService,
        voiceInputService: SpeechToTextVoiceInputService(),
        recentActivityService: SharedPreferencesRecentActivityService(),
        firestoreConfigured: false,
        firestoreStatus:
            'Firebase is not configured yet. Lists and watchlists are running in memory.',
        subscriptionConfigured: subscriptionService.isConfigured,
        admobConfigured: adService.isConfigured,
      );
    }

    try {
      await Firebase.initializeApp(
        options: firebaseOptions,
      );
      final firestore = FirebaseFirestore.instance;
      final billingRepository = FirestoreMonetizationProfileRepository(
        firestore: firestore,
        anonymousUserId: anonymousUserId,
      );
      final monetizationService = MonetizationService(
        userId: anonymousUserId,
        repository: billingRepository,
        subscriptionService: subscriptionService,
      );
      await monetizationService.initialize();
      await adService.initialize();

      return AppDependencies(
        anonymousUserId: anonymousUserId,
        apiClient: apiClient,
        shoppingListsRepository: FirestoreShoppingListsRepository(
          firestore: firestore,
          anonymousUserId: anonymousUserId,
        ),
        watchlistRepository: FirestoreWatchlistRepository(
          firestore: firestore,
          anonymousUserId: anonymousUserId,
        ),
        monetizationProfileRepository: billingRepository,
        monetizationService: monetizationService,
        adService: adService,
        voiceInputService: SpeechToTextVoiceInputService(),
        recentActivityService: SharedPreferencesRecentActivityService(),
        firestoreConfigured: true,
        firestoreStatus:
            'Firestore is connected for anonymous lists and watchlists.',
        subscriptionConfigured: subscriptionService.isConfigured,
        admobConfigured: adService.isConfigured,
      );
    } catch (error) {
      if (kDebugMode) {
        debugPrint('Firebase bootstrap failed: $error');
      }

      final billingRepository = InMemoryMonetizationProfileRepository(
        anonymousUserId: anonymousUserId,
      );
      final monetizationService = MonetizationService(
        userId: anonymousUserId,
        repository: billingRepository,
        subscriptionService: subscriptionService,
      );
      await monetizationService.initialize();
      await adService.initialize();

      return AppDependencies(
        anonymousUserId: anonymousUserId,
        apiClient: apiClient,
        shoppingListsRepository: InMemoryShoppingListsRepository(),
        watchlistRepository: InMemoryWatchlistRepository(),
        monetizationProfileRepository: billingRepository,
        monetizationService: monetizationService,
        adService: adService,
        voiceInputService: SpeechToTextVoiceInputService(),
        recentActivityService: SharedPreferencesRecentActivityService(),
        firestoreConfigured: false,
        firestoreStatus:
            'Firebase bootstrap failed. Lists and watchlists are running in memory.',
        subscriptionConfigured: subscriptionService.isConfigured,
        admobConfigured: adService.isConfigured,
      );
    }
  }
}
