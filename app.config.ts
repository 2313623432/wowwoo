import { ExpoConfig } from "expo/config";

const buildPlatform = process.env.EAS_BUILD_PLATFORM || process.env.EXPO_PLATFORM; // 'ios' | 'android' | 'web' | undefined
const isNativeBuild = buildPlatform === "ios" || buildPlatform === "android";
const isWebBuild = buildPlatform === "web";
const jpushAppKey = process.env.JPUSH_APP_KEY;

if (isNativeBuild && !jpushAppKey) {
  throw new Error("[app.config] 缺少环境变量 JPUSH_APP_KEY：iOS/Android 构建需要该值。");
}

const enableJPush = !!jpushAppKey && !isWebBuild;

const config: ExpoConfig = {
  name: "wowwoo",
  slug: "wowwoo",
  version: "1.3.1",
  orientation: "portrait",
  icon: "./assets/logo1.png",
  scheme: "wowwoo",
  userInterfaceStyle: "automatic",
  ios: {
    icon: "./assets/logo1.png",
    bundleIdentifier: "com.cheeliu.wowwoo",
    googleServicesFile: "./GoogleService-Info.plist",
  },
  android: {
    softwareKeyboardLayoutMode: "resize",
    // useCleartextTraffic: true,
    adaptiveIcon: {
      backgroundColor: "#FFD6EA",
      foregroundImage: "./assets/logo1.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    package: "com.cheeliu.wowwoo",
    googleServicesFile: "./google-services.json",
  },
  web: {
    output: "static",
    favicon: "./assets/logo1.png",
  },
  plugins: [
    [
      "@sentry/react-native/expo",
      {
        url: "https://sentry.zycx.info/",
        project: "wowwoo",
        organization: "sentry",
      },
    ],
    "@react-native-firebase/app",
    "expo-router",
    "expo-dev-client",
    [
      "expo-image-picker",
      {
        colors: {
          cropToolbarColor: "#1a1a1a",
          cropToolbarIconColor: "#ffffff",
          cropToolbarActionTextColor: "#ffffff",
          cropBackButtonIconColor: "#ffffff",
        },
        dark: {
          colors: {
            cropToolbarColor: "#1a1a1a",
            cropToolbarIconColor: "#ffffff",
            cropToolbarActionTextColor: "#ffffff",
            cropBackButtonIconColor: "#ffffff",
          },
        },
      },
    ],
    enableJPush && [
      "mx-jpush-expo",
      {
        appKey: jpushAppKey || "",
        channel: "developer-default",
        packageName: "com.cheeliu.wowwoo",
      },
    ],
  ].filter(Boolean) as ExpoConfig["plugins"],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
    basePath: '/wowwoo/',
  },
  extra: {
    router: {},
    eas: {
      projectId: "de2ded21-44a4-493e-a25a-789bf6ac47d1",
    },
  },
};

export default config;
