import { ComingSoonModal } from "@/components/ComingSoonModal";
import { theme } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type FeatureKey = "socialHall" | "aiDiary" | "funMatch" | "topicPlaza";

type Feature = {
  key: FeatureKey;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  badge?: string;
};

function FeatureCard({
  title,
  icon,
  onPress,
  style,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  style?: ViewStyle;
}) {
  return (
    <TouchableOpacity
      style={[styles.card, style]}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <View style={styles.cardIcon}>
        <Ionicons name={icon} size={26} color={theme.navTitlePink} />
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
    </TouchableOpacity>
  );
}

export default function EntertainmentHomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [comingSoonVisible, setComingSoonVisible] = useState(false);

  const features: Feature[] = useMemo(
    () => [
      {
        key: "socialHall",
        title: "社交大厅",
        icon: "sparkles",
        onPress: () => router.push("/(tabs)/entertainment/social-hall"),
      },
      {
        key: "aiDiary",
        title: "AI日记",
        icon: "create-outline",
        onPress: () => setComingSoonVisible(true),
      },
      {
        key: "funMatch",
        title: "趣味匹配",
        icon: "game-controller-outline",
        onPress: () => setComingSoonVisible(true),
      },
      {
        key: "topicPlaza",
        title: "话题广场",
        icon: "chatbubble-ellipses-outline",
        onPress: () => setComingSoonVisible(true),
      },
    ],
    [router],
  );

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft} />
        <View style={styles.headerCenter}>
          <Image
            source={require("../../../../assets/logo.png")}
            style={styles.headerLogo}
            resizeMode="contain"
          />
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            activeOpacity={0.75}
            onPress={() => setComingSoonVisible(true)}
          >
            <Ionicons name="search" size={22} color={theme.navTitlePink} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerAddBtn}
            activeOpacity={0.85}
            onPress={() => setComingSoonVisible(true)}
          >
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>娱乐中心</Text>
        <View style={styles.grid}>
          <FeatureCard
            title={features[0].title}
            icon={features[0].icon}
            onPress={features[0].onPress}
          />
          <FeatureCard
            title={features[1].title}
            icon={features[1].icon}
            onPress={features[1].onPress}
          />
          <FeatureCard
            title={features[2].title}
            icon={features[2].icon}
            onPress={features[2].onPress}
          />
          <FeatureCard
            title={features[3].title}
            icon={features[3].icon}
            onPress={features[3].onPress}
          />
        </View>
      </View>

      <ComingSoonModal
        visible={comingSoonVisible}
        onClose={() => setComingSoonVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: theme.pageBg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.navBarBg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderNav,
  },
  headerLeft: {
    width: 76,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerLogo: {
    height: 37,
    width: 180,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerIconBtn: {
    padding: 4,
  },
  headerAddBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.btnPrimaryBg,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.navTitlePink,
    marginBottom: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  card: {
    width: "48%",
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadowLight,
  },
  cardIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: theme.pinkBgTag,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,127,181,0.18)",
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.navTitlePink,
  },
});
