import { AuthProvider } from "@/contexts/AuthContext";
import { PhoneModeProvider } from "@/contexts/PhoneModeContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { Stack } from "expo-router";
import { Platform } from "react-native";
import * as Sentry from "@sentry/react-native";
import { initJPush } from "@/utils/jpush";
import { useEffect } from "react";

Sentry.init({
  dsn: "https://15eacdcd8b6dbd46cbb9d3d37913f826@sentry.zycx.info/2",

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});
function RootLayout() {
  useEffect(() => {
    initJPush();
  }, []);

  const content = (
    <AuthProvider>
      <PhoneModeProvider>
        <ToastProvider>
          <Stack>
            <Stack.Screen
              name="index"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="(auth)"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="(tabs)"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="(admin)"
              options={{
                headerShown: true,
              }}
            />
          </Stack>
        </ToastProvider>
      </PhoneModeProvider>
    </AuthProvider>
  );

  if (Platform.OS === "web") {
    return content;
  }

  // GestureHandlerRootView is only needed on native; on web it intercepts
  // mouse/pointer events and breaks TouchableOpacity.
  const { GestureHandlerRootView } = require("react-native-gesture-handler");
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {content}
    </GestureHandlerRootView>
  );
}
export default Sentry.wrap(RootLayout);
