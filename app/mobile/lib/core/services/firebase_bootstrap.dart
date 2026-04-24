import 'package:firebase_core/firebase_core.dart';

class FirebaseBootstrapConfig {
  const FirebaseBootstrapConfig._();

  static bool isConfigured(FirebaseOptions options) {
    return !_looksLikePlaceholder(options.apiKey) &&
        !_looksLikePlaceholder(options.appId) &&
        !_looksLikePlaceholder(options.messagingSenderId) &&
        !_looksLikePlaceholder(options.projectId);
  }

  static bool _looksLikePlaceholder(String value) {
    final normalized = value.trim().toLowerCase();
    return normalized.isEmpty || normalized == 'replace-me';
  }
}
