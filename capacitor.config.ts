import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.remionotes.android",
  appName: "remio-notes",
  webDir: "dist",
  server: { androidScheme: "https" },
  android: { backgroundColor: "#f5f5f3", allowMixedContent: false },
  plugins: {
    SplashScreen: { launchAutoHide: true, backgroundColor: "#f5f5f3" },
    LocalNotifications: {
      smallIcon: "ic_remio_notification",
      iconColor: "#526849",
    },
  },
};
export default config;
