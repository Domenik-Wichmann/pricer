import 'package:flutter/material.dart';
import 'package:pricer_mobile/src/generated/l10n/app_localizations.dart';

import '../../core/models/app_models.dart';
import '../../core/services/app_dependencies.dart';
import '../../core/ui/app_spacing.dart';
import '../../core/ui/app_widgets.dart';
import '../../core/utils/formatters.dart';
import 'shopping_list_detail_screen.dart';

class ShoppingListsScreen extends StatelessWidget {
  const ShoppingListsScreen({
    super.key,
    required this.dependencies,
  });

  final AppDependencies dependencies;

  Future<void> _createList(BuildContext context) async {
    final l10n = AppLocalizations.of(context)!;
    final controller = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: Text(l10n.createShoppingListTitle),
          content: TextField(
            key: const Key('create-list-input'),
            controller: controller,
            decoration: InputDecoration(
              labelText: l10n.listNameLabel,
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(l10n.cancelButton),
            ),
            FilledButton(
              key: const Key('create-list-submit'),
              onPressed: () =>
                  Navigator.of(context).pop(controller.text.trim()),
              child: Text(l10n.createButton),
            ),
          ],
        );
      },
    );

    if (name == null) {
      return;
    }

    await dependencies.shoppingListsRepository.ensureList(name);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.shoppingListsTitle),
      ),
      body: StreamBuilder<List<ShoppingListModel>>(
        stream: dependencies.shoppingListsRepository.watchLists(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return AppScreen(
              child: ListView(
                children: const [
                  SkeletonCard(height: 84),
                  SizedBox(height: AppSpacing.md),
                  SkeletonCard(height: 84),
                ],
              ),
            );
          }

          if (snapshot.hasError) {
            return AppScreen(
              child: ErrorStateCard(
                message: l10n.shoppingListsLoadError,
                onRetry: () {},
              ),
            );
          }

          final lists = snapshot.data ?? const <ShoppingListModel>[];
          return AppScreen(
            child: ListView(
              children: [
                AppSectionCard(
                  child: Row(
                    children: [
                      Expanded(
                        child: AppSectionHeader(
                          title: l10n.savedBasketsTitle,
                          subtitle: l10n.savedBasketsSubtitle,
                        ),
                      ),
                      FilledButton.icon(
                        key: const Key('create-list-button'),
                        style: FilledButton.styleFrom(
                          minimumSize: const Size(0, 52),
                        ),
                        onPressed: () => _createList(context),
                        icon: const Icon(Icons.add),
                        label: Text(l10n.newListButton),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                if (lists.isEmpty)
                  EmptyStateCard(
                    title: l10n.noShoppingListsTitle,
                    message: l10n.noShoppingListsMessage,
                  )
                else
                  for (var index = 0; index < lists.length; index += 1) ...[
                    AppSectionCard(
                      child: ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(lists[index].name),
                        subtitle: Text(
                          l10n.updatedItemsSubtitle(
                            formatShortDate(context, lists[index].updatedAt),
                            lists[index].itemCount,
                          ),
                        ),
                        trailing: OutlinedButton(
                          onPressed: () {
                            Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => ShoppingListDetailScreen(
                                  dependencies: dependencies,
                                  shoppingList: lists[index],
                                ),
                              ),
                            );
                          },
                          child: Text(l10n.openButton),
                        ),
                      ),
                    ),
                    if (index < lists.length - 1)
                      const SizedBox(height: AppSpacing.md),
                  ],
              ],
            ),
          );
        },
      ),
    );
  }
}
