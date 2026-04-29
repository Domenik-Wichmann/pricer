import 'dart:io';

class MonetizationConfig {
  const MonetizationConfig({
    required this.revenueCatAndroidApiKey,
    required this.revenueCatIosApiKey,
    required this.revenueCatEntitlementId,
    required this.admobAndroidAppId,
    required this.admobIosAppId,
    required this.bannerAdUnitIdAndroid,
    required this.bannerAdUnitIdIos,
    required this.interstitialAdUnitIdAndroid,
    required this.interstitialAdUnitIdIos,
  });

  final String revenueCatAndroidApiKey;
  final String revenueCatIosApiKey;
  final String revenueCatEntitlementId;
  final String admobAndroidAppId;
  final String admobIosAppId;
  final String bannerAdUnitIdAndroid;
  final String bannerAdUnitIdIos;
  final String interstitialAdUnitIdAndroid;
  final String interstitialAdUnitIdIos;

  bool get revenueCatConfigured => currentRevenueCatApiKey.isNotEmpty;

  bool get admobConfigured =>
      currentAdMobAppId.isNotEmpty &&
      (currentBannerAdUnitId.isNotEmpty ||
          currentInterstitialAdUnitId.isNotEmpty);

  String get currentRevenueCatApiKey {
    return Platform.isIOS
        ? _cleanConfigValue(revenueCatIosApiKey)
        : _cleanConfigValue(revenueCatAndroidApiKey);
  }

  String get currentAdMobAppId {
    return Platform.isIOS
        ? _cleanConfigValue(admobIosAppId)
        : _cleanConfigValue(admobAndroidAppId);
  }

  String get currentBannerAdUnitId {
    return Platform.isIOS
        ? _cleanConfigValue(bannerAdUnitIdIos)
        : _cleanConfigValue(bannerAdUnitIdAndroid);
  }

  String get currentInterstitialAdUnitId {
    return Platform.isIOS
        ? _cleanConfigValue(interstitialAdUnitIdIos)
        : _cleanConfigValue(interstitialAdUnitIdAndroid);
  }

  bool get hasBannerAdUnit => currentBannerAdUnitId.isNotEmpty;

  bool get hasInterstitialAdUnit => currentInterstitialAdUnitId.isNotEmpty;

  factory MonetizationConfig.fromEnvironment() {
    return const MonetizationConfig(
      revenueCatAndroidApiKey:
          String.fromEnvironment('REVENUECAT_ANDROID_API_KEY'),
      revenueCatIosApiKey: String.fromEnvironment('REVENUECAT_IOS_API_KEY'),
      revenueCatEntitlementId: String.fromEnvironment(
        'REVENUECAT_ENTITLEMENT_ID',
        defaultValue: 'premium',
      ),
      admobAndroidAppId: String.fromEnvironment(
        'ADMOB_ANDROID_APP_ID',
      ),
      admobIosAppId: String.fromEnvironment(
        'ADMOB_IOS_APP_ID',
      ),
      bannerAdUnitIdAndroid:
          String.fromEnvironment('ADMOB_BANNER_ANDROID_UNIT_ID'),
      bannerAdUnitIdIos: String.fromEnvironment('ADMOB_BANNER_IOS_UNIT_ID'),
      interstitialAdUnitIdAndroid:
          String.fromEnvironment('ADMOB_INTERSTITIAL_ANDROID_UNIT_ID'),
      interstitialAdUnitIdIos:
          String.fromEnvironment('ADMOB_INTERSTITIAL_IOS_UNIT_ID'),
    );
  }
}

String _cleanConfigValue(String value) {
  final trimmed = value.trim();
  final lower = trimmed.toLowerCase();
  if (trimmed.isEmpty ||
      lower.contains('replace_me') ||
      lower.contains('ca-app-pub-replace-me')) {
    return '';
  }
  return trimmed;
}
