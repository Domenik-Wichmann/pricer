# Operator Actions

No immediate operator action is required for local/test use.

Before production use:

1. Replace temporary owner headers with verified Firebase Auth token claims.
2. Define the anonymous-list claiming flow for signed-in users.
3. Add production authorization checks and Firestore rules aligned to the final user model.
