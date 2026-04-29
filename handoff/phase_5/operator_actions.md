# Operator Actions

## Purpose
Only the Flutter and Firebase setup steps that require local SDK tooling remain.

## Ordered steps
1. Install Flutter on the machine you will use for mobile verification if it is not already available.
2. Open a terminal in `app/mobile`.
3. Run `flutter create . --platforms=android,ios`.
4. Run `flutter pub get`.
5. Generate real Firebase settings for this app and replace `lib/firebase_options.dart` with the generated file.
6. Run `flutter test`.
7. Run `flutter run -d android` and confirm the app boots, searches, and can save a list item.
8. Run `flutter run -d ios` and confirm the app boots, searches, and can save a watchlist item.
