import { theme } from "@/constants/theme";
import { PreviewableImage } from "@/components/PreviewableImage";
import { useAuth } from "@/contexts/AuthContext";
import {
  addActorToChat,
  fetchSocialHallActorDetail,
  type SocialHallActorDetail,
} from "@/services/entertainment";
import { Alert } from "@/utils/alert";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export default function ActorDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SocialHallActorDetail | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    // 若未登录则只展示本地 mock（fetchSocialHallActorDetail 内会兜底）
    setLoading(true);
    setError(null);
    try {
      const d = user?.token
        ? await fetchSocialHallActorDetail(user.token, String(id))
        : await fetchSocialHallActorDetail("" as any, String(id));
      setDetail(d);
      if (!d) setError("未找到该角色");
    } catch (e: any) {
      setError(e?.message || "加载失败，请稍后重试");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id, user?.token]);

  useEffect(() => {
    load();
  }, [load]);

  const genderIcon = useMemo(() => {
    if (!detail) return "help";
    return detail.gender === "男"
      ? "male"
      : detail.gender === "女"
        ? "female"
        : "help";
  }, [detail]);

  const showAddToChat = useMemo(() => {
    if (!detail) return false;
    // 后端返回 isFriend=true 表示已是好友，此时不展示“添加到聊天”
    return !detail.isFriend;
  }, [detail]);

  const handleAddToChat = useCallback(async () => {
    if (!detail) return;
    if (!user?.token) {
      Alert.alert("需要登录", "登录后才能添加到聊天");
      return;
    }
    setSubmitting(true);
    try {
      const result = await addActorToChat(user.token, detail.id);
      router.replace({
        pathname: "/(tabs)/chat/[id]",
        params: {
          id: String(result.chatId),
          name: result.name || detail.name,
          avatar: result.avatar || detail.avatar,
        },
      });
    } catch (e: any) {
      Alert.alert("添加失败", e?.message || "创建会话失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }, [detail, router, user?.token]);

  return (
    <View style={[styles.page, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      {error ? (
        <View style={styles.stateWrap}>
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            activeOpacity={0.85}
            onPress={load}
          >
            <Text style={styles.retryText}>重试</Text>
          </TouchableOpacity>
        </View>
      ) : loading || !detail ? (
        <View style={styles.stateWrap}>
          <Text style={styles.stateText}>加载中...</Text>
        </View>
      ) : (
        <>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            <View style={styles.hero}>
              <View style={styles.avatarLarge}>
                {detail.avatar ? (
                  <PreviewableImage
                    source={{ uri: detail.avatar }}
                    style={styles.avatarImage}
                    accessibilityLabel="角色头像"
                  />
                ) : (
                  <Ionicons name="person" size={42} color={theme.pink} />
                )}
              </View>
              <Text style={styles.name}>{detail.name}</Text>
              <View style={styles.genderLine}>
                <Ionicons
                  name={genderIcon as any}
                  size={14}
                  color={theme.textMuted}
                />
                <Text style={styles.genderText}>{detail.gender}</Text>
              </View>
            </View>

            <View style={styles.block}>
              <Text style={styles.blockTitle}>基本设置</Text>
              <InfoRow label="昵称" value={detail.name} />
              <View style={styles.divider} />
              <InfoRow label="性别" value={detail.gender} />
            </View>

            <View style={styles.block}>
              <Text style={styles.blockTitle}>角色设定</Text>
              <Text style={styles.profileText}>{detail.profileText}</Text>
            </View>
          </ScrollView>

          {showAddToChat && (
            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.primaryBtn, submitting && { opacity: 0.65 }]}
                activeOpacity={0.85}
                onPress={handleAddToChat}
                disabled={submitting}
              >
                <Text style={styles.primaryBtnText}>
                  {submitting ? "添加中..." : "添加到聊天"}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: theme.pageBg,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 16,
  },
  hero: {
    alignItems: "center",
    marginBottom: 14,
  },
  avatarLarge: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: theme.pinkLighter,
    borderWidth: 1,
    borderColor: "rgba(255,127,181,0.22)",
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadowLight,
  },
  avatarImage: {
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  name: {
    marginTop: 12,
    fontSize: 24,
    fontWeight: "900",
    color: theme.textPrimary,
  },
  genderLine: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  genderText: {
    fontSize: 13,
    color: theme.textMuted,
    fontWeight: "700",
  },
  block: {
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
    ...theme.bubbleShadow,
  },
  blockTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: theme.navTitlePink,
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
  },
  rowLabel: {
    fontSize: 14,
    color: theme.textSecondary,
    fontWeight: "700",
  },
  rowValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 14,
    color: theme.textPrimary,
    fontWeight: "800",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,127,181,0.16)",
  },
  profileText: {
    fontSize: 13,
    lineHeight: 20,
    color: theme.textSecondary,
    fontWeight: "600",
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  primaryBtn: {
    height: 54,
    borderRadius: 18,
    backgroundColor: theme.btnPrimaryBg,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadowLight,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  stateWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  stateText: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  retryBtn: {
    marginTop: 12,
    backgroundColor: theme.btnPrimaryBg,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  retryText: {
    color: "#fff",
    fontWeight: "700",
  },
});

