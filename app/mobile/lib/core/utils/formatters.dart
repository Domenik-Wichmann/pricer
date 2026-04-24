import 'package:flutter/widgets.dart';
import 'package:pricer_mobile/src/generated/l10n/app_localizations.dart';
import 'package:intl/intl.dart';

String formatPrice(BuildContext context, double value) {
  final locale = Localizations.localeOf(context).toString();
  final currencyFormat = NumberFormat.currency(
    locale: locale,
    symbol: 'EUR ',
    decimalDigits: 2,
  );
  return currencyFormat.format(value);
}

String formatNullablePrice(BuildContext context, double? value) {
  if (value == null) {
    return AppLocalizations.of(context)?.notAvailableShort ?? '-';
  }

  return formatPrice(context, value);
}

String formatShortDate(BuildContext context, DateTime? value) {
  if (value == null) {
    return AppLocalizations.of(context)?.notAvailableShort ?? '-';
  }

  final locale = Localizations.localeOf(context).toString();
  final dateFormat = DateFormat('dd MMM', locale);
  return dateFormat.format(value);
}
