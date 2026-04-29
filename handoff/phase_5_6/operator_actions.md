# Operator Actions

## Purpose
This localization repair is code-complete. No mandatory operator actions remain for local generation, testing, or analysis.

## Ordered Steps
1. Optional: if another tool or zip extractor re-applies the Windows read-only directory attribute to `app/mobile/lib/l10n`, clear it before rerunning localization generation.
2. Optional: when ARB copy changes, rerun `flutter gen-l10n` from `app/mobile/`.
