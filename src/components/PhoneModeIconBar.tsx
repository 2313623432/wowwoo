import { theme } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useSegments } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

const TABS: { name: string; route: string; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { name: "chat", route: "/(tabs)/chat", icon: "chatbubble", label: "聊天" },
  { name: "moments", route: "/(tabs)/moments", icon: "compass", label: "朋友圈" },
  { name: "entertainment", route: "/(tabs)/entertainment", icon: "game-controller", label: "娱乐" },
  { name: "profile", route: "/(tabs)/profile", icon: "person", label: "我的" },
];

const ICON_SIZE = 28;

export function PhoneModeIconBar() {
  const router = useRouter();
  const segments = useSegments();
  const current = segments.find((s) => typeof s === "string" && TABS.some((t) => t.name === s)) as string | undefined ?? "chat";

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        {TABS.map((tab) => {
          const active = current === tab.name;
          return (
            <TouchableOpacity
              key={tab.name}
              style={[styles.iconBox, active && styles.iconBoxActive]}
              activeOpacity={0.7}
              onPress={() => router.replace(tab.route as any)}
            >
              <View style={[styles.iconCircle, active && styles.iconCircleActive]}>
                <Ionicons
                  name={active ? tab.icon : `${tab.icon}-outline` as any}
                  size={ICON_SIZE}
                  color={active ? theme.pink : theme.textSecondary}
                />
              </View>
              <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingBottom: 16,
    paddingTop: 8,
    backgroundColor: "rgba(255,255,255,0.75)",
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  iconBox: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 72,
  },
  iconBoxActive: {},
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  iconCircleActive: {
    backgroundColor: theme.pinkBgTag,
    borderColor: theme.pinkLight,
  },
  label: {
    fontSize: 11,
    color: theme.textSecondary,
    marginTop: 4,
  },
  labelActive: {
    color: theme.navTitlePink,
    fontWeight: "600",
  },
});
