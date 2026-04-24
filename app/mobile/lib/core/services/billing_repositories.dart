import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/app_models.dart';

abstract class MonetizationProfileRepository {
  Stream<MonetizationProfile> watchProfile();

  Future<MonetizationProfile> readProfile();

  Future<void> saveProfile(MonetizationProfile profile);
}

class FirestoreMonetizationProfileRepository
    implements MonetizationProfileRepository {
  FirestoreMonetizationProfileRepository({
    required FirebaseFirestore firestore,
    required String anonymousUserId,
  })  : _anonymousUserId = anonymousUserId,
        _document = firestore
            .collection('users')
            .doc(anonymousUserId)
            .collection('billing')
            .doc('profile');

  final String _anonymousUserId;
  final DocumentReference<Map<String, dynamic>> _document;

  @override
  Stream<MonetizationProfile> watchProfile() {
    return _document.snapshots().map((snapshot) {
      if (!snapshot.exists) {
        return MonetizationProfile.free(_anonymousUserId);
      }

      return MonetizationProfile.fromJson(
        snapshot.data() ?? const <String, dynamic>{},
        userId: _anonymousUserId,
      );
    });
  }

  @override
  Future<MonetizationProfile> readProfile() async {
    final snapshot = await _document.get();
    if (!snapshot.exists) {
      return MonetizationProfile.free(_anonymousUserId);
    }

    return MonetizationProfile.fromJson(
      snapshot.data() ?? const <String, dynamic>{},
      userId: _anonymousUserId,
    );
  }

  @override
  Future<void> saveProfile(MonetizationProfile profile) {
    return _document.set(profile.toJson(), SetOptions(merge: true));
  }
}

class InMemoryMonetizationProfileRepository
    implements MonetizationProfileRepository {
  InMemoryMonetizationProfileRepository({
    required String anonymousUserId,
  }) : _profile = MonetizationProfile.free(anonymousUserId) {
    _controller.add(_profile);
  }

  MonetizationProfile _profile;
  final StreamController<MonetizationProfile> _controller =
      StreamController<MonetizationProfile>.broadcast();

  @override
  Stream<MonetizationProfile> watchProfile() {
    _controller.add(_profile);
    return _controller.stream;
  }

  @override
  Future<MonetizationProfile> readProfile() async => _profile;

  @override
  Future<void> saveProfile(MonetizationProfile profile) async {
    _profile = profile;
    _controller.add(_profile);
  }
}
