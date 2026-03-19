import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.peakaerobic.app',
  appName: 'PeakAerobic',
  webDir: 'dist',
  server: {
    // Live reload — descomentar para desarrollo con Xcode
    url: 'http://192.168.1.42:5173',
    cleartext: true,
    androidScheme: 'https',
    iosScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#FFFFFF',
      showSpinner: false,
      androidSplashResourceName: 'splash',
      splashFullScreen: false,
      splashImmersive: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#FFFFFF',
    },
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
  },
};

export default config;
