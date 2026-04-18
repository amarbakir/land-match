import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'LandMatch',
  slug: 'landmatch',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'landmatch',
  userInterfaceStyle: 'dark',
  web: {
    output: 'static' as const,
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-font',
    'expo-router',
  ],
  experiments: {
    typedRoutes: true,
  },
});
