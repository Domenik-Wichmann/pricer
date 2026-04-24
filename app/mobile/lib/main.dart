import 'package:flutter/material.dart';

import 'app.dart';
import 'core/services/app_dependencies.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final dependencies = await AppDependencies.bootstrap();
  runApp(PricerApp(dependencies: dependencies));
}
