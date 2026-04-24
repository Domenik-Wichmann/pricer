# Flutter app

Phase 5 mobile client code lives in this directory.

## Current state
- `lib/` contains the app shell, API client, Firestore repositories, screens, and widget tests.
- Android and iOS runner folders are present in-repo and now target the final app id `com.pricer.mobile`.
- Android and iOS Firebase config has been refreshed for `com.pricer.mobile`.
- macOS Firebase config is still outside the current migration scope and remains operator-owned if that platform is re-enabled later.

## Expected commands once Flutter is installed
- `flutter create . --platforms=android,ios`
- `flutter pub get`
- `flutter test`
