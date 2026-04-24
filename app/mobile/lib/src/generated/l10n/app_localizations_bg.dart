// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Bulgarian (`bg`).
class AppLocalizationsBg extends AppLocalizations {
  AppLocalizationsBg([String locale = 'bg']) : super(locale);

  @override
  String get appTitle => 'Pricer';

  @override
  String get navSearch => 'Търсене';

  @override
  String get navLists => 'Списъци';

  @override
  String get navWatchlist => 'Наблюдавани';

  @override
  String get homeTagline =>
      'Намери най-евтината кошница бързо и я пусни отново утре също толкова лесно.';

  @override
  String get homeSearchCardTitle => 'Какво искаш да купиш?';

  @override
  String get homeSearchCardSubtitle =>
      'Търси на български и сравни най-евтиния резултат за днес.';

  @override
  String get searchFieldLabel => 'Заявка за продукти на български';

  @override
  String get searchFieldHint => 'прясно мляко 1л';

  @override
  String get searchButton => 'Намери най-добра цена';

  @override
  String get recentSearchesTitle => 'Последни търсения';

  @override
  String get recentSearchesSubtitle =>
      'Пусни отново обичайните си продукти с едно докосване.';

  @override
  String get recentSearchesEmptyTitle => 'Още няма последни търсения';

  @override
  String get recentSearchesEmptyMessage =>
      'Направи едно бързо търсене и то ще се появи тук за утре.';

  @override
  String get recentSearchesSampleAction => 'Пробвай пример';

  @override
  String get recentListsTitle => 'Последни списъци';

  @override
  String get recentListsSubtitle =>
      'Върни се към запазените кошници и ги пусни отново бързо.';

  @override
  String get recentListsEmptyTitle => 'Още няма запазени списъци';

  @override
  String get recentListsEmptyMessage =>
      'Запази резултат като списък, за да пазаруваш повторно почти мигновено.';

  @override
  String get rerunButton => 'Пусни пак';

  @override
  String get quickInsightLabel => 'Бърз поглед';

  @override
  String get todayLabel => 'Днес';

  @override
  String watchlistDropsReady(int count) {
    return '$count наблюдавани продукта са готови за повторна проверка.';
  }

  @override
  String rerunListInsight(String listName) {
    return 'Пусни отново $listName, за да опресниш общата цена за днес.';
  }

  @override
  String rerunSearchInsight(String query) {
    return 'Най-бързата печалба днес: пусни пак „$query“.';
  }

  @override
  String get searchStapleInsight =>
      'Потърси един основен продукт и виж най-евтиния магазин за секунди.';

  @override
  String get watchlistDropsCaption =>
      'Отвори наблюдаваните продукти, за да видиш кои цени вече са на или под целта.';

  @override
  String watchlistReadyCaption(int count) {
    return '$count наблюдавани продукта са готови за бърза дневна проверка на цената.';
  }

  @override
  String get recentRerunCaption =>
      'Последните търсения и списъци са наблизо, за да ги пускаш пак с един палец.';

  @override
  String get loadResultsError =>
      'Не успяхме да заредим резултатите в момента. Моля, опитай пак.';

  @override
  String get firestoreNotConfiguredStatus =>
      'Firebase още не е конфигуриран. Списъците и наблюдаваните продукти работят в паметта.';

  @override
  String get firestoreConnectedStatus =>
      'Firestore е свързан за анонимни списъци и наблюдавани продукти.';

  @override
  String get firestoreBootstrapFailedStatus =>
      'Инициализацията на Firebase се провали. Списъците и наблюдаваните продукти работят в паметта.';

  @override
  String get resultsNoMatchesTitle => 'Още няма съвпадения';

  @override
  String get resultsNoMatchesMessage =>
      'Опитай с по-точен продукт, марка или разфасовка, за да излезе най-евтиният резултат.';

  @override
  String get tryAgainButton => 'Опитай пак';

  @override
  String get resultsSummaryTitle => 'Най-евтината кошница днес';

  @override
  String get resultsSummarySubtitle =>
      'Спестяването остава на преден план при всеки резултат.';

  @override
  String get noStoreMatchYet => 'Още няма съвпадение за магазин';

  @override
  String get youSaveLabel => 'Спестяваш';

  @override
  String get badgeLabel => 'Значка';

  @override
  String get cheapestTodayBadge => 'Най-евтино днес';

  @override
  String savingsVsAverage(String amount) {
    return 'Спестяваш $amount спрямо последните средни цени';
  }

  @override
  String get cheapestTodayForQuery => 'Най-евтино днес за текущата заявка';

  @override
  String get saveResultTitle => 'Запази този резултат';

  @override
  String get saveResultSubtitle =>
      'Дръж тази кошница под ръка и я пускай пак по-късно с едно докосване.';

  @override
  String get saveAsListButton => 'Запази като списък';

  @override
  String get saveToShoppingListTitle => 'Запази в списък за пазаруване';

  @override
  String get listNameLabel => 'Име на списъка';

  @override
  String get cancelButton => 'Отказ';

  @override
  String get saveButton => 'Запази';

  @override
  String savedToListSnackBar(String name, String listName) {
    return '$name е запазен в $listName';
  }

  @override
  String get defaultSavedResultListName => 'Запазен резултат';

  @override
  String resultSavedSnackBar(String listName) {
    return 'Резултатът е запазен в $listName';
  }

  @override
  String addedToWatchlistSnackBar(String name) {
    return '$name е добавен в наблюдавани';
  }

  @override
  String get shareCopiedSnackBar => 'Текстът за споделяне е копиран';

  @override
  String shareNoMatchText(String query) {
    return 'Pricer: още няма съвпадение за „$query“.';
  }

  @override
  String shareResultText(String amount, String query, String store) {
    return 'Pricer: спестявам $amount за „$query“, а най-евтиният магазин днес е $store.';
  }

  @override
  String get watchButton => 'Следи';

  @override
  String get addToListButton => 'Добави в списък';

  @override
  String get detailsButton => 'Детайли';

  @override
  String get storeLabel => 'Магазин';

  @override
  String get matchLabel => 'Съвпадение';

  @override
  String get saveLabel => 'Спестяваш';

  @override
  String vsAverageShort(String amount) {
    return 'срещу средно $amount';
  }

  @override
  String get productHistoryLoadError =>
      'Не успяхме да заредим историята на продукта в момента.';

  @override
  String bestStoreToday(String store) {
    return 'Най-добрият магазин днес: $store';
  }

  @override
  String get priceHistoryTitle => 'История на цената';

  @override
  String get priceHistorySubtitle => 'Текуща цена спрямо последния тренд';

  @override
  String get noHistoryYet => 'Още няма история';

  @override
  String get recentPricePointsTitle => 'Последни ценови точки';

  @override
  String get recentPricePointsSubtitle =>
      'Използвай ги, за да прецениш дали днес е добър момент за покупка.';

  @override
  String get noRecordedHistoryTitle => 'Няма записана история';

  @override
  String get noRecordedHistoryMessage =>
      'Този продукт има нужда от още дневни снимки, преди трендът да стане полезен.';

  @override
  String priceRangeLabel(String minPrice, String maxPrice) {
    return 'Мин $minPrice  Макс $maxPrice';
  }

  @override
  String get trackPriceDropsTitle => 'Следи спадовете в цената';

  @override
  String get trackPriceDropsSubtitle =>
      'Следи този продукт сега и се върни, когато цената се промени.';

  @override
  String get watchItemButton => 'Следи продукта';

  @override
  String get quickListName => 'Бърз списък';

  @override
  String get shoppingListsTitle => 'Списъци за пазаруване';

  @override
  String get createShoppingListTitle => 'Създай списък за пазаруване';

  @override
  String get createButton => 'Създай';

  @override
  String get shoppingListsLoadError =>
      'Не успяхме да заредим запазените ти списъци.';

  @override
  String get savedBasketsTitle => 'Запазени кошници';

  @override
  String get savedBasketsSubtitle =>
      'Дръж повторните покупки централни и лесни за пускане отново.';

  @override
  String get newListButton => 'Нов списък';

  @override
  String get noShoppingListsTitle => 'Още няма списъци за пазаруване';

  @override
  String get noShoppingListsMessage =>
      'Запази резултат или създай списък тук, за да повтаряш покупките много по-бързо.';

  @override
  String updatedItemsSubtitle(String date, int count) {
    return 'Обновен $date • $count артикула';
  }

  @override
  String get openButton => 'Отвори';

  @override
  String get addItemTitle => 'Добави артикул';

  @override
  String get bulgarianQueryLabel => 'Заявка на български';

  @override
  String get addButton => 'Добави';

  @override
  String get shoppingListLoadError => 'Не успяхме да заредим този списък.';

  @override
  String itemsReadyToCompare(int count) {
    return '$count артикула са готови за сравнение';
  }

  @override
  String get noStoreWinnerYet => 'Още няма печеливш магазин';

  @override
  String get bestOneThumbRerun =>
      'Най-удобното повторно пускане с един палец за днес';

  @override
  String get updatedPricesLabel => 'Обновени цени';

  @override
  String get availableNowLabel => 'Налични сега';

  @override
  String get runComparisonHint =>
      'Пусни сравнение, за да видиш най-евтината обща сума и най-бързия повторен вариант.';

  @override
  String get addGroceriesFirstTitle => 'Първо добави няколко продукта';

  @override
  String get addGroceriesFirstMessage =>
      'Когато този списък има няколко артикула, можеш да сравниш най-евтината текуща обща цена с едно докосване.';

  @override
  String qtyLabel(int count) {
    return 'Бр. $count';
  }

  @override
  String get refreshPricesTitle => 'Опресни днешните цени';

  @override
  String get bestCurrentTotalTitle => 'Най-добра текуща обща сума';

  @override
  String get compareListSubtitle =>
      'Сравни този списък, за да изкараш най-евтината текуща кошница.';

  @override
  String cheapestStoreTotalSubtitle(String store, String total) {
    return 'Най-евтин магазин $store • Общо $total';
  }

  @override
  String get runComparisonButton => 'Пусни сравнение';

  @override
  String get watchlistTitle => 'Наблюдавани';

  @override
  String get watchlistLoadError =>
      'Не успяхме да заредим наблюдаваните продукти.';

  @override
  String get dropsSummaryTitle => 'Обобщение на спадовете';

  @override
  String get dropsSummarySubtitle =>
      'Този банер държи спешността при наблюдаваните цени видима.';

  @override
  String get noTrackedItemsYet => 'Още няма наблюдавани продукти';

  @override
  String watchlistDropsStatus(int drops, int count) {
    return '$drops от $count наблюдавани продукта са на или под целевата цена.';
  }

  @override
  String get watchlistEmptyTitle => 'Наблюдаваните продукти ще се появят тук';

  @override
  String get watchlistEmptyMessage =>
      'Добави продукт от резултатите, за да изградиш навик за наблюдение на цените.';

  @override
  String currentPriceLabel(String price) {
    return 'Текуща $price';
  }

  @override
  String get somethingWentWrongTitle => 'Нещо се обърка';

  @override
  String get retryButton => 'Опитай пак';

  @override
  String get belowRecentAverage => 'Под последната средна цена';

  @override
  String get higherThanRecentAverage => 'Над последната средна цена';

  @override
  String get aroundUsualPrice => 'Около обичайната цена';

  @override
  String get notAvailableShort => '-';

  @override
  String get premiumHomeTitle => 'Premium отключва по-умни спестявания';

  @override
  String get premiumHomeSubtitle =>
      'Включи оптимизация на кошница между магазини, известия за целева цена и приложение без реклами.';

  @override
  String get premiumActiveHomeTitle => 'Premium е активен';

  @override
  String get premiumActiveHomeSubtitle =>
      'Оптимизацията между магазини и известията са готови за това устройство.';

  @override
  String get viewPremiumButton => 'Виж Premium';

  @override
  String get managePlanButton => 'Управлявай плана';

  @override
  String get paywallTitle => 'Premium';

  @override
  String get paywallHeroTitle => 'Спестявай повече с Premium';

  @override
  String get paywallHeroSubtitle =>
      'Отключи оптимизация на кошница между магазини, известия за наблюдавани продукти и изживяване без реклами.';

  @override
  String get paywallPremiumActive =>
      'Premium правото е активно на това устройство.';

  @override
  String get paywallFeatureLabel => 'Включва';

  @override
  String get paywallFeatureOptimizer => 'Оптимизатор на кошница между магазини';

  @override
  String get paywallFeatureAlerts => 'Известия за целева цена';

  @override
  String get paywallFeatureNoAds => 'Изживяване без реклами';

  @override
  String get subscriptionStatusTitle => 'Статус на абонамента';

  @override
  String get subscriptionPremiumStatus => 'Premium е активен';

  @override
  String get subscriptionFreeStatus => 'Безплатен план';

  @override
  String watchlistLimitValue(int count) {
    return 'Лимит за наблюдавани продукти: $count';
  }

  @override
  String optimizerLimitValue(int count) {
    return 'Лимит на артикули за оптимизатора: $count';
  }

  @override
  String get billingNotConfiguredTitle => 'Плащанията още не са конфигурирани';

  @override
  String get billingNotConfiguredMessage =>
      'RevenueCat ключовете липсват за тази версия, затова paywall екранът е в режим на преглед.';

  @override
  String get noSubscriptionPackagesTitle => 'Няма налични абонаментни пакети';

  @override
  String get noSubscriptionPackagesMessage =>
      'RevenueCat е свързан, но за това приложение още няма публикувани оферти.';

  @override
  String get purchaseButton => 'Купи';

  @override
  String get restoreButton => 'Възстанови';

  @override
  String get restorePurchasesTitle => 'Вече имаш абонамент?';

  @override
  String get restorePurchasesSubtitle =>
      'Възстанови покупките на това устройство, ако си надградил другаде.';

  @override
  String get premiumPurchaseSuccess => 'Покупката на Premium завърши.';

  @override
  String get premiumStillPendingMessage =>
      'Покупката завърши, но Premium още не е активен. Опитай да обновиш след малко.';

  @override
  String get premiumPurchaseFailed => 'Не успяхме да завършим покупката.';

  @override
  String get restorePurchasesSuccess =>
      'Premium беше възстановен на това устройство.';

  @override
  String get restorePurchasesNoActive =>
      'Не беше намерен активен Premium абонамент за възстановяване.';

  @override
  String get restorePurchasesFailed =>
      'Не успяхме да възстановим покупките в момента.';

  @override
  String get multiStorePremiumTitle => 'Сравнявай между магазини';

  @override
  String get multiStorePremiumMessage =>
      'Premium отключва оптимизатора на кошница между магазини върху днешните съвпадения.';

  @override
  String get unlockPremiumButton => 'Отключи Premium';

  @override
  String get watchlistPremiumTitle => 'Premium известията са изключени';

  @override
  String get watchlistPremiumMessage =>
      'Надгради, за да включиш известия за целева цена и по-умни напомняния за наблюдавани продукти.';
}
