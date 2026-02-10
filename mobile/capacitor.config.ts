import type { CapacitorConfig } from '@capacitor/cli';

const devServerUrl = process.env.CAP_SERVER_URL;
const allowCleartext = Boolean(
  devServerUrl || process.env.CAP_ALLOW_CLEARTEXT === 'true'
);

const serverConfig = devServerUrl
  ? {
      // Example (device): http://192.168.1.168:3000
      // Example (emulator): http://10.0.2.2:3000
      url: devServerUrl,
      cleartext: true,
      androidScheme: 'http'
    }
  : allowCleartext
    ? {
        // Allow http API calls to your local backend during development builds.
        // For production, serve your API over https and remove cleartext.
        cleartext: true,
        androidScheme: 'http'
      }
    : undefined;

const config: CapacitorConfig = {
  appId: 'com.scrolith.app',
  appName: 'Scrolith',
  webDir: '../scrolith/dist',
  bundledWebRuntime: false,
  ...(serverConfig ? { server: serverConfig } : {}),
  ios: {
    contentInset: 'always'
  },
  android: {
    allowMixedContent: allowCleartext
  }
};

export default config;

