import 'package:flutter/material.dart';

import 'app.dart';
import 'core/services/app_dependencies.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const PricerBootstrapApp());
}

typedef AppDependenciesBootstrapper = Future<AppDependencies> Function();

class PricerBootstrapApp extends StatefulWidget {
  const PricerBootstrapApp({
    super.key,
    this.bootstrapper,
    this.initialDependencies,
  });

  final AppDependenciesBootstrapper? bootstrapper;
  final AppDependencies? initialDependencies;

  @override
  State<PricerBootstrapApp> createState() => _PricerBootstrapAppState();
}

class _PricerBootstrapAppState extends State<PricerBootstrapApp> {
  late AppDependencies _dependencies;

  @override
  void initState() {
    super.initState();
    _dependencies =
        widget.initialDependencies ?? AppDependencies.startupFallback();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _bootstrapAfterFirstFrame();
    });
  }

  Future<void> _bootstrapAfterFirstFrame() async {
    final bootstrapper = widget.bootstrapper ?? AppDependencies.bootstrap;
    try {
      final dependencies = await bootstrapper();
      if (!mounted) {
        return;
      }
      setState(() {
        _dependencies = dependencies;
      });
    } catch (error) {
      debugPrint('App bootstrap fallback active: $error');
      if (!mounted) {
        return;
      }
      setState(() {
        _dependencies = AppDependencies.startupFallback(
          firestoreStatus:
              'App bootstrap failed. Lists and watchlists are running in memory.',
        );
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return PricerApp(dependencies: _dependencies);
  }
}
