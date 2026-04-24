import 'package:shared_preferences/shared_preferences.dart';

class LocalIdentityService {
  static const _anonIdKey = 'pricer_anon_id';

  Future<String> getOrCreateAnonymousId() async {
    final preferences = await SharedPreferences.getInstance();
    final existing = preferences.getString(_anonIdKey);
    if (existing != null && existing.isNotEmpty) {
      return existing;
    }

    final created = 'anon-${DateTime.now().millisecondsSinceEpoch}';
    await preferences.setString(_anonIdKey, created);
    return created;
  }
}
