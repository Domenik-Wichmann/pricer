import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../../firebase_options.dart';
import 'ad_service.dart';
import 'api_client.dart';
import 'billing_repositories.dart';
import 'current_location_service.dart';
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
    required this.currentLocationService,
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
  final CurrentLocationService currentLocationService;
  final bool firestoreConfigured;
  final String firestoreStatus;
  final bool subscriptionConfigured;
  final bool admobConfigured;

  static const _firebaseBootstrapTimeout = Duration(seconds: 5);
  static const _serviceBootstrapTimeout = Duration(seconds: 5);

  static String resolveApiBaseUrl() {
    const configured = String.fromEnvironment('PRICER_API_BASE_URL');
    final trimmed = configured.trim();
    if (trimmed.isNotEmpty) {
      return trimmed;
    }

    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:5001';
    }

    return 'http://localhost:5001';
  }

  static AppDependencies startupFallback({
    String anonymousUserId = 'anon-startup',
    String firestoreStatus =
        'Starting locally. Remote services are still initializing.',
  }) {
    final billingRepository = InMemoryMonetizationProfileRepository(
      anonymousUserId: anonymousUserId,
    );
    final monetizationService = MonetizationService(
      userId: anonymousUserId,
      repository: billingRepository,
      subscriptionService: DisabledSubscriptionService(),
    );

    return AppDependencies(
      anonymousUserId: anonymousUserId,
      apiClient: QueryApiClient(
        baseUrl: resolveApiBaseUrl(),
        httpClient: http.Client(),
      ),
      shoppingListsRepository: InMemoryShoppingListsRepository(),
      watchlistRepository: InMemoryWatchlistRepository(),
      monetizationProfileRepository: billingRepository,
      monetizationService: monetizationService,
      adService: DisabledAdService(),
      voiceInputService: SpeechToTextVoiceInputService(),
      recentActivityService: SharedPreferencesRecentActivityService(),
      currentLocationService: const GeolocatorCurrentLocationService(),
      firestoreConfigured: false,
      firestoreStatus: firestoreStatus,
      subscriptionConfigured: false,
      admobConfigured: false,
    );
  }

  static Future<AppDependencies> bootstrap() async {
    final apiBaseUrl = resolveApiBaseUrl();

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
      if (kDebugMode) {
        debugPrint(
            'Firebase disabled: configuration is missing or placeholder.');
      }
      final billingRepository = InMemoryMonetizationProfileRepository(
        anonymousUserId: anonymousUserId,
      );
      final monetizationService = MonetizationService(
        userId: anonymousUserId,
        repository: billingRepository,
        subscriptionService: subscriptionService,
      );
      await _safeInitializeMonetization(monetizationService);
      final initializedAdService = await _safeInitializeAdService(adService);

      return AppDependencies(
        anonymousUserId: anonymousUserId,
        apiClient: apiClient,
        shoppingListsRepository: InMemoryShoppingListsRepository(),
        watchlistRepository: InMemoryWatchlistRepository(),
        monetizationProfileRepository: billingRepository,
        monetizationService: monetizationService,
        adService: initializedAdService,
        voiceInputService: SpeechToTextVoiceInputService(),
        recentActivityService: SharedPreferencesRecentActivityService(),
        currentLocationService: const GeolocatorCurrentLocationService(),
        firestoreConfigured: false,
        firestoreStatus:
            'Firebase is not configured yet. Lists and watchlists are running in memory.',
        subscriptionConfigured: subscriptionService.isConfigured,
        admobConfigured: initializedAdService.isConfigured,
      );
    }

    try {
      await Firebase.initializeApp(
        options: firebaseOptions,
      ).timeout(_firebaseBootstrapTimeout);
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
      await _safeInitializeMonetization(monetizationService);
      final initializedAdService = await _safeInitializeAdService(adService);

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
        adService: initializedAdService,
        voiceInputService: SpeechToTextVoiceInputService(),
        recentActivityService: SharedPreferencesRecentActivityService(),
        currentLocationService: const GeolocatorCurrentLocationService(),
        firestoreConfigured: true,
        firestoreStatus:
            'Firestore is connected for anonymous lists and watchlists.',
        subscriptionConfigured: subscriptionService.isConfigured,
        admobConfigured: initializedAdService.isConfigured,
      );
    } catch (error) {
      if (kDebugMode) {
        debugPrint(
          'Firebase/Firestore bootstrap failed; using local fallback: $error',
        );
      }

      final billingRepository = InMemoryMonetizationProfileRepository(
        anonymousUserId: anonymousUserId,
      );
      final monetizationService = MonetizationService(
        userId: anonymousUserId,
        repository: billingRepository,
        subscriptionService: subscriptionService,
      );
      await _safeInitializeMonetization(monetizationService);
      final initializedAdService = await _safeInitializeAdService(adService);

      return AppDependencies(
        anonymousUserId: anonymousUserId,
        apiClient: apiClient,
        shoppingListsRepository: InMemoryShoppingListsRepository(),
        watchlistRepository: InMemoryWatchlistRepository(),
        monetizationProfileRepository: billingRepository,
        monetizationService: monetizationService,
        adService: initializedAdService,
        voiceInputService: SpeechToTextVoiceInputService(),
        recentActivityService: SharedPreferencesRecentActivityService(),
        currentLocationService: const GeolocatorCurrentLocationService(),
        firestoreConfigured: false,
        firestoreStatus:
            'Firebase bootstrap failed. Lists and watchlists are running in memory.',
        subscriptionConfigured: subscriptionService.isConfigured,
        admobConfigured: initializedAdService.isConfigured,
      );
    }
  }

  static Future<void> _safeInitializeMonetization(
    MonetizationService monetizationService,
  ) async {
    try {
      await monetizationService.initialize().timeout(_serviceBootstrapTimeout);
    } catch (error) {
      if (kDebugMode) {
        debugPrint('Monetization bootstrap skipped: $error');
      }
    }
  }

  static Future<AppAdService> _safeInitializeAdService(
    AppAdService adService,
  ) async {
    try {
      await adService.initialize().timeout(_serviceBootstrapTimeout);
      return adService;
    } catch (error) {
      if (kDebugMode) {
        debugPrint('AdMob bootstrap skipped: $error');
      }
      return DisabledAdService();
    }
  }
}
