import 'package:flutter/material.dart';

import '../../core/ui/app_spacing.dart';
import '../../core/ui/app_widgets.dart';

class NavigationPlaceholderScreen extends StatelessWidget {
  const NavigationPlaceholderScreen({
    super.key,
    required this.title,
    required this.message,
  });

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(title),
      ),
      body: AppScreen(
        child: ListView(
          children: [
            AppSectionCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AppSectionHeader(
                    title: title,
                    subtitle: message,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Text(
                    message,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
