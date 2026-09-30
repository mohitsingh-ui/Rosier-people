import type { CapacitorConfig } from "@capacitor/cli";

// Rosier People for Android.
// The app is a native shell around your deployed Rosier People server — every
// permission check still happens on the server, exactly as on the web.
//
// ROSIER_APP_URL is read when you run `npx cap sync` (the build workflow sets it):
//   production:        https://people.rosierfoods.com
//   Android emulator:  http://10.0.2.2:3000   (your laptop's `npm run dev`)
const appUrl = (process.env.ROSIER_APP_URL ?? "https://people.rosierfoods.com").replace(/\/+$/, "");
const host = new URL(appUrl).host;
const cleartext = appUrl.startsWith("http://");

const config: CapacitorConfig = {
  appId: process.env.ROSIER_APP_ID ?? "com.rosierfoods.people",
  appName: "Rosier People",
  webDir: "mobile/www",
  backgroundColor: "#F7F4ED",
  server: {
    url: appUrl,
    cleartext,
    androidScheme: "https",
    // Shown instead of Chrome's error page when the server can't be reached
    errorPath: "offline.html",
    allowNavigation: [host],
  },
  android: {
    // Lets the web app know it's running inside the Android app (see src/lib/native.ts)
    appendUserAgent: "RosierPeopleApp/Android",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: cleartext,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#F7F4ED",
      showSpinner: false,
      androidScaleType: "CENTER_INSIDE",
    },
    SystemBars: {
      insetsHandling: "native",
      style: "LIGHT",
    },
  },
};

export default config;
