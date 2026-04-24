import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/app_models.dart';

abstract class ShoppingListsRepository {
  Stream<List<ShoppingListModel>> watchLists();

  Stream<List<ShoppingListEntry>> watchItems(String listId);

  Future<String> ensureList(String name);

  Future<void> addItem({
    required String listId,
    required String queryText,
    String? matchedProductId,
    int quantity = 1,
  });

  Future<void> removeItem({
    required String listId,
    required String itemId,
  });
}

abstract class WatchlistRepository {
  Stream<List<WatchlistEntry>> watchEntries();

  Future<void> upsert({
    required String productId,
    required String displayName,
    double? targetPrice,
    double? currentPrice,
  });

  Future<void> remove(String productId);
}

class FirestoreShoppingListsRepository implements ShoppingListsRepository {
  FirestoreShoppingListsRepository({
    required FirebaseFirestore firestore,
    required String anonymousUserId,
  }) : _root = firestore
            .collection('users')
            .doc(anonymousUserId)
            .collection('lists');

  final CollectionReference<Map<String, dynamic>> _root;

  @override
  Stream<List<ShoppingListModel>> watchLists() {
    return _root
        .orderBy('updated_at', descending: true)
        .snapshots()
        .map((snapshot) {
      return snapshot.docs.map((document) {
        final data = document.data();
        return ShoppingListModel(
          id: document.id,
          name: data['name'] as String? ?? 'Untitled list',
          createdAt: _readDate(data['created_at']),
          updatedAt: _readDate(data['updated_at']),
          itemCount: (data['item_count'] as num?)?.toInt() ?? 0,
        );
      }).toList();
    });
  }

  @override
  Stream<List<ShoppingListEntry>> watchItems(String listId) {
    return _root
        .doc(listId)
        .collection('items')
        .orderBy('added_at')
        .snapshots()
        .map((snapshot) {
      return snapshot.docs.map((document) {
        final data = document.data();
        return ShoppingListEntry(
          id: document.id,
          queryText: data['query_text'] as String? ?? '',
          matchedProductId: data['matched_product_id'] as String?,
          quantity: (data['quantity'] as num?)?.toInt() ?? 1,
          addedAt: _readDate(data['added_at']),
        );
      }).toList();
    });
  }

  @override
  Future<String> ensureList(String name) async {
    final normalized = name.trim().isEmpty ? 'Quick list' : name.trim();
    final existing =
        await _root.where('name', isEqualTo: normalized).limit(1).get();
    if (existing.docs.isNotEmpty) {
      return existing.docs.first.id;
    }

    final document = _root.doc();
    final now = FieldValue.serverTimestamp();
    await document.set({
      'name': normalized,
      'created_at': now,
      'updated_at': now,
      'item_count': 0,
    });
    return document.id;
  }

  @override
  Future<void> addItem({
    required String listId,
    required String queryText,
    String? matchedProductId,
    int quantity = 1,
  }) async {
    final listRef = _root.doc(listId);
    await listRef.collection('items').add({
      'query_text': queryText,
      'matched_product_id': matchedProductId,
      'quantity': quantity,
      'added_at': FieldValue.serverTimestamp(),
    });

    await listRef.set({
      'updated_at': FieldValue.serverTimestamp(),
      'item_count': FieldValue.increment(1),
    }, SetOptions(merge: true));
  }

  @override
  Future<void> removeItem({
    required String listId,
    required String itemId,
  }) async {
    final listRef = _root.doc(listId);
    await listRef.collection('items').doc(itemId).delete();
    await listRef.set({
      'updated_at': FieldValue.serverTimestamp(),
      'item_count': FieldValue.increment(-1),
    }, SetOptions(merge: true));
  }
}

class FirestoreWatchlistRepository implements WatchlistRepository {
  FirestoreWatchlistRepository({
    required FirebaseFirestore firestore,
    required String anonymousUserId,
  }) : _root = firestore
            .collection('users')
            .doc(anonymousUserId)
            .collection('watchlist');

  final CollectionReference<Map<String, dynamic>> _root;

  @override
  Stream<List<WatchlistEntry>> watchEntries() {
    return _root
        .orderBy('added_at', descending: true)
        .snapshots()
        .map((snapshot) {
      return snapshot.docs.map((document) {
        final data = document.data();
        return WatchlistEntry(
          productId: document.id,
          displayName: data['display_name'] as String? ?? document.id,
          addedAt: _readDate(data['added_at']),
          targetPrice: _readDouble(data['target_price']),
          currentPrice: _readDouble(data['current_price']),
        );
      }).toList();
    });
  }

  @override
  Future<void> upsert({
    required String productId,
    required String displayName,
    double? targetPrice,
    double? currentPrice,
  }) async {
    await _root.doc(productId).set({
      'display_name': displayName,
      'target_price': targetPrice,
      'current_price': currentPrice,
      'added_at': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  @override
  Future<void> remove(String productId) {
    return _root.doc(productId).delete();
  }
}

class InMemoryShoppingListsRepository implements ShoppingListsRepository {
  final Map<String, ShoppingListModel> _lists = {};
  final Map<String, List<ShoppingListEntry>> _itemsByList = {};
  final StreamController<List<ShoppingListModel>> _listsController =
      StreamController<List<ShoppingListModel>>.broadcast();
  final Map<String, StreamController<List<ShoppingListEntry>>>
      _itemControllers = {};

  InMemoryShoppingListsRepository() {
    _emitLists();
  }

  @override
  Stream<List<ShoppingListModel>> watchLists() {
    _emitLists();
    return _listsController.stream;
  }

  @override
  Stream<List<ShoppingListEntry>> watchItems(String listId) {
    final controller = _itemControllers.putIfAbsent(
      listId,
      () => StreamController<List<ShoppingListEntry>>.broadcast(),
    );
    controller
        .add(List<ShoppingListEntry>.from(_itemsByList[listId] ?? const []));
    return controller.stream;
  }

  @override
  Future<String> ensureList(String name) async {
    final normalized = name.trim().isEmpty ? 'Quick list' : name.trim();
    final existing = _lists.values.where((entry) => entry.name == normalized);
    if (existing.isNotEmpty) {
      return existing.first.id;
    }

    final id = 'list-${_lists.length + 1}';
    final now = DateTime.now();
    _lists[id] = ShoppingListModel(
      id: id,
      name: normalized,
      createdAt: now,
      updatedAt: now,
      itemCount: 0,
    );
    _itemsByList[id] = <ShoppingListEntry>[];
    _emitLists();
    _emitItems(id);
    return id;
  }

  @override
  Future<void> addItem({
    required String listId,
    required String queryText,
    String? matchedProductId,
    int quantity = 1,
  }) async {
    final entries =
        _itemsByList.putIfAbsent(listId, () => <ShoppingListEntry>[]);
    entries.add(
      ShoppingListEntry(
        id: 'item-${entries.length + 1}',
        queryText: queryText,
        matchedProductId: matchedProductId,
        quantity: quantity,
        addedAt: DateTime.now(),
      ),
    );

    final current = _lists[listId];
    if (current != null) {
      _lists[listId] = ShoppingListModel(
        id: current.id,
        name: current.name,
        createdAt: current.createdAt,
        updatedAt: DateTime.now(),
        itemCount: entries.length,
      );
    }

    _emitLists();
    _emitItems(listId);
  }

  @override
  Future<void> removeItem({
    required String listId,
    required String itemId,
  }) async {
    final entries = _itemsByList[listId];
    if (entries == null) {
      return;
    }

    entries.removeWhere((entry) => entry.id == itemId);
    final current = _lists[listId];
    if (current != null) {
      _lists[listId] = ShoppingListModel(
        id: current.id,
        name: current.name,
        createdAt: current.createdAt,
        updatedAt: DateTime.now(),
        itemCount: entries.length,
      );
    }

    _emitLists();
    _emitItems(listId);
  }

  void _emitLists() {
    final ordered = _lists.values.toList()
      ..sort((left, right) {
        final leftUpdated =
            left.updatedAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        final rightUpdated =
            right.updatedAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        return rightUpdated.compareTo(leftUpdated);
      });
    _listsController.add(ordered);
  }

  void _emitItems(String listId) {
    final controller = _itemControllers.putIfAbsent(
      listId,
      () => StreamController<List<ShoppingListEntry>>.broadcast(),
    );
    controller
        .add(List<ShoppingListEntry>.from(_itemsByList[listId] ?? const []));
  }
}

class InMemoryWatchlistRepository implements WatchlistRepository {
  final Map<String, WatchlistEntry> _entries = {};
  final StreamController<List<WatchlistEntry>> _controller =
      StreamController<List<WatchlistEntry>>.broadcast();

  InMemoryWatchlistRepository() {
    _emit();
  }

  @override
  Stream<List<WatchlistEntry>> watchEntries() {
    _emit();
    return _controller.stream;
  }

  @override
  Future<void> upsert({
    required String productId,
    required String displayName,
    double? targetPrice,
    double? currentPrice,
  }) async {
    _entries[productId] = WatchlistEntry(
      productId: productId,
      displayName: displayName,
      addedAt: DateTime.now(),
      targetPrice: targetPrice,
      currentPrice: currentPrice,
    );
    _emit();
  }

  @override
  Future<void> remove(String productId) async {
    _entries.remove(productId);
    _emit();
  }

  void _emit() {
    final ordered = _entries.values.toList()
      ..sort((left, right) {
        final leftAdded =
            left.addedAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        final rightAdded =
            right.addedAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        return rightAdded.compareTo(leftAdded);
      });
    _controller.add(ordered);
  }
}

DateTime? _readDate(Object? value) {
  if (value == null) {
    return null;
  }

  if (value is Timestamp) {
    return value.toDate();
  }

  if (value is DateTime) {
    return value;
  }

  return DateTime.tryParse(value.toString());
}

double? _readDouble(Object? value) {
  if (value == null) {
    return null;
  }

  if (value is num) {
    return value.toDouble();
  }

  return double.tryParse(value.toString());
}
