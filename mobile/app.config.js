// Dynamic Expo config: extends app.json with values from mobile/.env (or EAS
// environment variables) so native Google Maps keys never live in git.
module.exports = ({ config }) => {
  const androidKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  const iosKey = process.env.GOOGLE_MAPS_IOS_API_KEY;

  return {
    ...config,
    ios: {
      ...config.ios,
      ...(iosKey && { config: { ...config.ios?.config, googleMapsApiKey: iosKey } }),
    },
    android: {
      ...config.android,
      ...(androidKey && {
        config: { ...config.android?.config, googleMaps: { apiKey: androidKey } },
      }),
    },
  };
};
