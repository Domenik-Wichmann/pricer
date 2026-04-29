import 'package:geolocator/geolocator.dart';

enum CurrentLocationStatus {
  acquired,
  permissionDenied,
  permissionPermanentlyDenied,
  locationUnavailable,
  error,
}

class CurrentLocationResult {
  const CurrentLocationResult({
    required this.status,
    this.latitude,
    this.longitude,
    this.message,
  });

  final CurrentLocationStatus status;
  final double? latitude;
  final double? longitude;
  final String? message;

  bool get hasCoordinates =>
      status == CurrentLocationStatus.acquired &&
      latitude != null &&
      longitude != null;
}

abstract class CurrentLocationService {
  Future<CurrentLocationResult> requestCurrentLocation();
}

class GeolocatorCurrentLocationService implements CurrentLocationService {
  const GeolocatorCurrentLocationService();

  @override
  Future<CurrentLocationResult> requestCurrentLocation() async {
    try {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        return const CurrentLocationResult(
          status: CurrentLocationStatus.locationUnavailable,
          message: 'Location services are turned off on this device.',
        );
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.denied) {
        return const CurrentLocationResult(
          status: CurrentLocationStatus.permissionDenied,
          message: 'Location permission was denied.',
        );
      }

      if (permission == LocationPermission.deniedForever) {
        return const CurrentLocationResult(
          status: CurrentLocationStatus.permissionPermanentlyDenied,
          message:
              'Location permission is permanently denied. Enable it in system settings.',
        );
      }

      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
          timeLimit: Duration(seconds: 10),
        ),
      );
      return CurrentLocationResult(
        status: CurrentLocationStatus.acquired,
        latitude: position.latitude,
        longitude: position.longitude,
      );
    } catch (error) {
      return CurrentLocationResult(
        status: CurrentLocationStatus.error,
        message: 'Current location is unavailable right now.',
      );
    }
  }
}

class DisabledCurrentLocationService implements CurrentLocationService {
  const DisabledCurrentLocationService();

  @override
  Future<CurrentLocationResult> requestCurrentLocation() async {
    return const CurrentLocationResult(
      status: CurrentLocationStatus.locationUnavailable,
      message: 'Current location is not available in this environment.',
    );
  }
}
