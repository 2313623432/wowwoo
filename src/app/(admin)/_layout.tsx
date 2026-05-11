import { useAuth } from "@/contexts/AuthContext";
import { Redirect, Stack } from "expo-router";

const ADMIN_PHONE = "11111111111";

export default function AdminLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;
  if (!user || user.phone !== ADMIN_PHONE) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen
        name="chat-console"
        options={{ title: "聊天控制台", headerBackTitle: "返回" }}
      />
    </Stack>
  );
}
