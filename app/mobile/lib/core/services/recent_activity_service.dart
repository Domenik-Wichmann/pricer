import 'package:shared_preferences/shared_preferences.dart';

abstract class RecentActivityService {
  Future<List<String>> loadRecentSearches();

  Future<void> rememberSearch(String query);
}

class SharedPreferencesRecentActivityService implements RecentActivityService {
  static const _recentSearchesKey = 'pricer_recent_searches';
  static const _maxEntries = 6;

  @override
  Future<List<String>> loadRecentSearches() async {
    final preferences = await SharedPreferences.getInstance();
    return preferences.getStringList(_recentSearchesKey) ?? const <String>[];
  }

  @override
  Future<void> rememberSearch(String query) async {
    final trimmed = query.trim();
    if (trimmed.isEmpty) {
      return;
    }

    final preferences = await SharedPreferences.getInstance();
    final existing =
        preferences.getStringList(_recentSearchesKey) ?? <String>[];
    final next = <String>[
      trimmed,
      ...existing.where((value) => value != trimmed),
    ].take(_maxEntries).toList();
    await preferences.setStringList(_recentSearchesKey, next);
  }
}

class InMemoryRecentActivityService implements RecentActivityService {
  final List<String> _recentSearches = <String>[];

  @override
  Future<List<String>> loadRecentSearches() async {
    return List<String>.from(_recentSearches);
  }

  @override
  Future<void> rememberSearch(String query) async {
    final trimmed = query.trim();
    if (trimmed.isEmpty) {
      return;
    }

    _recentSearches
      ..remove(trimmed)
      ..insert(0, trimmed);
    if (_recentSearches.length > 6) {
      _recentSearches.removeRange(6, _recentSearches.length);
    }
  }
}
