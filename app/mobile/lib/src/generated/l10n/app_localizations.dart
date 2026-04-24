import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_bg.dart';
import 'app_localizations_en.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
      : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('bg'),
    Locale('en')
  ];

  /// No description provided for @appTitle.
  ///
  /// In en, this message translates to:
  /// **'Pricer'**
  String get appTitle;

  /// No description provided for @navSearch.
  ///
  /// In en, this message translates to:
  /// **'Search'**
  String get navSearch;

  /// No description provided for @navLists.
  ///
  /// In en, this message translates to:
  /// **'Lists'**
  String get navLists;

  /// No description provided for @navWatchlist.
  ///
  /// In en, this message translates to:
  /// **'Watchlist'**
  String get navWatchlist;

  /// No description provided for @homeTagline.
  ///
  /// In en, this message translates to:
  /// **'Find the cheapest basket fast, then rerun it tomorrow just as easily.'**
  String get homeTagline;

  /// No description provided for @homeSearchCardTitle.
  ///
  /// In en, this message translates to:
  /// **'What do you want to buy?'**
  String get homeSearchCardTitle;

  /// No description provided for @homeSearchCardSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Search in Bulgarian and compare today\'s cheapest result.'**
  String get homeSearchCardSubtitle;

  /// No description provided for @searchFieldLabel.
  ///
  /// In en, this message translates to:
  /// **'Bulgarian grocery query'**
  String get searchFieldLabel;

  /// No description provided for @searchFieldHint.
  ///
  /// In en, this message translates to:
  /// **'прясно мляко 1л'**
  String get searchFieldHint;

  /// No description provided for @searchButton.
  ///
  /// In en, this message translates to:
  /// **'Find best price'**
  String get searchButton;

  /// No description provided for @recentSearchesTitle.
  ///
  /// In en, this message translates to:
  /// **'Recent searches'**
  String get recentSearchesTitle;

  /// No description provided for @recentSearchesSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Rerun your usual staples in one tap.'**
  String get recentSearchesSubtitle;

  /// No description provided for @recentSearchesEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No recent searches yet'**
  String get recentSearchesEmptyTitle;

  /// No description provided for @recentSearchesEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'Run one quick search and it will appear here for tomorrow.'**
  String get recentSearchesEmptyMessage;

  /// No description provided for @recentSearchesSampleAction.
  ///
  /// In en, this message translates to:
  /// **'Try a sample'**
  String get recentSearchesSampleAction;

  /// No description provided for @recentListsTitle.
  ///
  /// In en, this message translates to:
  /// **'Recent lists'**
  String get recentListsTitle;

  /// No description provided for @recentListsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Jump back into saved baskets and rerun them fast.'**
  String get recentListsSubtitle;

  /// No description provided for @recentListsEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No saved lists yet'**
  String get recentListsEmptyTitle;

  /// No description provided for @recentListsEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'Save a result as a list to make repeat shopping almost instant.'**
  String get recentListsEmptyMessage;

  /// No description provided for @rerunButton.
  ///
  /// In en, this message translates to:
  /// **'Rerun'**
  String get rerunButton;

  /// No description provided for @quickInsightLabel.
  ///
  /// In en, this message translates to:
  /// **'Daily insight'**
  String get quickInsightLabel;

  /// No description provided for @todayLabel.
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get todayLabel;

  /// No description provided for @watchlistDropsReady.
  ///
  /// In en, this message translates to:
  /// **'{count} watchlist drops are ready to recheck.'**
  String watchlistDropsReady(int count);

  /// No description provided for @rerunListInsight.
  ///
  /// In en, this message translates to:
  /// **'Rerun {listName} to refresh today\'s total.'**
  String rerunListInsight(String listName);

  /// No description provided for @rerunSearchInsight.
  ///
  /// In en, this message translates to:
  /// **'Today\'s fastest win: rerun \"{query}\".'**
  String rerunSearchInsight(String query);

  /// No description provided for @searchStapleInsight.
  ///
  /// In en, this message translates to:
  /// **'Search one staple and see the cheapest store in seconds.'**
  String get searchStapleInsight;

  /// No description provided for @watchlistDropsCaption.
  ///
  /// In en, this message translates to:
  /// **'Open your watchlist to see which tracked prices are now at or below target.'**
  String get watchlistDropsCaption;

  /// No description provided for @watchlistReadyCaption.
  ///
  /// In en, this message translates to:
  /// **'{count} tracked products are ready for a quick daily price check.'**
  String watchlistReadyCaption(int count);

  /// No description provided for @recentRerunCaption.
  ///
  /// In en, this message translates to:
  /// **'Recent searches and lists are kept close so you can rerun them with one thumb.'**
  String get recentRerunCaption;

  /// No description provided for @loadResultsError.
  ///
  /// In en, this message translates to:
  /// **'We could not load results right now. Please try again.'**
  String get loadResultsError;

  /// No description provided for @firestoreNotConfiguredStatus.
  ///
  /// In en, this message translates to:
  /// **'Firebase is not configured yet. Lists and watchlists are running in memory.'**
  String get firestoreNotConfiguredStatus;

  /// No description provided for @firestoreConnectedStatus.
  ///
  /// In en, this message translates to:
  /// **'Firestore is connected for anonymous lists and watchlists.'**
  String get firestoreConnectedStatus;

  /// No description provided for @firestoreBootstrapFailedStatus.
  ///
  /// In en, this message translates to:
  /// **'Firebase bootstrap failed. Lists and watchlists are running in memory.'**
  String get firestoreBootstrapFailedStatus;

  /// No description provided for @resultsNoMatchesTitle.
  ///
  /// In en, this message translates to:
  /// **'No matches yet'**
  String get resultsNoMatchesTitle;

  /// No description provided for @resultsNoMatchesMessage.
  ///
  /// In en, this message translates to:
  /// **'Try a more specific product, brand, or size to surface the cheapest result.'**
  String get resultsNoMatchesMessage;

  /// No description provided for @tryAgainButton.
  ///
  /// In en, this message translates to:
  /// **'Try again'**
  String get tryAgainButton;

  /// No description provided for @resultsSummaryTitle.
  ///
  /// In en, this message translates to:
  /// **'Cheapest basket today'**
  String get resultsSummaryTitle;

  /// No description provided for @resultsSummarySubtitle.
  ///
  /// In en, this message translates to:
  /// **'Savings stay front and center on every result.'**
  String get resultsSummarySubtitle;

  /// No description provided for @noStoreMatchYet.
  ///
  /// In en, this message translates to:
  /// **'No store match yet'**
  String get noStoreMatchYet;

  /// No description provided for @youSaveLabel.
  ///
  /// In en, this message translates to:
  /// **'You save'**
  String get youSaveLabel;

  /// No description provided for @badgeLabel.
  ///
  /// In en, this message translates to:
  /// **'Badge'**
  String get badgeLabel;

  /// No description provided for @cheapestTodayBadge.
  ///
  /// In en, this message translates to:
  /// **'Cheapest today'**
  String get cheapestTodayBadge;

  /// No description provided for @savingsVsAverage.
  ///
  /// In en, this message translates to:
  /// **'You save {amount} versus recent averages'**
  String savingsVsAverage(String amount);

  /// No description provided for @cheapestTodayForQuery.
  ///
  /// In en, this message translates to:
  /// **'Cheapest today for your current query'**
  String get cheapestTodayForQuery;

  /// No description provided for @saveResultTitle.
  ///
  /// In en, this message translates to:
  /// **'Save this result'**
  String get saveResultTitle;

  /// No description provided for @saveResultSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Keep this basket handy and rerun it later in one tap.'**
  String get saveResultSubtitle;

  /// No description provided for @saveAsListButton.
  ///
  /// In en, this message translates to:
  /// **'Save as list'**
  String get saveAsListButton;

  /// No description provided for @saveToShoppingListTitle.
  ///
  /// In en, this message translates to:
  /// **'Save to shopping list'**
  String get saveToShoppingListTitle;

  /// No description provided for @listNameLabel.
  ///
  /// In en, this message translates to:
  /// **'List name'**
  String get listNameLabel;

  /// No description provided for @cancelButton.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get cancelButton;

  /// No description provided for @saveButton.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get saveButton;

  /// No description provided for @savedToListSnackBar.
  ///
  /// In en, this message translates to:
  /// **'{name} saved to {listName}'**
  String savedToListSnackBar(String name, String listName);

  /// No description provided for @defaultSavedResultListName.
  ///
  /// In en, this message translates to:
  /// **'Saved result'**
  String get defaultSavedResultListName;

  /// No description provided for @resultSavedSnackBar.
  ///
  /// In en, this message translates to:
  /// **'Result saved to {listName}'**
  String resultSavedSnackBar(String listName);

  /// No description provided for @addedToWatchlistSnackBar.
  ///
  /// In en, this message translates to:
  /// **'{name} added to watchlist'**
  String addedToWatchlistSnackBar(String name);

  /// No description provided for @shareCopiedSnackBar.
  ///
  /// In en, this message translates to:
  /// **'Share text copied to clipboard'**
  String get shareCopiedSnackBar;

  /// No description provided for @shareNoMatchText.
  ///
  /// In en, this message translates to:
  /// **'Pricer: no match yet for \"{query}\".'**
  String shareNoMatchText(String query);

  /// No description provided for @shareResultText.
  ///
  /// In en, this message translates to:
  /// **'Pricer: I save {amount} on \"{query}\" and the cheapest store today is {store}.'**
  String shareResultText(String amount, String query, String store);

  /// No description provided for @watchButton.
  ///
  /// In en, this message translates to:
  /// **'Watch'**
  String get watchButton;

  /// No description provided for @addToListButton.
  ///
  /// In en, this message translates to:
  /// **'Add to list'**
  String get addToListButton;

  /// No description provided for @detailsButton.
  ///
  /// In en, this message translates to:
  /// **'Details'**
  String get detailsButton;

  /// No description provided for @storeLabel.
  ///
  /// In en, this message translates to:
  /// **'Store'**
  String get storeLabel;

  /// No description provided for @matchLabel.
  ///
  /// In en, this message translates to:
  /// **'Match'**
  String get matchLabel;

  /// No description provided for @saveLabel.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get saveLabel;

  /// No description provided for @vsAverageShort.
  ///
  /// In en, this message translates to:
  /// **'vs avg {amount}'**
  String vsAverageShort(String amount);

  /// No description provided for @productHistoryLoadError.
  ///
  /// In en, this message translates to:
  /// **'We could not load product history right now.'**
  String get productHistoryLoadError;

  /// No description provided for @bestStoreToday.
  ///
  /// In en, this message translates to:
  /// **'Best store today: {store}'**
  String bestStoreToday(String store);

  /// No description provided for @priceHistoryTitle.
  ///
  /// In en, this message translates to:
  /// **'Price history'**
  String get priceHistoryTitle;

  /// No description provided for @priceHistorySubtitle.
  ///
  /// In en, this message translates to:
  /// **'Current vs recent trend'**
  String get priceHistorySubtitle;

  /// No description provided for @noHistoryYet.
  ///
  /// In en, this message translates to:
  /// **'No history yet'**
  String get noHistoryYet;

  /// No description provided for @recentPricePointsTitle.
  ///
  /// In en, this message translates to:
  /// **'Recent price points'**
  String get recentPricePointsTitle;

  /// No description provided for @recentPricePointsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Use these to judge whether today is a good moment to buy.'**
  String get recentPricePointsSubtitle;

  /// No description provided for @noRecordedHistoryTitle.
  ///
  /// In en, this message translates to:
  /// **'No recorded history'**
  String get noRecordedHistoryTitle;

  /// No description provided for @noRecordedHistoryMessage.
  ///
  /// In en, this message translates to:
  /// **'This product needs more daily snapshots before trend lines become useful.'**
  String get noRecordedHistoryMessage;

  /// No description provided for @priceRangeLabel.
  ///
  /// In en, this message translates to:
  /// **'Min {minPrice}  Max {maxPrice}'**
  String priceRangeLabel(String minPrice, String maxPrice);

  /// No description provided for @trackPriceDropsTitle.
  ///
  /// In en, this message translates to:
  /// **'Track price drops'**
  String get trackPriceDropsTitle;

  /// No description provided for @trackPriceDropsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Watch this item now and revisit when the price moves.'**
  String get trackPriceDropsSubtitle;

  /// No description provided for @watchItemButton.
  ///
  /// In en, this message translates to:
  /// **'Watch item'**
  String get watchItemButton;

  /// No description provided for @quickListName.
  ///
  /// In en, this message translates to:
  /// **'Quick list'**
  String get quickListName;

  /// No description provided for @shoppingListsTitle.
  ///
  /// In en, this message translates to:
  /// **'Shopping lists'**
  String get shoppingListsTitle;

  /// No description provided for @createShoppingListTitle.
  ///
  /// In en, this message translates to:
  /// **'Create shopping list'**
  String get createShoppingListTitle;

  /// No description provided for @createButton.
  ///
  /// In en, this message translates to:
  /// **'Create'**
  String get createButton;

  /// No description provided for @shoppingListsLoadError.
  ///
  /// In en, this message translates to:
  /// **'We could not load your saved shopping lists.'**
  String get shoppingListsLoadError;

  /// No description provided for @savedBasketsTitle.
  ///
  /// In en, this message translates to:
  /// **'Saved baskets'**
  String get savedBasketsTitle;

  /// No description provided for @savedBasketsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Keep repeat shopping central and easy to rerun.'**
  String get savedBasketsSubtitle;

  /// No description provided for @newListButton.
  ///
  /// In en, this message translates to:
  /// **'New list'**
  String get newListButton;

  /// No description provided for @noShoppingListsTitle.
  ///
  /// In en, this message translates to:
  /// **'No shopping lists yet'**
  String get noShoppingListsTitle;

  /// No description provided for @noShoppingListsMessage.
  ///
  /// In en, this message translates to:
  /// **'Save a result or create a list here to make repeat buying much faster.'**
  String get noShoppingListsMessage;

  /// No description provided for @updatedItemsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Updated {date} • {count} items'**
  String updatedItemsSubtitle(String date, int count);

  /// No description provided for @openButton.
  ///
  /// In en, this message translates to:
  /// **'Open'**
  String get openButton;

  /// No description provided for @addItemTitle.
  ///
  /// In en, this message translates to:
  /// **'Add item'**
  String get addItemTitle;

  /// No description provided for @bulgarianQueryLabel.
  ///
  /// In en, this message translates to:
  /// **'Bulgarian query'**
  String get bulgarianQueryLabel;

  /// No description provided for @addButton.
  ///
  /// In en, this message translates to:
  /// **'Add'**
  String get addButton;

  /// No description provided for @shoppingListLoadError.
  ///
  /// In en, this message translates to:
  /// **'We could not load this list.'**
  String get shoppingListLoadError;

  /// No description provided for @itemsReadyToCompare.
  ///
  /// In en, this message translates to:
  /// **'{count} items ready to compare'**
  String itemsReadyToCompare(int count);

  /// No description provided for @noStoreWinnerYet.
  ///
  /// In en, this message translates to:
  /// **'No store winner yet'**
  String get noStoreWinnerYet;

  /// No description provided for @bestOneThumbRerun.
  ///
  /// In en, this message translates to:
  /// **'Best one-thumb rerun for today'**
  String get bestOneThumbRerun;

  /// No description provided for @updatedPricesLabel.
  ///
  /// In en, this message translates to:
  /// **'Updated prices'**
  String get updatedPricesLabel;

  /// No description provided for @availableNowLabel.
  ///
  /// In en, this message translates to:
  /// **'Available now'**
  String get availableNowLabel;

  /// No description provided for @runComparisonHint.
  ///
  /// In en, this message translates to:
  /// **'Run comparison to see the cheapest total and quickest repeat option.'**
  String get runComparisonHint;

  /// No description provided for @addGroceriesFirstTitle.
  ///
  /// In en, this message translates to:
  /// **'Add some groceries first'**
  String get addGroceriesFirstTitle;

  /// No description provided for @addGroceriesFirstMessage.
  ///
  /// In en, this message translates to:
  /// **'Once this list has a few items, you can compare the cheapest current total in one tap.'**
  String get addGroceriesFirstMessage;

  /// No description provided for @qtyLabel.
  ///
  /// In en, this message translates to:
  /// **'Qty {count}'**
  String qtyLabel(int count);

  /// No description provided for @refreshPricesTitle.
  ///
  /// In en, this message translates to:
  /// **'Refresh today\'s prices'**
  String get refreshPricesTitle;

  /// No description provided for @bestCurrentTotalTitle.
  ///
  /// In en, this message translates to:
  /// **'Best current total'**
  String get bestCurrentTotalTitle;

  /// No description provided for @compareListSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Compare this list to surface the cheapest current basket.'**
  String get compareListSubtitle;

  /// No description provided for @cheapestStoreTotalSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Cheapest store {store} • Total {total}'**
  String cheapestStoreTotalSubtitle(String store, String total);

  /// No description provided for @runComparisonButton.
  ///
  /// In en, this message translates to:
  /// **'Run comparison'**
  String get runComparisonButton;

  /// No description provided for @watchlistTitle.
  ///
  /// In en, this message translates to:
  /// **'Watchlist'**
  String get watchlistTitle;

  /// No description provided for @watchlistLoadError.
  ///
  /// In en, this message translates to:
  /// **'We could not load your watchlist.'**
  String get watchlistLoadError;

  /// No description provided for @dropsSummaryTitle.
  ///
  /// In en, this message translates to:
  /// **'Drops summary'**
  String get dropsSummaryTitle;

  /// No description provided for @dropsSummarySubtitle.
  ///
  /// In en, this message translates to:
  /// **'This banner keeps watchlist urgency visible.'**
  String get dropsSummarySubtitle;

  /// No description provided for @noTrackedItemsYet.
  ///
  /// In en, this message translates to:
  /// **'No tracked items yet'**
  String get noTrackedItemsYet;

  /// No description provided for @watchlistDropsStatus.
  ///
  /// In en, this message translates to:
  /// **'{drops} of {count} tracked items are at or below target.'**
  String watchlistDropsStatus(int drops, int count);

  /// No description provided for @watchlistEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'Tracked products will appear here'**
  String get watchlistEmptyTitle;

  /// No description provided for @watchlistEmptyMessage.
  ///
  /// In en, this message translates to:
  /// **'Add a product from search results to build a habit-forming watchlist.'**
  String get watchlistEmptyMessage;

  /// No description provided for @currentPriceLabel.
  ///
  /// In en, this message translates to:
  /// **'Current {price}'**
  String currentPriceLabel(String price);

  /// No description provided for @somethingWentWrongTitle.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong'**
  String get somethingWentWrongTitle;

  /// No description provided for @retryButton.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get retryButton;

  /// No description provided for @belowRecentAverage.
  ///
  /// In en, this message translates to:
  /// **'Below recent average'**
  String get belowRecentAverage;

  /// No description provided for @higherThanRecentAverage.
  ///
  /// In en, this message translates to:
  /// **'Higher than recent average'**
  String get higherThanRecentAverage;

  /// No description provided for @aroundUsualPrice.
  ///
  /// In en, this message translates to:
  /// **'Around usual price'**
  String get aroundUsualPrice;

  /// No description provided for @notAvailableShort.
  ///
  /// In en, this message translates to:
  /// **'-'**
  String get notAvailableShort;

  /// No description provided for @premiumHomeTitle.
  ///
  /// In en, this message translates to:
  /// **'Premium unlocks smarter savings'**
  String get premiumHomeTitle;

  /// No description provided for @premiumHomeSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Turn on multi-store basket optimization, target-price alerts, and an ad-free app shell.'**
  String get premiumHomeSubtitle;

  /// No description provided for @premiumActiveHomeTitle.
  ///
  /// In en, this message translates to:
  /// **'Premium is active'**
  String get premiumActiveHomeTitle;

  /// No description provided for @premiumActiveHomeSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Multi-store optimization and alerts are ready for this device.'**
  String get premiumActiveHomeSubtitle;

  /// No description provided for @viewPremiumButton.
  ///
  /// In en, this message translates to:
  /// **'View premium'**
  String get viewPremiumButton;

  /// No description provided for @managePlanButton.
  ///
  /// In en, this message translates to:
  /// **'Manage plan'**
  String get managePlanButton;

  /// No description provided for @paywallTitle.
  ///
  /// In en, this message translates to:
  /// **'Premium'**
  String get paywallTitle;

  /// No description provided for @paywallHeroTitle.
  ///
  /// In en, this message translates to:
  /// **'Save more with premium'**
  String get paywallHeroTitle;

  /// No description provided for @paywallHeroSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Unlock multi-store basket optimization, watchlist alerts, and an ad-free experience.'**
  String get paywallHeroSubtitle;

  /// No description provided for @paywallPremiumActive.
  ///
  /// In en, this message translates to:
  /// **'Your premium entitlement is active on this device.'**
  String get paywallPremiumActive;

  /// No description provided for @paywallFeatureLabel.
  ///
  /// In en, this message translates to:
  /// **'Includes'**
  String get paywallFeatureLabel;

  /// No description provided for @paywallFeatureOptimizer.
  ///
  /// In en, this message translates to:
  /// **'Multi-store basket optimizer'**
  String get paywallFeatureOptimizer;

  /// No description provided for @paywallFeatureAlerts.
  ///
  /// In en, this message translates to:
  /// **'Target-price watchlist alerts'**
  String get paywallFeatureAlerts;

  /// No description provided for @paywallFeatureNoAds.
  ///
  /// In en, this message translates to:
  /// **'Ad-free experience'**
  String get paywallFeatureNoAds;

  /// No description provided for @subscriptionStatusTitle.
  ///
  /// In en, this message translates to:
  /// **'Subscription status'**
  String get subscriptionStatusTitle;

  /// No description provided for @subscriptionPremiumStatus.
  ///
  /// In en, this message translates to:
  /// **'Premium is active'**
  String get subscriptionPremiumStatus;

  /// No description provided for @subscriptionFreeStatus.
  ///
  /// In en, this message translates to:
  /// **'Free tier'**
  String get subscriptionFreeStatus;

  /// No description provided for @watchlistLimitValue.
  ///
  /// In en, this message translates to:
  /// **'Watchlist limit: {count}'**
  String watchlistLimitValue(int count);

  /// No description provided for @optimizerLimitValue.
  ///
  /// In en, this message translates to:
  /// **'Optimizer item limit: {count}'**
  String optimizerLimitValue(int count);

  /// No description provided for @billingNotConfiguredTitle.
  ///
  /// In en, this message translates to:
  /// **'Billing is not configured yet'**
  String get billingNotConfiguredTitle;

  /// No description provided for @billingNotConfiguredMessage.
  ///
  /// In en, this message translates to:
  /// **'RevenueCat keys are still missing for this build, so the paywall is running in preview mode.'**
  String get billingNotConfiguredMessage;

  /// No description provided for @noSubscriptionPackagesTitle.
  ///
  /// In en, this message translates to:
  /// **'No subscription packages available'**
  String get noSubscriptionPackagesTitle;

  /// No description provided for @noSubscriptionPackagesMessage.
  ///
  /// In en, this message translates to:
  /// **'RevenueCat is connected, but there are no offerings published for this app yet.'**
  String get noSubscriptionPackagesMessage;

  /// No description provided for @purchaseButton.
  ///
  /// In en, this message translates to:
  /// **'Purchase'**
  String get purchaseButton;

  /// No description provided for @restoreButton.
  ///
  /// In en, this message translates to:
  /// **'Restore'**
  String get restoreButton;

  /// No description provided for @restorePurchasesTitle.
  ///
  /// In en, this message translates to:
  /// **'Already subscribed?'**
  String get restorePurchasesTitle;

  /// No description provided for @restorePurchasesSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Restore purchases on this device if you upgraded elsewhere.'**
  String get restorePurchasesSubtitle;

  /// No description provided for @premiumPurchaseSuccess.
  ///
  /// In en, this message translates to:
  /// **'Premium purchase completed.'**
  String get premiumPurchaseSuccess;

  /// No description provided for @premiumStillPendingMessage.
  ///
  /// In en, this message translates to:
  /// **'The purchase finished, but premium is not active yet. Try refreshing in a moment.'**
  String get premiumStillPendingMessage;

  /// No description provided for @premiumPurchaseFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not complete the purchase.'**
  String get premiumPurchaseFailed;

  /// No description provided for @restorePurchasesSuccess.
  ///
  /// In en, this message translates to:
  /// **'Premium restored on this device.'**
  String get restorePurchasesSuccess;

  /// No description provided for @restorePurchasesNoActive.
  ///
  /// In en, this message translates to:
  /// **'No active premium subscription was found to restore.'**
  String get restorePurchasesNoActive;

  /// No description provided for @restorePurchasesFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not restore purchases right now.'**
  String get restorePurchasesFailed;

  /// No description provided for @multiStorePremiumTitle.
  ///
  /// In en, this message translates to:
  /// **'Compare across stores'**
  String get multiStorePremiumTitle;

  /// No description provided for @multiStorePremiumMessage.
  ///
  /// In en, this message translates to:
  /// **'Premium unlocks the multi-store basket optimizer on top of today’s matches.'**
  String get multiStorePremiumMessage;

  /// No description provided for @unlockPremiumButton.
  ///
  /// In en, this message translates to:
  /// **'Unlock premium'**
  String get unlockPremiumButton;

  /// No description provided for @watchlistPremiumTitle.
  ///
  /// In en, this message translates to:
  /// **'Premium alerts are off'**
  String get watchlistPremiumTitle;

  /// No description provided for @watchlistPremiumMessage.
  ///
  /// In en, this message translates to:
  /// **'Upgrade to turn target-price alerts and smarter watchlist nudges back on.'**
  String get watchlistPremiumMessage;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['bg', 'en'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'bg':
      return AppLocalizationsBg();
    case 'en':
      return AppLocalizationsEn();
  }

  throw FlutterError(
      'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
      'an issue with the localizations generation tool. Please file an issue '
      'on GitHub with a reproducible sample app and the gen-l10n configuration '
      'that was used.');
}
