import 'package:flutter/material.dart';

import '../../core/models/app_models.dart';
import '../../core/navigation/app_routes.dart';
import '../../core/services/app_dependencies.dart';
import '../../core/services/current_location_service.dart';
import '../../core/ui/app_spacing.dart';
import '../../core/ui/app_widgets.dart';
import '../../core/utils/formatters.dart';

class ProductSearchScreen extends StatefulWidget {
  const ProductSearchScreen({
    super.key,
    required this.dependencies,
    required this.initialQuery,
  });

  final AppDependencies dependencies;
  final String initialQuery;

  @override
  State<ProductSearchScreen> createState() => _ProductSearchScreenState();
}

class _ProductSearchScreenState extends State<ProductSearchScreen> {
  late final TextEditingController _controller;
  bool _loading = false;
  bool _availabilityLoading = false;
  bool _currentLocationLoading = false;
  bool _currentLocationSaving = false;
  bool _manualAddressGeocodeLoading = false;
  bool _manualAddressGeocodeSaving = false;
  String? _error;
  String? _availabilityError;
  String? _availabilityValidationMessage;
  String? _currentLocationSaveMessage;
  String? _manualAddressGeocodeMessage;
  String _activeQuery = '';
  String _locationMode = 'manual';
  String _availabilitySort = 'nearest';
  double _radiusKm = 3;
  ProductSearchResponse? _response;
  SavedUserLocationsResponse? _savedLocations;
  NearestAvailabilityResponse? _availability;
  ProductSearchResult? _availabilityProduct;
  CurrentLocationResult? _currentLocationResult;
  ManualAddressGeocodeResponse? _manualAddressGeocodeResponse;
  ManualAddressGeocode? _confirmedManualAddressGeocode;
  final TextEditingController _manualDisplayNameController =
      TextEditingController();
  final TextEditingController _manualAddressController =
      TextEditingController();
  final TextEditingController _latitudeController =
      TextEditingController(text: '42.6977');
  final TextEditingController _longitudeController =
      TextEditingController(text: '23.3219');

  static const double _maxRadiusKm = 50;

  @override
  void initState() {
    super.initState();
    _activeQuery = widget.initialQuery.trim();
    _controller = TextEditingController(text: _activeQuery);
    if (_activeQuery.isNotEmpty) {
      _search(_activeQuery);
    }
    _loadSavedLocations();
  }

  @override
  void dispose() {
    _controller.dispose();
    _manualDisplayNameController.dispose();
    _manualAddressController.dispose();
    _latitudeController.dispose();
    _longitudeController.dispose();
    super.dispose();
  }

  Future<void> _loadSavedLocations() async {
    try {
      final response =
          await widget.dependencies.apiClient.getSavedUserLocations(
        ownerId: widget.dependencies.anonymousUserId,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _savedLocations = response;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _savedLocations = const SavedUserLocationsResponse(
          locations: <SavedUserLocation>[],
          total: 0,
        );
      });
    }
  }

  Future<void> _search([String? queryOverride]) async {
    final query = (queryOverride ?? _controller.text).trim();
    if (query.isEmpty) {
      setState(() {
        _activeQuery = '';
        _response = null;
        _error = null;
        _loading = false;
      });
      return;
    }

    setState(() {
      _activeQuery = query;
      _loading = true;
      _error = null;
    });

    try {
      final response =
          await widget.dependencies.apiClient.searchProducts(query: query);
      if (!mounted) {
        return;
      }

      setState(() {
        _response = response;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }

      setState(() {
        _loading = false;
        _error = 'We could not search products right now.';
      });
    }
  }

  void _openProduct(ProductSearchResult result) {
    if (result.canonicalProductId.isEmpty) {
      return;
    }

    Navigator.of(context).pushNamed(
      AppRoutes.product,
      arguments: {'canonicalProductId': result.canonicalProductId},
    );
  }

  Future<void> _findNearest(ProductSearchResult result) async {
    final validationMessage = _validateAvailabilityInput();
    if (validationMessage != null) {
      setState(() {
        _availabilityLoading = false;
        _availabilityError = null;
        _availabilityValidationMessage = validationMessage;
        _availability = null;
        _availabilityProduct = result;
      });
      return;
    }

    setState(() {
      _availabilityLoading = true;
      _availabilityError = null;
      _availabilityValidationMessage = null;
      _availability = null;
      _availabilityProduct = result;
    });

    try {
      final selected = _selectedSavedLocation();
      final response =
          await widget.dependencies.apiClient.getNearestAvailability(
        ownerId: widget.dependencies.anonymousUserId,
        canonicalProductId: result.canonicalProductId,
        latitude: _locationMode == 'manual'
            ? double.tryParse(_latitudeController.text.trim())
            : null,
        longitude: _locationMode == 'manual'
            ? double.tryParse(_longitudeController.text.trim())
            : null,
        savedLocationId: selected?.locationId,
        label: selected == null && _locationMode != 'manual'
            ? _locationMode
            : null,
        radiusKm: _radiusKm,
        sort: _availabilitySort,
        limit: 10,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _availability = response;
        _availabilityLoading = false;
        _availabilityValidationMessage = null;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _availabilityLoading = false;
        _availabilityError = 'Nearest stores are unavailable right now.';
      });
    }
  }

  Future<void> _useCurrentLocation() async {
    setState(() {
      _currentLocationLoading = true;
      _currentLocationResult = null;
      _currentLocationSaveMessage = null;
      _availabilityValidationMessage = null;
    });

    final result = await widget.dependencies.currentLocationService
        .requestCurrentLocation();
    if (!mounted) {
      return;
    }

    setState(() {
      _currentLocationLoading = false;
      _currentLocationResult = result;
      if (result.hasCoordinates) {
        _locationMode = 'manual';
        _latitudeController.text = result.latitude!.toStringAsFixed(6);
        _longitudeController.text = result.longitude!.toStringAsFixed(6);
      }
    });
  }

  Future<void> _saveCurrentLocation(String label) async {
    final result = _currentLocationResult;
    if (result == null || !result.hasCoordinates || _currentLocationSaving) {
      return;
    }

    setState(() {
      _currentLocationSaving = true;
      _currentLocationSaveMessage = null;
    });

    final displayName = _displayNameForSavedCurrentLocation(label);
    final address = _manualAddressController.text.trim();
    try {
      await widget.dependencies.apiClient.upsertSavedUserLocation(
        ownerId: widget.dependencies.anonymousUserId,
        label: label,
        displayName: displayName,
        addressRaw: address.isEmpty ? null : address,
        latitude: result.latitude!,
        longitude: result.longitude!,
        defaultRadiusKm: _radiusKm,
        defaultSort: _availabilitySort,
        source: 'device',
      );
      await _loadSavedLocations();
      if (!mounted) {
        return;
      }
      setState(() {
        _currentLocationSaving = false;
        _currentLocationSaveMessage = 'Saved $displayName.';
      });
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _currentLocationSaving = false;
        _currentLocationSaveMessage = 'Could not save this location.';
      });
    }
  }

  Future<void> _findManualAddressCoordinates() async {
    final address = _manualAddressController.text.trim();
    if (address.length < 4) {
      setState(() {
        _manualAddressGeocodeResponse = null;
        _confirmedManualAddressGeocode = null;
        _manualAddressGeocodeMessage =
            'Enter an address before finding coordinates.';
      });
      return;
    }

    setState(() {
      _manualAddressGeocodeLoading = true;
      _manualAddressGeocodeMessage = null;
      _manualAddressGeocodeResponse = null;
      _confirmedManualAddressGeocode = null;
    });

    try {
      final response = await widget.dependencies.apiClient.geocodeManualAddress(
        ownerId: widget.dependencies.anonymousUserId,
        addressRaw: address,
        country: 'BG',
        displayName: _manualDisplayNameController.text.trim(),
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _manualAddressGeocodeLoading = false;
        _manualAddressGeocodeResponse = response;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _manualAddressGeocodeLoading = false;
        _manualAddressGeocodeResponse = null;
        _manualAddressGeocodeMessage =
            'Address lookup is unavailable right now.';
      });
    }
  }

  void _confirmManualAddressCoordinates() {
    final geocode = _manualAddressGeocodeResponse?.geocode;
    if (geocode == null || !geocode.hasCoordinates) {
      return;
    }

    setState(() {
      _locationMode = 'manual';
      _latitudeController.text = geocode.latitude!.toStringAsFixed(6);
      _longitudeController.text = geocode.longitude!.toStringAsFixed(6);
      _confirmedManualAddressGeocode = geocode;
      _manualAddressGeocodeMessage =
          'Coordinates applied. You can search nearby or save them.';
    });
  }

  Future<void> _saveConfirmedManualAddressLocation(String label) async {
    final geocode = _confirmedManualAddressGeocode;
    if (geocode == null ||
        !geocode.hasCoordinates ||
        _manualAddressGeocodeSaving) {
      return;
    }

    setState(() {
      _manualAddressGeocodeSaving = true;
      _manualAddressGeocodeMessage = null;
    });

    final displayName = _displayNameForSavedGeocodedLocation(label, geocode);
    final rawAddress = _manualAddressController.text.trim();
    try {
      await widget.dependencies.apiClient.upsertSavedUserLocation(
        ownerId: widget.dependencies.anonymousUserId,
        label: label,
        displayName: displayName,
        addressRaw: rawAddress.isEmpty ? geocode.formattedAddress : rawAddress,
        latitude: geocode.latitude!,
        longitude: geocode.longitude!,
        defaultRadiusKm: _radiusKm,
        defaultSort: _availabilitySort,
        source: 'geocoded',
        provider: geocode.provider,
        providerPlaceId: geocode.providerPlaceId,
        formattedAddress: geocode.formattedAddress,
        confidence: geocode.confidence,
        confidenceReason: geocode.confidenceReason,
        provenance: {
          ...geocode.provenance,
          'geocode_id': geocode.geocodeId,
          'query_text': geocode.queryText,
        },
      );
      await _loadSavedLocations();
      if (!mounted) {
        return;
      }
      setState(() {
        _manualAddressGeocodeSaving = false;
        _manualAddressGeocodeMessage = 'Saved $displayName.';
      });
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _manualAddressGeocodeSaving = false;
        _manualAddressGeocodeMessage = 'Could not save these coordinates.';
      });
    }
  }

  SavedUserLocation? _selectedSavedLocation() {
    if (_locationMode == 'manual') {
      return null;
    }
    final locations = _savedLocations?.locations ?? const <SavedUserLocation>[];
    for (final location in locations) {
      if (location.label == _locationMode) {
        return location;
      }
    }
    return null;
  }

  String? _validateAvailabilityInput() {
    if (_radiusKm <= 0 || _radiusKm > _maxRadiusKm) {
      return 'Choose a radius between 1 and 50 km.';
    }

    if (_locationMode == 'manual') {
      final latitude = double.tryParse(_latitudeController.text.trim());
      if (latitude == null || latitude < -90 || latitude > 90) {
        return 'Latitude must be a number from -90 to 90.';
      }

      final longitude = double.tryParse(_longitudeController.text.trim());
      if (longitude == null || longitude < -180 || longitude > 180) {
        return 'Longitude must be a number from -180 to 180.';
      }

      return null;
    }

    final selected = _selectedSavedLocation();
    if (selected != null || _savedLocations == null) {
      return null;
    }

    final locations = _savedLocations?.locations ?? const <SavedUserLocation>[];
    if (locations.isEmpty) {
      return 'No saved locations yet. Use Manual coordinates for this search.';
    }

    return 'No saved ${_locationLabel(_locationMode)} location yet. Choose another saved location or use Manual coordinates.';
  }

  String _displayNameForSavedCurrentLocation(String label) {
    if (label == 'home') return 'Home';
    if (label == 'work') return 'Work';
    final customName = _manualDisplayNameController.text.trim();
    return customName.isEmpty ? 'Current location' : customName;
  }

  String _displayNameForSavedGeocodedLocation(
      String label, ManualAddressGeocode geocode) {
    if (label == 'home') return 'Home';
    if (label == 'work') return 'Work';
    final customName = _manualDisplayNameController.text.trim();
    if (customName.isNotEmpty) return customName;
    final formatted = geocode.formattedAddress?.trim() ?? '';
    return formatted.isEmpty ? 'Geocoded location' : formatted;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Search'),
      ),
      body: AppScreen(
        child: ListView(
          key: const Key('product-search-screen'),
          children: [
            AppSectionCard(
              key: const Key('product-search-input-card'),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      key: const Key('product-search-input'),
                      controller: _controller,
                      textInputAction: TextInputAction.search,
                      onSubmitted: _search,
                      decoration: const InputDecoration(
                        hintText: 'Search products',
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  IconButton.filled(
                    key: const Key('product-search-button'),
                    onPressed: _loading ? null : () => _search(),
                    icon: _loading
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.search),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            ..._buildBody(),
            ..._buildAvailabilityBody(),
          ],
        ),
      ),
    );
  }

  List<Widget> _buildBody() {
    if (_activeQuery.isEmpty && !_loading) {
      return const [
        EmptyStateCard(
          key: Key('product-search-empty-query'),
          title: 'Search products',
          message: 'Search for products to get started.',
        ),
      ];
    }

    if (_loading) {
      return const [
        SkeletonCard(
          key: Key('product-search-loading'),
          height: 140,
        ),
      ];
    }

    if (_error != null) {
      return [
        ErrorStateCard(
          key: const Key('product-search-error'),
          message: _error!,
          onRetry: () => _search(_activeQuery),
        ),
      ];
    }

    final results = _response?.results ?? const <ProductSearchResult>[];
    if (results.isEmpty) {
      return [
        EmptyStateCard(
          key: const Key('product-search-empty-results'),
          title: 'No products found',
          message: _activeQuery.isEmpty
              ? 'Search for products to get started.'
              : 'No products matched "$_activeQuery".',
        ),
      ];
    }

    return [
      AppSectionHeader(
        title: 'Results',
        subtitle: '${_response?.total ?? results.length} products found',
      ),
      const SizedBox(height: AppSpacing.md),
      for (final result in results) ...[
        _ProductSearchResultCard(
          key: Key('product-search-result-${result.canonicalProductId}'),
          result: result,
          onTap: () => _openProduct(result),
          onFindNearest: () => _findNearest(result),
        ),
        if (result != results.last) const SizedBox(height: AppSpacing.sm),
      ],
    ];
  }

  List<Widget> _buildAvailabilityBody() {
    final results = _response?.results ?? const <ProductSearchResult>[];
    if (results.isEmpty) {
      return const [];
    }
    return [
      const SizedBox(height: AppSpacing.xl),
      AppSectionHeader(
        title: 'Nearby availability',
        subtitle: 'Optional location-aware store results',
      ),
      const SizedBox(height: AppSpacing.md),
      AppSectionCard(
        key: const Key('nearest-availability-controls'),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: AppSpacing.xs,
              runSpacing: AppSpacing.xs,
              children: [
                for (final mode in ['home', 'work', 'custom', 'manual'])
                  ChoiceChip(
                    key: Key('location-mode-$mode'),
                    label: Text(_locationLabel(mode)),
                    selected: _locationMode == mode,
                    onSelected: (_) {
                      setState(() {
                        _locationMode = mode;
                      });
                    },
                  ),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            OutlinedButton.icon(
              key: const Key('current-location-button'),
              onPressed: _currentLocationLoading ? null : _useCurrentLocation,
              icon: _currentLocationLoading
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.my_location),
              label: Text(
                _currentLocationLoading
                    ? 'Getting current location'
                    : 'Use current location',
              ),
            ),
            _CurrentLocationStatusView(
              result: _currentLocationResult,
              saving: _currentLocationSaving,
              saveMessage: _currentLocationSaveMessage,
              onSave: _saveCurrentLocation,
            ),
            if (_locationMode == 'manual') ...[
              const SizedBox(height: AppSpacing.md),
              TextField(
                key: const Key('manual-location-display-name-input'),
                controller: _manualDisplayNameController,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(
                  labelText: 'Display name',
                  hintText: 'Optional',
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              TextField(
                key: const Key('manual-location-address-input'),
                controller: _manualAddressController,
                textInputAction: TextInputAction.next,
                onChanged: (_) {
                  setState(() {
                    _manualAddressGeocodeResponse = null;
                    _confirmedManualAddressGeocode = null;
                    _manualAddressGeocodeMessage = null;
                  });
                },
                decoration: const InputDecoration(
                  labelText: 'Raw address',
                  hintText: 'Optional; tap Find coordinates to geocode',
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              OutlinedButton.icon(
                key: const Key('manual-address-geocode-button'),
                onPressed: _manualAddressGeocodeLoading
                    ? null
                    : _findManualAddressCoordinates,
                icon: _manualAddressGeocodeLoading
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.travel_explore),
                label: Text(
                  _manualAddressGeocodeLoading
                      ? 'Finding coordinates'
                      : 'Find coordinates',
                ),
              ),
              _ManualAddressGeocodeStatusView(
                response: _manualAddressGeocodeResponse,
                confirmedGeocode: _confirmedManualAddressGeocode,
                loading: _manualAddressGeocodeLoading,
                saving: _manualAddressGeocodeSaving,
                message: _manualAddressGeocodeMessage,
                onConfirm: _confirmManualAddressCoordinates,
                onSave: _saveConfirmedManualAddressLocation,
              ),
              const SizedBox(height: AppSpacing.sm),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      key: const Key('manual-latitude-input'),
                      controller: _latitudeController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: 'Latitude'),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: TextField(
                      key: const Key('manual-longitude-input'),
                      controller: _longitudeController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: 'Longitude'),
                    ),
                  ),
                ],
              ),
            ] else ...[
              const SizedBox(height: AppSpacing.md),
              _SavedLocationState(
                key: Key('saved-location-state-$_locationMode'),
                location: _selectedSavedLocation(),
                modeLabel: _locationLabel(_locationMode),
                hasAnySavedLocations:
                    (_savedLocations?.locations ?? const <SavedUserLocation>[])
                        .isNotEmpty,
              ),
            ],
            const SizedBox(height: AppSpacing.md),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<double>(
                    key: const Key('nearest-radius-selector'),
                    initialValue: _radiusKm,
                    decoration: const InputDecoration(labelText: 'Radius'),
                    items: const [
                      DropdownMenuItem(value: 1, child: Text('1 km')),
                      DropdownMenuItem(value: 3, child: Text('3 km')),
                      DropdownMenuItem(value: 5, child: Text('5 km')),
                      DropdownMenuItem(value: 10, child: Text('10 km')),
                      DropdownMenuItem(value: 25, child: Text('25 km')),
                      DropdownMenuItem(value: 50, child: Text('50 km')),
                    ],
                    onChanged: (value) {
                      if (value == null) return;
                      setState(() {
                        _radiusKm = value;
                      });
                    },
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    key: const Key('nearest-sort-dropdown'),
                    initialValue: _availabilitySort,
                    decoration: const InputDecoration(labelText: 'Sort'),
                    items: const [
                      DropdownMenuItem(
                          value: 'nearest', child: Text('Nearest')),
                      DropdownMenuItem(
                          value: 'cheapest', child: Text('Cheapest')),
                      DropdownMenuItem(
                          value: 'best_value', child: Text('Best value')),
                    ],
                    onChanged: (value) {
                      if (value == null) return;
                      setState(() {
                        _availabilitySort = value;
                      });
                    },
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
      const SizedBox(height: AppSpacing.md),
      if (_availabilityLoading)
        const SkeletonCard(
          key: Key('nearest-availability-loading'),
          height: 110,
        )
      else if (_availabilityError != null)
        ErrorStateCard(
          key: const Key('nearest-availability-error'),
          message: _availabilityError!,
          onRetry: () {
            final product = _availabilityProduct;
            if (product != null) {
              _findNearest(product);
            }
          },
        )
      else if (_availabilityValidationMessage != null)
        EmptyStateCard(
          key: const Key('nearest-availability-validation'),
          title: 'Check location',
          message: _availabilityValidationMessage!,
        )
      else if (_availability != null)
        _NearestAvailabilityResults(response: _availability!),
    ];
  }

  String _locationLabel(String mode) {
    if (mode == 'home') return 'Home';
    if (mode == 'work') return 'Work';
    if (mode == 'custom') return 'Custom';
    return 'Manual';
  }
}

class _ManualAddressGeocodeStatusView extends StatelessWidget {
  const _ManualAddressGeocodeStatusView({
    required this.response,
    required this.confirmedGeocode,
    required this.loading,
    required this.saving,
    required this.message,
    required this.onConfirm,
    required this.onSave,
  });

  final ManualAddressGeocodeResponse? response;
  final ManualAddressGeocode? confirmedGeocode;
  final bool loading;
  final bool saving;
  final String? message;
  final VoidCallback onConfirm;
  final ValueChanged<String> onSave;

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return Padding(
        padding: const EdgeInsets.only(top: AppSpacing.sm),
        child: Text(
          'Finding coordinates...',
          key: const Key('manual-address-geocode-loading'),
          style: Theme.of(context).textTheme.bodySmall,
        ),
      );
    }

    final confirmed = confirmedGeocode;
    if (confirmed != null && confirmed.hasCoordinates) {
      return Padding(
        padding: const EdgeInsets.only(top: AppSpacing.sm),
        child: Column(
          key: const Key('manual-address-geocode-confirmed'),
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              message ?? 'Coordinates applied.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            Text(
              '${confirmed.latitude!.toStringAsFixed(5)}, ${confirmed.longitude!.toStringAsFixed(5)}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: AppSpacing.sm),
            Wrap(
              spacing: AppSpacing.xs,
              runSpacing: AppSpacing.xs,
              children: [
                OutlinedButton(
                  key: const Key('save-geocoded-location-home'),
                  onPressed: saving ? null : () => onSave('home'),
                  child: const Text('Save as Home'),
                ),
                OutlinedButton(
                  key: const Key('save-geocoded-location-work'),
                  onPressed: saving ? null : () => onSave('work'),
                  child: const Text('Save as Work'),
                ),
                OutlinedButton(
                  key: const Key('save-geocoded-location-custom'),
                  onPressed: saving ? null : () => onSave('custom'),
                  child: const Text('Save as Custom'),
                ),
              ],
            ),
          ],
        ),
      );
    }

    final pending = response;
    if (pending == null) {
      final customMessage = message?.trim();
      if (customMessage == null || customMessage.isEmpty) {
        return const SizedBox.shrink();
      }
      return Padding(
        padding: const EdgeInsets.only(top: AppSpacing.sm),
        child: Text(
          customMessage,
          key: const Key('manual-address-geocode-invalid'),
          style: Theme.of(context).textTheme.bodySmall,
        ),
      );
    }

    if (pending.status == 'matched' &&
        pending.geocode?.hasCoordinates == true) {
      final geocode = pending.geocode!;
      final formatted = geocode.formattedAddress?.trim() ?? '';
      return Padding(
        padding: const EdgeInsets.only(top: AppSpacing.sm),
        child: Column(
          key: const Key('manual-address-geocode-matched'),
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              formatted.isEmpty ? 'Coordinates found.' : formatted,
              style: Theme.of(context).textTheme.bodySmall,
            ),
            Text(
              '${geocode.latitude!.toStringAsFixed(5)}, ${geocode.longitude!.toStringAsFixed(5)}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: AppSpacing.sm),
            FilledButton(
              key: const Key('manual-address-geocode-confirm'),
              onPressed: onConfirm,
              child: const Text('Use these coordinates'),
            ),
          ],
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.sm),
      child: Text(
        _messageForStatus(pending),
        key: Key(_keyForStatus(pending.status)),
        style: Theme.of(context).textTheme.bodySmall,
      ),
    );
  }

  String _messageForStatus(ManualAddressGeocodeResponse response) {
    if (response.status == 'ambiguous') {
      return 'Several possible matches were found. Enter coordinates manually or refine the address.';
    }
    if (response.status == 'failed') {
      return 'No coordinates were found for this address.';
    }
    if (response.status == 'skipped' || response.status == 'invalid_input') {
      return response.error ?? 'Enter a more complete address.';
    }
    return 'Address lookup did not return coordinates.';
  }

  String _keyForStatus(String status) {
    if (status == 'ambiguous') return 'manual-address-geocode-ambiguous';
    if (status == 'failed') return 'manual-address-geocode-failed';
    return 'manual-address-geocode-invalid';
  }
}

class _SavedLocationState extends StatelessWidget {
  const _SavedLocationState({
    super.key,
    required this.location,
    required this.modeLabel,
    required this.hasAnySavedLocations,
  });

  final SavedUserLocation? location;
  final String modeLabel;
  final bool hasAnySavedLocations;

  @override
  Widget build(BuildContext context) {
    if (location == null) {
      return Text(
        hasAnySavedLocations
            ? 'No saved $modeLabel location yet.'
            : 'No saved locations yet.',
        key: hasAnySavedLocations
            ? Key('missing-saved-location-$modeLabel')
            : const Key('no-saved-locations-state'),
        style: Theme.of(context).textTheme.bodySmall,
      );
    }

    final address = location!.addressRaw?.trim() ?? '';
    return Column(
      key: Key('saved-location-summary-${location!.locationId}'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          location!.displayName,
          style: Theme.of(context).textTheme.titleSmall,
        ),
        if (address.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xxs),
          Text(
            address,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ],
    );
  }
}

class _CurrentLocationStatusView extends StatelessWidget {
  const _CurrentLocationStatusView({
    required this.result,
    required this.saving,
    required this.saveMessage,
    required this.onSave,
  });

  final CurrentLocationResult? result;
  final bool saving;
  final String? saveMessage;
  final ValueChanged<String> onSave;

  @override
  Widget build(BuildContext context) {
    final current = result;
    if (current == null) {
      return const SizedBox.shrink();
    }

    final textTheme = Theme.of(context).textTheme;
    if (current.hasCoordinates) {
      return Padding(
        padding: const EdgeInsets.only(top: AppSpacing.sm),
        child: Column(
          key: const Key('current-location-acquired'),
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Current location acquired.',
              style: textTheme.bodySmall,
            ),
            Text(
              '${current.latitude!.toStringAsFixed(5)}, ${current.longitude!.toStringAsFixed(5)}',
              style: textTheme.bodySmall,
            ),
            const SizedBox(height: AppSpacing.sm),
            Wrap(
              spacing: AppSpacing.xs,
              runSpacing: AppSpacing.xs,
              children: [
                OutlinedButton(
                  key: const Key('save-current-location-home'),
                  onPressed: saving ? null : () => onSave('home'),
                  child: const Text('Save as Home'),
                ),
                OutlinedButton(
                  key: const Key('save-current-location-work'),
                  onPressed: saving ? null : () => onSave('work'),
                  child: const Text('Save as Work'),
                ),
                OutlinedButton(
                  key: const Key('save-current-location-custom'),
                  onPressed: saving ? null : () => onSave('custom'),
                  child: const Text('Save as Custom'),
                ),
              ],
            ),
            if (saveMessage != null) ...[
              const SizedBox(height: AppSpacing.xs),
              Text(
                saveMessage!,
                key: const Key('current-location-save-message'),
                style: textTheme.bodySmall,
              ),
            ],
          ],
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.sm),
      child: Text(
        _messageFor(current),
        key: Key(_keyFor(current.status)),
        style: textTheme.bodySmall,
      ),
    );
  }

  String _messageFor(CurrentLocationResult result) {
    final custom = result.message?.trim();
    if (custom != null && custom.isNotEmpty) {
      return custom;
    }
    switch (result.status) {
      case CurrentLocationStatus.permissionDenied:
        return 'Location permission was denied.';
      case CurrentLocationStatus.permissionPermanentlyDenied:
        return 'Location permission is permanently denied. Enable it in system settings.';
      case CurrentLocationStatus.locationUnavailable:
        return 'Current location is unavailable on this device.';
      case CurrentLocationStatus.error:
        return 'Current location is unavailable right now.';
      case CurrentLocationStatus.acquired:
        return 'Current location acquired.';
    }
  }

  String _keyFor(CurrentLocationStatus status) {
    switch (status) {
      case CurrentLocationStatus.permissionDenied:
        return 'current-location-permission-denied';
      case CurrentLocationStatus.permissionPermanentlyDenied:
        return 'current-location-permanently-denied';
      case CurrentLocationStatus.locationUnavailable:
        return 'current-location-unavailable';
      case CurrentLocationStatus.error:
        return 'current-location-error';
      case CurrentLocationStatus.acquired:
        return 'current-location-acquired';
    }
  }
}

class _ProductSearchResultCard extends StatelessWidget {
  const _ProductSearchResultCard({
    super.key,
    required this.result,
    required this.onTap,
    required this.onFindNearest,
  });

  final ProductSearchResult result;
  final VoidCallback onTap;
  final VoidCallback onFindNearest;

  @override
  Widget build(BuildContext context) {
    final enrichment = result.enrichment;
    final categoryPath = enrichment.categoryPath.join(' / ');
    final brand = enrichment.brand?.trim() ?? '';
    final baseProduct = enrichment.baseProduct?.trim() ?? '';
    final details = [
      if (brand.isNotEmpty) 'Brand: $brand',
      if (categoryPath.isNotEmpty) categoryPath,
      if (baseProduct.isNotEmpty) 'Base: $baseProduct',
    ];
    final dealLabel = _dealLabel(result.deal);
    final bestPrice = result.displayBestPrice;
    final price = bestPrice?.price;
    final unitPriceLabel = formatUnitPrice(
      context,
      price: bestPrice?.pricePerComparisonBasis,
      comparisonBasis: bestPrice?.comparisonBasis,
    );

    return AppSectionCard(
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        onTap: onTap,
        title: Text(result.displayName),
        titleTextStyle: Theme.of(context).textTheme.titleSmall,
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (details.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.xs),
              Text(
                details.join(' - '),
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
            if (dealLabel != null || price != null) ...[
              const SizedBox(height: AppSpacing.sm),
              Wrap(
                spacing: AppSpacing.xs,
                runSpacing: AppSpacing.xs,
                children: [
                  if (dealLabel != null)
                    MetricBadge(
                      label: dealLabel == 'Good deal'
                          ? 'Good'
                          : dealLabel == 'High price'
                              ? 'High'
                              : 'Deal',
                      value: dealLabel == 'Good deal'
                          ? 'deal'
                          : dealLabel == 'High price'
                              ? 'price'
                              : dealLabel,
                      icon: result.deal?.dealLevel == 'expensive'
                          ? Icons.trending_up
                          : Icons.trending_down,
                      color: result.deal?.dealLevel == 'expensive'
                          ? const Color(0xFFFFE1C2)
                          : const Color(0xFFCDEBDD),
                    ),
                  if (price != null)
                    MetricBadge(
                      label: 'Price',
                      value: formatPrice(context, price),
                      icon: Icons.sell_outlined,
                    ),
                  if (unitPriceLabel != null)
                    MetricBadge(
                      label: 'Unit',
                      value: unitPriceLabel,
                      icon: Icons.straighten,
                    ),
                ],
              ),
            ],
          ],
        ),
        trailing: Wrap(
          spacing: AppSpacing.xs,
          children: [
            IconButton(
              key: Key('nearest-button-${result.canonicalProductId}'),
              tooltip: 'Nearest stores',
              onPressed: onFindNearest,
              icon: const Icon(Icons.near_me),
            ),
            const Icon(Icons.chevron_right),
          ],
        ),
      ),
    );
  }

  String? _dealLabel(ProductDealInfo? deal) {
    final level = deal?.dealLevel.trim();
    if (level == null || level.isEmpty || level == 'normal') {
      return null;
    }
    if (level == 'good') {
      return 'Good deal';
    }
    if (level == 'expensive') {
      return 'High price';
    }
    return level;
  }
}

class _NearestAvailabilityResults extends StatelessWidget {
  const _NearestAvailabilityResults({
    required this.response,
  });

  final NearestAvailabilityResponse response;

  @override
  Widget build(BuildContext context) {
    if (response.status != 'matched') {
      return EmptyStateCard(
        key: const Key('nearest-availability-empty-state'),
        title: _statusTitle(response.status),
        message: _statusMessage(response.status),
      );
    }

    return Column(
      key: const Key('nearest-availability-results'),
      children: [
        for (final offer in response.offers) ...[
          AppSectionCard(
            child: ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(offer.storeNameRaw),
              subtitle: Text([
                '${offer.distanceKm.toStringAsFixed(1)} km',
                if ((offer.formattedAddress ?? '').trim().isNotEmpty)
                  offer.formattedAddress!,
              ].join(' - ')),
              trailing: Text(formatPrice(context, offer.effectivePrice)),
            ),
          ),
          if (offer != response.offers.last)
            const SizedBox(height: AppSpacing.sm),
        ],
      ],
    );
  }

  String _statusTitle(String status) {
    if (status == 'no_geocoded_locations') return 'No geocoded stores';
    if (status == 'no_nearby_stores') return 'No nearby stores';
    if (status == 'product_not_found') return 'Product not found';
    if (status == 'invalid_location') return 'Check location';
    return 'No nearby results';
  }

  String _statusMessage(String status) {
    if (status == 'no_geocoded_locations') {
      return 'This product has no matched store coordinates yet.';
    }
    if (status == 'no_nearby_stores') {
      return 'No matched store coordinates are inside this radius.';
    }
    if (status == 'product_not_found') {
      return 'No product matched this availability request.';
    }
    if (status == 'invalid_location') {
      return 'Choose a saved location or enter valid coordinates.';
    }
    return 'Try another location or radius.';
  }
}
