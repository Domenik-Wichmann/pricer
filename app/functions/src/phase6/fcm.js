function isFcmConfigured(env = process.env) {
  return Boolean(env.FIREBASE_PROJECT_ID && (env.FCM_ACCESS_TOKEN || env.GOOGLE_APPLICATION_CREDENTIALS));
}

function createFcmNotifier({
  projectId = process.env.FIREBASE_PROJECT_ID,
  accessToken = process.env.FCM_ACCESS_TOKEN,
  accessTokenProvider = null,
  fetchImpl = fetch,
}) {
  return {
    async send({
      token,
      title,
      body,
      data = {},
    }) {
      const bearer = accessTokenProvider ? await accessTokenProvider() : accessToken;
      if (!projectId || !bearer) {
        throw new Error('FCM notifier is not configured');
      }

      const response = await fetchImpl(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${bearer}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token,
              notification: {
                title,
                body,
              },
              data,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`FCM send failed with status ${response.status}`);
      }

      return response.json();
    },
  };
}

module.exports = {
  createFcmNotifier,
  isFcmConfigured,
};
