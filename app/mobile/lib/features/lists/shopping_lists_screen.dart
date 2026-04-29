import 'package:flutter/material.dart';
import 'package:pricer_mobile/src/generated/l10n/app_localizations.dart';

import '../../core/models/app_models.dart';
import '../../core/navigation/app_routes.dart';
import '../../core/services/app_dependencies.dart';
import '../../core/ui/app_spacing.dart';
import '../../core/ui/app_widgets.dart';
import '../../core/utils/formatters.dart';

class ShoppingListsScreen extends StatefulWidget {
  const ShoppingListsScreen({
    super.key,
    required this.dependencies,
    this.active = true,
  });

  final AppDependencies dependencies;
  final bool active;

  @override
  State<ShoppingListsScreen> createState() => _ShoppingListsScreenState();
}

class _ShoppingListsScreenState extends State<ShoppingListsScreen> {
  bool _loading = true;
  bool _loadedOnce = false;
  String? _error;
  List<SavedListSummary> _lists = const <SavedListSummary>[];
  final Set<String> _deleting = <String>{};

  @override
  void initState() {
    super.initState();
    if (widget.active) {
      _load();
    } else {
      _loading = false;
    }
  }

  @override
  void didUpdateWidget(covariant ShoppingListsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.active && !oldWidget.active && !_loadedOnce) {
      _load();
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final response = await widget.dependencies.apiClient.getSavedLists(
        ownerId: widget.dependencies.anonymousUserId,
        ownerType: 'anonymous',
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _lists = response.lists;
        _loading = false;
        _loadedOnce = true;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _loading = false;
        _loadedOnce = true;
        _error = 'Could not load saved lists.';
      });
    }
  }

  Future<void> _createList() async {
    final draft = await showDialog<_CreateListDraft>(
      context: context,
      builder: (_) => const _CreateListDialog(),
    );
    if (draft == null) {
      return;
    }

    try {
      final created = await widget.dependencies.apiClient.createSavedList(
        ownerId: widget.dependencies.anonymousUserId,
        ownerType: 'anonymous',
        name: draft.name,
        items: draft.items,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _lists = [created.toSummary(), ..._lists];
      });
    } catch (_) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not create saved list.')),
      );
    }
  }

  Future<void> _deleteList(SavedListSummary list) async {
    if (list.listId.isEmpty || _deleting.contains(list.listId)) {
      return;
    }
    setState(() {
      _deleting.add(list.listId);
    });
    try {
      await widget.dependencies.apiClient.deleteSavedList(
        ownerId: widget.dependencies.anonymousUserId,
        ownerType: 'anonymous',
        listId: list.listId,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _lists = _lists
            .where((candidate) => candidate.listId != list.listId)
            .toList();
        _deleting.remove(list.listId);
      });
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _deleting.remove(list.listId);
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not delete saved list.')),
      );
    }
  }

  void _openList(SavedListSummary list) {
    Navigator.of(context).pushNamed(
      AppRoutes.listDetail,
      arguments: {
        'list_id': list.listId,
        'name': list.name,
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.shoppingListsTitle),
      ),
      body: AppScreen(
        child: ListView(
          key: const Key('saved-lists-screen'),
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
                    onPressed: _createList,
                    icon: const Icon(Icons.add),
                    label: Text(l10n.newListButton),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            ..._buildBody(context),
          ],
        ),
      ),
    );
  }

  List<Widget> _buildBody(BuildContext context) {
    if (_loading) {
      return const [
        SkeletonCard(key: Key('saved-lists-loading-state'), height: 84),
        SizedBox(height: AppSpacing.md),
        SkeletonCard(height: 84),
      ];
    }

    final error = _error;
    if (error != null) {
      return [
        ErrorStateCard(
          key: const Key('saved-lists-error-state'),
          message: error,
          onRetry: _load,
        ),
      ];
    }

    if (_lists.isEmpty) {
      return const [
        EmptyStateCard(
          key: Key('saved-lists-empty-state'),
          title: 'No saved lists yet',
          message: 'Create a list to plan your shopping.',
        ),
      ];
    }

    return [
      for (final list in _lists) ...[
        AppSectionCard(
          key: Key('saved-list-card-${list.listId}'),
          child: ListTile(
            contentPadding: EdgeInsets.zero,
            onTap: () => _openList(list),
            title: Text(list.name),
            titleTextStyle: Theme.of(context).textTheme.titleSmall,
            subtitle: Text(
                [
                  '${list.itemCount} item${list.itemCount == 1 ? '' : 's'}',
                  'Updated ${formatShortDate(context, list.updatedAt)}',
                ].join(' - '),
                style: Theme.of(context).textTheme.bodySmall),
            trailing: IconButton(
              key: Key('delete-list-${list.listId}'),
              tooltip: 'Delete',
              onPressed: _deleting.contains(list.listId)
                  ? null
                  : () => _deleteList(list),
              icon: _deleting.contains(list.listId)
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.delete_outline),
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
      ],
    ];
  }
}

class _CreateListDialog extends StatefulWidget {
  const _CreateListDialog();

  @override
  State<_CreateListDialog> createState() => _CreateListDialogState();
}

class _CreateListDialogState extends State<_CreateListDialog> {
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _itemsController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    _itemsController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return AlertDialog(
      title: Text(l10n.createShoppingListTitle),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            key: const Key('create-list-name-input'),
            controller: _nameController,
            decoration: InputDecoration(labelText: l10n.listNameLabel),
          ),
          const SizedBox(height: AppSpacing.md),
          TextField(
            key: const Key('create-list-items-input'),
            controller: _itemsController,
            minLines: 3,
            maxLines: 6,
            decoration: const InputDecoration(
              labelText: 'Items',
              hintText: 'milk\neggs\nbread',
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(l10n.cancelButton),
        ),
        FilledButton(
          key: const Key('create-list-submit'),
          onPressed: () {
            final name = _nameController.text.trim();
            final items = parseSavedListInput(_itemsController.text);
            if (name.isEmpty || items.isEmpty) {
              return;
            }
            Navigator.of(context).pop(_CreateListDraft(name, items));
          },
          child: Text(l10n.createButton),
        ),
      ],
    );
  }
}

class _CreateListDraft {
  const _CreateListDraft(this.name, this.items);

  final String name;
  final List<String> items;
}

List<String> parseSavedListInput(String value) {
  return value
      .split(RegExp(r'[,\n]'))
      .map((item) => item.trim())
      .where((item) => item.isNotEmpty)
      .toList();
}
