import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pricer_mobile/core/models/app_models.dart';
import 'package:pricer_mobile/core/services/ad_service.dart';
import 'package:pricer_mobile/core/services/billing_repositories.dart';
import 'package:pricer_mobile/core/services/monetization_config.dart';
import 'package:pricer_mobile/core/services/monetization_service.dart';

void main() {
  test('placeholders do not configure RevenueCat or AdMob', () {
    const config = MonetizationConfig(
      revenueCatAndroidApiKey: 'replace_me',
      revenueCatIosApiKey: 'replace_me',
      revenueCatEntitlementId: 'premium',
      admobAndroidAppId: 'ca-app-pub-replace-me~android',
      admobIosAppId: 'ca-app-pub-replace-me~ios',
      bannerAdUnitIdAndroid: 'ca-app-pub-replace-me/banner',
      bannerAdUnitIdIos: 'replace_me',
      interstitialAdUnitIdAndroid: '',
      interstitialAdUnitIdIos: '',
    );

    expect(config.revenueCatConfigured, isFalse);
    expect(config.admobConfigured, isFalse);
    expect(config.hasBannerAdUnit, isFalse);
    expect(config.hasInterstitialAdUnit, isFalse);
  });

  test('real current-platform keys keep monetization enabled', () {
    const config = MonetizationConfig(
      revenueCatAndroidApiKey: 'goog_android_real_key',
      revenueCatIosApiKey: 'appl_ios_real_key',
      revenueCatEntitlementId: 'premium',
      admobAndroidAppId: 'ca-app-pub-1234567890123456~1234567890',
      admobIosAppId: 'ca-app-pub-1234567890123456~0987654321',
      bannerAdUnitIdAndroid: 'ca-app-pub-1234567890123456/1111111111',
      bannerAdUnitIdIos: 'ca-app-pub-1234567890123456/2222222222',
      interstitialAdUnitIdAndroid: '',
      interstitialAdUnitIdIos: '',
    );

    expect(config.revenueCatConfigured, isTrue);
    expect(config.admobConfigured, isTrue);
    expect(config.hasBannerAdUnit, isTrue);
  });

  testWidgets('placeholder ad units render no ad widget', (tester) async {
    final service = GoogleMobileAdsService(
      config: const MonetizationConfig(
        revenueCatAndroidApiKey: '',
        revenueCatIosApiKey: '',
        revenueCatEntitlementId: 'premium',
        admobAndroidAppId: 'ca-app-pub-replace-me~android',
        admobIosAppId: 'ca-app-pub-replace-me~ios',
        bannerAdUnitIdAndroid: 'ca-app-pub-replace-me/banner',
        bannerAdUnitIdIos: 'ca-app-pub-replace-me/banner',
        interstitialAdUnitIdAndroid: '',
        interstitialAdUnitIdIos: '',
      ),
    );

    await service.initialize();
    await tester.pumpWidget(
      Directionality(
        textDirection: TextDirection.ltr,
        child: service.bannerSlot(enabled: true),
      ),
    );

    expect(find.byType(SizedBox), findsOneWidget);
  });

  test('app monetization initializes as free when RevenueCat is missing',
      () async {
    final repository = InMemoryMonetizationProfileRepository(
      anonymousUserId: 'anon-missing-monetization',
    );
    final service = MonetizationService(
      userId: 'anon-missing-monetization',
      repository: repository,
      subscriptionService: DisabledSubscriptionService(),
    );

    final profile = await service.initialize();

    expect(profile, isA<MonetizationProfile>());
    expect(profile.premiumActive, isFalse);
    expect(profile.adsEnabled, isTrue);
  });
}
