import 'package:flutter/foundation.dart';
import 'package:purchases_flutter/purchases_flutter.dart' as rc;

import '../models/app_models.dart';
import 'billing_repositories.dart';
import 'monetization_config.dart';

abstract class SubscriptionService {
  bool get isConfigured;

  Future<void> initialize({required String appUserId});

  Future<List<MonetizationPackage>> loadPackages();

  Future<MonetizationProfile> refreshProfile({required String userId});

  Future<MonetizationProfile> purchasePackage({
    required String userId,
    required MonetizationPackage package,
  });

  Future<MonetizationProfile> restorePurchases({required String userId});
}

class RevenueCatSubscriptionService implements SubscriptionService {
  RevenueCatSubscriptionService({
    required MonetizationConfig config,
  }) : _config = config;

  final MonetizationConfig _config;
  String? _configuredUserId;

  @override
  bool get isConfigured => _resolveApiKey().isNotEmpty;

  @override
  Future<void> initialize({required String appUserId}) async {
    final apiKey = _resolveApiKey();
    if (apiKey.isEmpty || _configuredUserId == appUserId) {
      if (apiKey.isEmpty && kDebugMode) {
        debugPrint('RevenueCat disabled: no real API key configured.');
      }
      return;
    }

    rc.Purchases.setLogLevel(kDebugMode ? rc.LogLevel.debug : rc.LogLevel.info);
    await rc.Purchases.configure(
      rc.PurchasesConfiguration(apiKey)..appUserID = appUserId,
    );
    _configuredUserId = appUserId;
  }

  @override
  Future<List<MonetizationPackage>> loadPackages() async {
    if (!isConfigured) {
      return const <MonetizationPackage>[];
    }

    final offerings = await rc.Purchases.getOfferings();
    final current = offerings.current;
    if (current == null) {
      return const <MonetizationPackage>[];
    }

    return current.availablePackages.map((package) {
      return MonetizationPackage(
        identifier: package.identifier,
        title: package.storeProduct.title,
        description: package.storeProduct.description,
        priceLabel: package.storeProduct.priceString,
        storeProductId: package.storeProduct.identifier,
        packageType: package.packageType.name,
      );
    }).toList();
  }

  @override
  Future<MonetizationProfile> refreshProfile({required String userId}) async {
    if (!isConfigured) {
      return MonetizationProfile.free(userId);
    }

    final info = await rc.Purchases.getCustomerInfo();
    return _profileFromCustomerInfo(userId: userId, info: info);
  }

  @override
  Future<MonetizationProfile> purchasePackage({
    required String userId,
    required MonetizationPackage package,
  }) async {
    if (!isConfigured) {
      return MonetizationProfile.free(userId);
    }

    final offerings = await rc.Purchases.getOfferings();
    final current = offerings.current;
    if (current == null) {
      return MonetizationProfile.free(userId);
    }

    final selected = current.availablePackages.where((entry) {
      return entry.identifier == package.identifier ||
          entry.storeProduct.identifier == package.storeProductId;
    }).toList();

    if (selected.isEmpty) {
      throw StateError('No matching RevenueCat package was found.');
    }

    await rc.Purchases.purchase(
      rc.PurchaseParams.package(selected.first),
    );
    return refreshProfile(userId: userId);
  }

  @override
  Future<MonetizationProfile> restorePurchases({required String userId}) async {
    if (!isConfigured) {
      return MonetizationProfile.free(userId);
    }

    final info = await rc.Purchases.restorePurchases();
    return _profileFromCustomerInfo(userId: userId, info: info);
  }

  MonetizationProfile _profileFromCustomerInfo({
    required String userId,
    required rc.CustomerInfo info,
  }) {
    final entitlement =
        info.entitlements.active[_config.revenueCatEntitlementId];
    final isPremium = entitlement != null;

    return MonetizationProfile(
      userId: userId,
      tier: isPremium ? 'premium' : 'free',
      premiumActive: isPremium,
      adsEnabled: !isPremium,
      alertsEnabled: isPremium,
      optimizerMultiStoreEnabled: isPremium,
      maxOptimizerItems: isPremium ? 25 : 8,
      maxWatchlistItems: isPremium ? 250 : 20,
      maxTargetPriceAlerts: isPremium ? 250 : 3,
      revenuecatCustomerId: info.originalAppUserId,
      revenuecatEntitlementId:
          entitlement?.identifier ?? _config.revenueCatEntitlementId,
      revenuecatProductId: entitlement?.productIdentifier,
      entitlementStatus: isPremium ? 'active' : 'inactive',
      entitlementSource: 'revenuecat_sdk',
      expiresAt: _parseDateTime(entitlement?.expirationDate),
      updatedAt: DateTime.now(),
    );
  }

  String _resolveApiKey() {
    return _config.currentRevenueCatApiKey;
  }

  DateTime? _parseDateTime(String? value) {
    if (value == null || value.isEmpty) {
      return null;
    }

    return DateTime.tryParse(value);
  }
}

class DisabledSubscriptionService implements SubscriptionService {
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

class MonetizationService {
  MonetizationService({
    required this.userId,
    required this.repository,
    required this.subscriptionService,
  });

  final String userId;
  final MonetizationProfileRepository repository;
  final SubscriptionService subscriptionService;

  Stream<MonetizationProfile> watchProfile() => repository.watchProfile();

  Future<MonetizationProfile> readProfile() => repository.readProfile();

  Future<MonetizationProfile> initialize() async {
    try {
      await subscriptionService.initialize(appUserId: userId);
    } catch (error) {
      if (kDebugMode) {
        debugPrint('Subscription initialization skipped: $error');
      }
    }

    final existing = await _readProfileSafely();
    if (!subscriptionService.isConfigured) {
      return existing;
    }

    try {
      final refreshed =
          await subscriptionService.refreshProfile(userId: userId);
      await _saveProfileSafely(refreshed);
      return refreshed;
    } catch (error) {
      if (kDebugMode) {
        debugPrint('Subscription profile refresh skipped: $error');
      }
      return existing;
    }
  }

  Future<List<MonetizationPackage>> loadPackages() {
    return subscriptionService.loadPackages();
  }

  Future<MonetizationProfile> purchase(MonetizationPackage package) async {
    final profile = await subscriptionService.purchasePackage(
      userId: userId,
      package: package,
    );
    await repository.saveProfile(profile);
    return profile;
  }

  Future<MonetizationProfile> restore() async {
    final profile = await subscriptionService.restorePurchases(userId: userId);
    await repository.saveProfile(profile);
    return profile;
  }

  Future<MonetizationProfile> refresh() async {
    final profile = await subscriptionService.refreshProfile(userId: userId);
    await repository.saveProfile(profile);
    return profile;
  }

  Future<MonetizationProfile> _readProfileSafely() async {
    try {
      return await repository.readProfile();
    } catch (error) {
      if (kDebugMode) {
        debugPrint('Billing profile read failed; using free profile: $error');
      }
      return MonetizationProfile.free(userId);
    }
  }

  Future<void> _saveProfileSafely(MonetizationProfile profile) async {
    try {
      await repository.saveProfile(profile);
    } catch (error) {
      if (kDebugMode) {
        debugPrint('Billing profile save failed: $error');
      }
    }
  }
}
