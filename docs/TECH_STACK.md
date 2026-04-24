# Tech Stack

## Core stack
- Flutter mobile app
- Firebase Anonymous Auth
- Firestore
- Firebase Cloud Functions (TypeScript)
- Firebase Cloud Messaging
- AdMob
- One LLM provider for selective AI escalation

## Optional extras
- PostHog or Plausible for richer analytics
- `speech_to_text` for Bulgarian voice input
- `fl_chart` for price-history sparklines

## Selection rules
- Avoid provider sprawl early.
- Prefer deterministic matching at runtime.
- Use the LLM only for low-confidence disambiguation or watchlist creation.
