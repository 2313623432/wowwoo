import { Stack } from "expo-router";
import { theme } from "@/constants/theme";

export default function ChatLayout() {
  return (
    <Stack
      screenOptions={{
        headerBackTitle: "返回",
        headerStyle: {
          backgroundColor: "#fff5fa",
          borderBottomWidth: 1,
          borderBottomColor: theme.borderNav,
        },
        headerTitleStyle: { fontSize: 18, fontWeight: "700", color: "#a53f68" },
        headerTintColor: theme.navTitle,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="[id]"
        options={{
          title: "聊天",
        }}
      />
    </Stack>
  );
}
