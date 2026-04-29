# Operator Actions

## Purpose
Only Flutter toolchain and Firebase setup steps that cannot be completed in this environment remain.

## Ordered steps
1. Install Flutter on the verification machine if it is not already available.
2. Open a terminal in `app/mobile`.
3. Run `flutter create . --platforms=android,ios` if native runners have not been generated yet.
4. Run `flutter pub get`.
5. Replace `lib/firebase_options.dart` with the real generated Firebase config.
6. Run `flutter test`.
7. Run `flutter run -d android` and verify:
   - Home shows the daily insight card
   - Results show savings and the share CTA
   - Product Detail shows the good-price indicator
   - Lists can be rerun
   - Watchlist shows the drops summary banner
8. Run `flutter run -d ios` and verify the same core flow.
