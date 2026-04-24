import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:pricer_mobile/src/generated/l10n/app_localizations.dart';

import 'core/services/app_dependencies.dart';
import 'core/ui/app_theme.dart';
import 'features/lists/shopping_lists_screen.dart';
import 'features/search/home_screen.dart';
import 'features/watchlist/watchlist_screen.dart';

class PricerApp extends StatelessWidget {
  const PricerApp({
    super.key,
    required this.dependencies,
    this.locale,
  });

  final AppDependencies dependencies;
  final Locale? locale;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      onGenerateTitle: (context) => AppLocalizations.of(context)!.appTitle,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      locale: locale,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ],
      supportedLocales: const [
        Locale('en'),
        Locale('bg'),
      ],
      localeResolutionCallback: (locale, supportedLocales) {
        if (locale == null) {
          return const Locale('en');
        }

        for (final supportedLocale in supportedLocales) {
          if (supportedLocale.languageCode == locale.languageCode) {
            return supportedLocale;
          }
        }

        return const Locale('en');
      },
      home: RootShell(dependencies: dependencies),
    );
  }
}

class RootShell extends StatefulWidget {
  const RootShell({
    super.key,
    required this.dependencies,
  });

  final AppDependencies dependencies;

  @override
  State<RootShell> createState() => _RootShellState();
}

class _RootShellState extends State<RootShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final pages = [
      HomeScreen(dependencies: widget.dependencies),
      ShoppingListsScreen(dependencies: widget.dependencies),
      WatchlistScreen(dependencies: widget.dependencies),
    ];

    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: pages,
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (value) {
          setState(() {
            _index = value;
          });
        },
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.search),
            label: l10n.navSearch,
          ),
          NavigationDestination(
            icon: const Icon(Icons.list_alt),
            label: l10n.navLists,
          ),
          NavigationDestination(
            icon: const Icon(Icons.bookmark_outline),
            label: l10n.navWatchlist,
          ),
        ],
      ),
    );
  }
}
