// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'Pricer';

  @override
  String get navSearch => 'Search';

  @override
  String get navLists => 'Lists';

  @override
  String get navWatchlist => 'Watchlist';

  @override
  String get homeTagline =>
      'Find the cheapest basket fast, then rerun it tomorrow just as easily.';

  @override
  String get homeSearchCardTitle => 'What do you want to buy?';

  @override
  String get homeSearchCardSubtitle =>
      'Search in Bulgarian and compare today\'s cheapest result.';

  @override
  String get searchFieldLabel => 'Bulgarian grocery query';

  @override
  String get searchFieldHint => 'прясно мляко 1л';

  @override
  String get searchButton => 'Find best price';

  @override
  String get recentSearchesTitle => 'Recent searches';

  @override
  String get recentSearchesSubtitle => 'Rerun your usual staples in one tap.';

  @override
  String get recentSearchesEmptyTitle => 'No recent searches yet';

  @override
  String get recentSearchesEmptyMessage =>
      'Run one quick search and it will appear here for tomorrow.';

  @override
  String get recentSearchesSampleAction => 'Try a sample';

  @override
  String get recentListsTitle => 'Recent lists';

  @override
  String get recentListsSubtitle =>
      'Jump back into saved baskets and rerun them fast.';

  @override
  String get recentListsEmptyTitle => 'No saved lists yet';

  @override
  String get recentListsEmptyMessage =>
      'Save a result as a list to make repeat shopping almost instant.';

  @override
  String get rerunButton => 'Rerun';

  @override
  String get quickInsightLabel => 'Daily insight';

  @override
  String get todayLabel => 'Today';

  @override
  String watchlistDropsReady(int count) {
    return '$count watchlist drops are ready to recheck.';
  }

  @override
  String rerunListInsight(String listName) {
    return 'Rerun $listName to refresh today\'s total.';
  }

  @override
  String rerunSearchInsight(String query) {
    return 'Today\'s fastest win: rerun \"$query\".';
  }

  @override
  String get searchStapleInsight =>
      'Search one staple and see the cheapest store in seconds.';

  @override
  String get watchlistDropsCaption =>
      'Open your watchlist to see which tracked prices are now at or below target.';

  @override
  String watchlistReadyCaption(int count) {
    return '$count tracked products are ready for a quick daily price check.';
  }

  @override
  String get recentRerunCaption =>
      'Recent searches and lists are kept close so you can rerun them with one thumb.';

  @override
  String get loadResultsError =>
      'We could not load results right now. Please try again.';

  @override
  String get firestoreNotConfiguredStatus =>
      'Firebase is not configured yet. Lists and watchlists are running in memory.';

  @override
  String get firestoreConnectedStatus =>
      'Firestore is connected for anonymous lists and watchlists.';

  @override
  String get firestoreBootstrapFailedStatus =>
      'Firebase bootstrap failed. Lists and watchlists are running in memory.';

  @override
  String get resultsNoMatchesTitle => 'No matches yet';

  @override
  String get resultsNoMatchesMessage =>
      'Try a more specific product, brand, or size to surface the cheapest result.';

  @override
  String get tryAgainButton => 'Try again';

  @override
  String get resultsSummaryTitle => 'Cheapest basket today';

  @override
  String get resultsSummarySubtitle =>
      'Savings stay front and center on every result.';

  @override
  String get noStoreMatchYet => 'No store match yet';

  @override
  String get youSaveLabel => 'You save';

  @override
  String get badgeLabel => 'Badge';

  @override
  String get cheapestTodayBadge => 'Cheapest today';

  @override
  String savingsVsAverage(String amount) {
    return 'You save $amount versus recent averages';
  }

  @override
  String get cheapestTodayForQuery => 'Cheapest today for your current query';

  @override
  String get saveResultTitle => 'Save this result';

  @override
  String get saveResultSubtitle =>
      'Keep this basket handy and rerun it later in one tap.';

  @override
  String get saveAsListButton => 'Save as list';

  @override
  String get saveToShoppingListTitle => 'Save to shopping list';

  @override
  String get listNameLabel => 'List name';

  @override
  String get cancelButton => 'Cancel';

  @override
  String get saveButton => 'Save';

  @override
  String savedToListSnackBar(String name, String listName) {
    return '$name saved to $listName';
  }

  @override
  String get defaultSavedResultListName => 'Saved result';

  @override
  String resultSavedSnackBar(String listName) {
    return 'Result saved to $listName';
  }

  @override
  String addedToWatchlistSnackBar(String name) {
    return '$name added to watchlist';
  }

  @override
  String get shareCopiedSnackBar => 'Share text copied to clipboard';

  @override
  String shareNoMatchText(String query) {
    return 'Pricer: no match yet for \"$query\".';
  }

  @override
  String shareResultText(String amount, String query, String store) {
    return 'Pricer: I save $amount on \"$query\" and the cheapest store today is $store.';
  }

  @override
  String get watchButton => 'Watch';

  @override
  String get addToListButton => 'Add to list';

  @override
  String get detailsButton => 'Details';

  @override
  String get storeLabel => 'Store';

  @override
  String get matchLabel => 'Match';

  @override
  String get saveLabel => 'Save';

  @override
  String vsAverageShort(String amount) {
    return 'vs avg $amount';
  }

  @override
  String get productHistoryLoadError =>
      'We could not load product history right now.';

  @override
  String bestStoreToday(String store) {
    return 'Best store today: $store';
  }

  @override
  String get priceHistoryTitle => 'Price history';

  @override
  String get priceHistorySubtitle => 'Current vs recent trend';

  @override
  String get noHistoryYet => 'No history yet';

  @override
  String get recentPricePointsTitle => 'Recent price points';

  @override
  String get recentPricePointsSubtitle =>
      'Use these to judge whether today is a good moment to buy.';

  @override
  String get noRecordedHistoryTitle => 'No recorded history';

  @override
  String get noRecordedHistoryMessage =>
      'This product needs more daily snapshots before trend lines become useful.';

  @override
  String priceRangeLabel(String minPrice, String maxPrice) {
    return 'Min $minPrice  Max $maxPrice';
  }

  @override
  String get trackPriceDropsTitle => 'Track price drops';

  @override
  String get trackPriceDropsSubtitle =>
      'Watch this item now and revisit when the price moves.';

  @override
  String get watchItemButton => 'Watch item';

  @override
  String get quickListName => 'Quick list';

  @override
  String get shoppingListsTitle => 'Shopping lists';

  @override
  String get createShoppingListTitle => 'Create shopping list';

  @override
  String get createButton => 'Create';

  @override
  String get shoppingListsLoadError =>
      'We could not load your saved shopping lists.';

  @override
  String get savedBasketsTitle => 'Saved baskets';

  @override
  String get savedBasketsSubtitle =>
      'Keep repeat shopping central and easy to rerun.';

  @override
  String get newListButton => 'New list';

  @override
  String get noShoppingListsTitle => 'No shopping lists yet';

  @override
  String get noShoppingListsMessage =>
      'Save a result or create a list here to make repeat buying much faster.';

  @override
  String updatedItemsSubtitle(String date, int count) {
    return 'Updated $date • $count items';
  }

  @override
  String get openButton => 'Open';

  @override
  String get addItemTitle => 'Add item';

  @override
  String get bulgarianQueryLabel => 'Bulgarian query';

  @override
  String get addButton => 'Add';

  @override
  String get shoppingListLoadError => 'We could not load this list.';

  @override
  String itemsReadyToCompare(int count) {
    return '$count items ready to compare';
  }

  @override
  String get noStoreWinnerYet => 'No store winner yet';

  @override
  String get bestOneThumbRerun => 'Best one-thumb rerun for today';

  @override
  String get updatedPricesLabel => 'Updated prices';

  @override
  String get availableNowLabel => 'Available now';

  @override
  String get runComparisonHint =>
      'Run comparison to see the cheapest total and quickest repeat option.';

  @override
  String get addGroceriesFirstTitle => 'Add some groceries first';

  @override
  String get addGroceriesFirstMessage =>
      'Once this list has a few items, you can compare the cheapest current total in one tap.';

  @override
  String qtyLabel(int count) {
    return 'Qty $count';
  }

  @override
  String get refreshPricesTitle => 'Refresh today\'s prices';

  @override
  String get bestCurrentTotalTitle => 'Best current total';

  @override
  String get compareListSubtitle =>
      'Compare this list to surface the cheapest current basket.';

  @override
  String cheapestStoreTotalSubtitle(String store, String total) {
    return 'Cheapest store $store • Total $total';
  }

  @override
  String get runComparisonButton => 'Run comparison';

  @override
  String get watchlistTitle => 'Watchlist';

  @override
  String get watchlistLoadError => 'We could not load your watchlist.';

  @override
  String get dropsSummaryTitle => 'Drops summary';

  @override
  String get dropsSummarySubtitle =>
      'This banner keeps watchlist urgency visible.';

  @override
  String get noTrackedItemsYet => 'No tracked items yet';

  @override
  String watchlistDropsStatus(int drops, int count) {
    return '$drops of $count tracked items are at or below target.';
  }

  @override
  String get watchlistEmptyTitle => 'Tracked products will appear here';

  @override
  String get watchlistEmptyMessage =>
      'Add a product from search results to build a habit-forming watchlist.';

  @override
  String currentPriceLabel(String price) {
    return 'Current $price';
  }

  @override
  String get somethingWentWrongTitle => 'Something went wrong';

  @override
  String get retryButton => 'Retry';

  @override
  String get belowRecentAverage => 'Below recent average';

  @override
  String get higherThanRecentAverage => 'Higher than recent average';

  @override
  String get aroundUsualPrice => 'Around usual price';

  @override
  String get notAvailableShort => '-';

  @override
  String get premiumHomeTitle => 'Premium unlocks smarter savings';

  @override
  String get premiumHomeSubtitle =>
      'Turn on multi-store basket optimization, target-price alerts, and an ad-free app shell.';

  @override
  String get premiumActiveHomeTitle => 'Premium is active';

  @override
  String get premiumActiveHomeSubtitle =>
      'Multi-store optimization and alerts are ready for this device.';

  @override
  String get viewPremiumButton => 'View premium';

  @override
  String get managePlanButton => 'Manage plan';

  @override
  String get paywallTitle => 'Premium';

  @override
  String get paywallHeroTitle => 'Save more with premium';

  @override
  String get paywallHeroSubtitle =>
      'Unlock multi-store basket optimization, watchlist alerts, and an ad-free experience.';

  @override
  String get paywallPremiumActive =>
      'Your premium entitlement is active on this device.';

  @override
  String get paywallFeatureLabel => 'Includes';

  @override
  String get paywallFeatureOptimizer => 'Multi-store basket optimizer';

  @override
  String get paywallFeatureAlerts => 'Target-price watchlist alerts';

  @override
  String get paywallFeatureNoAds => 'Ad-free experience';

  @override
  String get subscriptionStatusTitle => 'Subscription status';

  @override
  String get subscriptionPremiumStatus => 'Premium is active';

  @override
  String get subscriptionFreeStatus => 'Free tier';

  @override
  String watchlistLimitValue(int count) {
    return 'Watchlist limit: $count';
  }

  @override
  String optimizerLimitValue(int count) {
    return 'Optimizer item limit: $count';
  }

  @override
  String get billingNotConfiguredTitle => 'Billing is not configured yet';

  @override
  String get billingNotConfiguredMessage =>
      'RevenueCat keys are still missing for this build, so the paywall is running in preview mode.';

  @override
  String get noSubscriptionPackagesTitle =>
      'No subscription packages available';

  @override
  String get noSubscriptionPackagesMessage =>
      'RevenueCat is connected, but there are no offerings published for this app yet.';

  @override
  String get purchaseButton => 'Purchase';

  @override
  String get restoreButton => 'Restore';

  @override
  String get restorePurchasesTitle => 'Already subscribed?';

  @override
  String get restorePurchasesSubtitle =>
      'Restore purchases on this device if you upgraded elsewhere.';

  @override
  String get premiumPurchaseSuccess => 'Premium purchase completed.';

  @override
  String get premiumStillPendingMessage =>
      'The purchase finished, but premium is not active yet. Try refreshing in a moment.';

  @override
  String get premiumPurchaseFailed => 'We could not complete the purchase.';

  @override
  String get restorePurchasesSuccess => 'Premium restored on this device.';

  @override
  String get restorePurchasesNoActive =>
      'No active premium subscription was found to restore.';

  @override
  String get restorePurchasesFailed =>
      'We could not restore purchases right now.';

  @override
  String get multiStorePremiumTitle => 'Compare across stores';

  @override
  String get multiStorePremiumMessage =>
      'Premium unlocks the multi-store basket optimizer on top of today’s matches.';

  @override
  String get unlockPremiumButton => 'Unlock premium';

  @override
  String get watchlistPremiumTitle => 'Premium alerts are off';

  @override
  String get watchlistPremiumMessage =>
      'Upgrade to turn target-price alerts and smarter watchlist nudges back on.';
}
