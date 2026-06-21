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

const productionServerConfig = !devServerUrl && !allowCleartext
  ? {
      // Serve bundled production assets from the same trusted origin used by
      // the public web app so authenticated API/CMS requests follow the live
      // CORS policy instead of the default https://localhost WebView origin.
      hostname: 'scrolith.com',
      androidScheme: 'https'
    }
  : undefined;

const config: CapacitorConfig = {
  // Keep in sync with `mobile/android/app/build.gradle` applicationId/namespace.
  // This also aligns with the existing Firebase Android app entry you created.
  appId: 'com.scrolith.scrolith',
  appName: 'Scrolith',
  // The web app lives in ../geezle and outputs build artifacts to ../geezle/dist
  webDir: '../geezle/dist',
  bundledWebRuntime: false,
  ...(serverConfig ? { server: serverConfig } : productionServerConfig ? { server: productionServerConfig } : {}),
  ios: {
    contentInset: 'always'
  },
  android: {
    allowMixedContent: allowCleartext
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['sound', 'alert']
    }
  }
};

export default config;

