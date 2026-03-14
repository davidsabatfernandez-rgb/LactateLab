import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.peakaerobic.app',
  appName: 'PeakAerobic',
  webDir: 'dist',
  server: {
    // En desarrollo, apuntar al servidor Vite para hot-reload
    // url: 'http://192.168.1.X:5173',
    // cleartext: true,
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#0C0C14',
      showSpinner: false,
      androidSplashResourceName: 'splash',
      splashFullScreen: false,
      splashImmersive: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0C0C14',
    },
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
  },
};

export default config;
