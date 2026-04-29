import 'package:flutter/material.dart';
import 'package:pricer_mobile/src/generated/l10n/app_localizations.dart';

import '../../core/models/app_models.dart';
import '../../core/navigation/app_routes.dart';
import '../../core/services/app_dependencies.dart';
import '../../core/ui/app_spacing.dart';
import '../../core/ui/app_widgets.dart';
import 'shopping_lists_screen.dart';

class ShoppingListDetailScreen extends StatefulWidget {
  const ShoppingListDetailScreen({
    super.key,
    required this.dependencies,
    required this.listId,
    this.initialName,
  });

  final AppDependencies dependencies;
  final String listId;
  final String? initialName;

  @override
  State<ShoppingListDetailScreen> createState() =>
      _ShoppingListDetailScreenState();
}

class _ShoppingListDetailScreenState extends State<ShoppingListDetailScreen> {
  late final TextEditingController _nameController;
  late final TextEditingController _itemsController;
  bool _loading = true;
  bool _saving = false;
  String? _error;
  SavedListDetail? _list;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.initialName ?? '');
    _itemsController = TextEditingController();
    _load();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _itemsController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (widget.listId.isEmpty) {
      setState(() {
        _loading = false;
        _error = 'No saved list was selected.';
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final list = await widget.dependencies.apiClient.getSavedList(
        ownerId: widget.dependencies.anonymousUserId,
        ownerType: 'anonymous',
        listId: widget.listId,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _list = list;
        _nameController.text = list.name;
        _itemsController.text = list.items.join('\n');
        _loading = false;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _loading = false;
        _error = 'Could not load this saved list.';
      });
    }
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    final items = parseSavedListInput(_itemsController.text);
    if (name.isEmpty || items.isEmpty || _saving) {
      return;
    }

    setState(() {
      _saving = true;
    });
    try {
      final saved = await widget.dependencies.apiClient.updateSavedList(
        ownerId: widget.dependencies.anonymousUserId,
        ownerType: 'anonymous',
        listId: widget.listId,
        name: name,
        items: items,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _list = saved;
        _nameController.text = saved.name;
        _itemsController.text = saved.items.join('\n');
        _saving = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Saved list updated.')),
      );
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _saving = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not save saved list.')),
      );
    }
  }

  void _optimize() {
    final items = parseSavedListInput(_itemsController.text);
    if (items.isEmpty) {
      return;
    }
    Navigator.of(context).pushNamed(
      AppRoutes.optimize,
      arguments: {'items': items},
    );
  }

  @override
  Widget build(BuildContext context) {
    final title = _list?.name ?? widget.initialName ?? 'Saved list';
    return Scaffold(
      appBar: AppBar(
        title: Text(title),
      ),
      body: AppScreen(
        child: ListView(
          key: const Key('saved-list-detail-screen'),
          children: [
            ..._buildBody(),
          ],
        ),
      ),
    );
  }

  List<Widget> _buildBody() {
    final l10n = AppLocalizations.of(context)!;

    if (_loading) {
      return const [
        SkeletonCard(key: Key('saved-list-detail-loading-state'), height: 120),
      ];
    }

    final error = _error;
    if (error != null) {
      return [
        ErrorStateCard(
          key: const Key('saved-list-detail-error-state'),
          message: error,
          onRetry: _load,
        ),
      ];
    }

    return [
      AppSectionCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const AppSectionHeader(
              title: 'Edit saved list',
              subtitle: 'Update items, save changes, or optimize this list.',
            ),
            const SizedBox(height: AppSpacing.md),
            TextField(
              key: const Key('saved-list-name-input'),
              controller: _nameController,
              decoration: InputDecoration(labelText: l10n.listNameLabel),
            ),
            const SizedBox(height: AppSpacing.md),
            TextField(
              key: const Key('saved-list-items-input'),
              controller: _itemsController,
              minLines: 6,
              maxLines: 12,
              decoration: const InputDecoration(
                labelText: 'Items',
                hintText: 'milk\neggs\nbread',
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                FilledButton.icon(
                  key: const Key('save-saved-list-button'),
                  onPressed: _saving ? null : _save,
                  icon: _saving
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.save_outlined),
                  label: Text(l10n.saveButton),
                ),
                OutlinedButton.icon(
                  key: const Key('optimize-saved-list-button'),
                  onPressed: _optimize,
                  icon: const Icon(Icons.auto_awesome),
                  label: const Text('Optimize this list'),
                ),
              ],
            ),
          ],
        ),
      ),
    ];
  }
}
