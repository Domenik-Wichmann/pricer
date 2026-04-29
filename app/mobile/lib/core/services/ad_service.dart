import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'monetization_config.dart';

abstract class AppAdService {
  bool get isConfigured;

  Future<void> initialize();

  Widget bannerSlot({
    Key? key,
    required bool enabled,
  });

  Future<void> maybeShowInterstitial({
    required bool enabled,
    String placement = 'default',
  });
}

class GoogleMobileAdsService implements AppAdService {
  GoogleMobileAdsService({
    required MonetizationConfig config,
  }) : _config = config;

  final MonetizationConfig _config;
  bool _initialized = false;
  InterstitialAd? _interstitialAd;

  @override
  bool get isConfigured => _config.admobConfigured;

  @override
  Future<void> initialize() async {
    if (_initialized || !isConfigured) {
      if (!isConfigured && kDebugMode) {
        debugPrint('AdMob disabled: no real app/ad unit IDs configured.');
      }
      return;
    }

    await MobileAds.instance.initialize();
    _initialized = true;
    await _preloadInterstitial();
  }

  @override
  Widget bannerSlot({
    Key? key,
    required bool enabled,
  }) {
    if (!enabled || !isConfigured || !_config.hasBannerAdUnit) {
      return const SizedBox.shrink();
    }

    return _BannerAdSlot(
      key: key,
      adUnitId: _config.currentBannerAdUnitId,
    );
  }

  @override
  Future<void> maybeShowInterstitial({
    required bool enabled,
    String placement = 'default',
  }) async {
    if (!enabled || !isConfigured || !_config.hasInterstitialAdUnit) {
      return;
    }

    final ad = _interstitialAd;
    if (ad == null) {
      await _preloadInterstitial();
      return;
    }

    _interstitialAd = null;
    ad.fullScreenContentCallback = FullScreenContentCallback(
      onAdDismissedFullScreenContent: (ad) {
        ad.dispose();
        _preloadInterstitial();
      },
      onAdFailedToShowFullScreenContent: (ad, error) {
        ad.dispose();
        _preloadInterstitial();
      },
    );
    ad.show();
  }

  Future<void> _preloadInterstitial() async {
    if (!isConfigured ||
        !_config.hasInterstitialAdUnit ||
        _interstitialAd != null) {
      return;
    }

    await InterstitialAd.load(
      adUnitId: _config.currentInterstitialAdUnitId,
      request: const AdRequest(),
      adLoadCallback: InterstitialAdLoadCallback(
        onAdLoaded: (ad) {
          _interstitialAd = ad;
        },
        onAdFailedToLoad: (_) {
          _interstitialAd = null;
        },
      ),
    );
  }
}

class DisabledAdService implements AppAdService {
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

class _BannerAdSlot extends StatefulWidget {
  const _BannerAdSlot({
    super.key,
    required this.adUnitId,
  });

  final String adUnitId;

  @override
  State<_BannerAdSlot> createState() => _BannerAdSlotState();
}

class _BannerAdSlotState extends State<_BannerAdSlot> {
  BannerAd? _bannerAd;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _bannerAd = BannerAd(
      size: AdSize.banner,
      adUnitId: widget.adUnitId,
      listener: BannerAdListener(
        onAdLoaded: (_) {
          if (mounted) {
            setState(() {
              _loaded = true;
            });
          }
        },
        onAdFailedToLoad: (ad, _) {
          ad.dispose();
        },
      ),
      request: const AdRequest(),
    )..load();
  }

  @override
  void dispose() {
    _bannerAd?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_loaded || _bannerAd == null) {
      return const SizedBox.shrink();
    }

    return SizedBox(
      width: _bannerAd!.size.width.toDouble(),
      height: _bannerAd!.size.height.toDouble(),
      child: AdWidget(ad: _bannerAd!),
    );
  }
}
