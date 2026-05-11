import { Stack } from "expo-router";
import { theme } from "@/constants/theme";

export default function EntertainmentLayout() {
  return (
    <Stack
      screenOptions={{
        headerBackTitle: "返回",
        headerStyle: {
          backgroundColor: theme.navBarBg,
          borderBottomWidth: 1,
          borderBottomColor: theme.borderNav,
        },
        headerTitleStyle: {
          fontSize: 18,
          fontWeight: "700",
          color: theme.navTitle,
        },
        headerTintColor: theme.navTitle,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="social-hall" options={{ title: "社交大厅" }} />
      <Stack.Screen name="actor/[id]" options={{ title: "角色详情" }} />
    </Stack>
  );
}

