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

  bool get revenueCatConfigured =>
      revenueCatAndroidApiKey.isNotEmpty || revenueCatIosApiKey.isNotEmpty;

  bool get admobConfigured =>
      admobAndroidAppId.isNotEmpty || admobIosAppId.isNotEmpty;

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
        defaultValue: 'ca-app-pub-3940256099942544~3347511713',
      ),
      admobIosAppId: String.fromEnvironment(
        'ADMOB_IOS_APP_ID',
        defaultValue: 'ca-app-pub-3940256099942544~1458002511',
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
