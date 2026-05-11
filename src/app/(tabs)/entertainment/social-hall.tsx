import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { PreviewableImage } from "@/components/PreviewableImage";
import {
  fetchSocialHallActors,
  fetchSocialHallTags,
  type SocialHallActorSummary,
  type SocialHallTag,
} from "@/services/entertainment";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function TagPill({
  label,
  active,
  onPress,
}: {
  label: SocialHallTag;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.tag, active && styles.tagActive]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <Text style={[styles.tagText, active && styles.tagTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function ActorCard({
  item,
  onPress,
}: {
  item: SocialHallActorSummary;
  onPress: () => void;
}) {
  const genderIcon =
    item.gender === "男"
      ? "male"
      : item.gender === "女"
        ? "female"
        : "help";
  const genderColor =
    item.gender === "男"
      ? "#5aa8ff"
      : item.gender === "女"
        ? theme.pink
        : theme.textMuted;

  return (
    <TouchableOpacity
      style={styles.actorCard}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <View style={styles.actorTop}>
        <View style={styles.avatarCircle}>
          {item.avatar ? (
            <PreviewableImage
              source={{ uri: item.avatar }}
              style={styles.actorAvatarImage}
              accessibilityLabel="角色头像"
            />
          ) : (
            <Ionicons name="person" size={28} color={theme.pink} />
          )}
        </View>
        <View style={styles.actorInfo}>
          <View style={styles.actorNameRow}>
            <Text style={styles.actorName} numberOfLines={1}>
              {item.name}
            </Text>
            <Ionicons name={genderIcon as any} size={14} color={genderColor} />
          </View>
          <Text style={styles.actorBio} numberOfLines={2}>
            {item.bio}
          </Text>
        </View>
      </View>
      <View style={styles.tagRow}>
        {item.tags.slice(0, 3).map((t) => (
          <View key={t} style={styles.actorTag}>
            <Text style={styles.actorTagText}>#{t}</Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );
}

export default function SocialHallScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [tags, setTags] = useState<SocialHallTag[]>([]);
  const [activeTag, setActiveTag] = useState<SocialHallTag>("热门");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SocialHallActorSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadTags = useCallback(async () => {
    if (!user?.token) return;
    try {
      const list = await fetchSocialHallTags(user.token);
      setTags(list);
    } catch {
      setTags(["热门", "年下", "年上", "冷脸猛猛", "校草", "学霸", "胃痛"]);
    }
  }, [user?.token]);

  const loadActors = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    setError(null);
    try {
      const list = await fetchSocialHallActors(user.token, {
        tag: activeTag,
        keyword,
      });
      setData(list);
    } catch (e: any) {
      setError(e?.message || "加载失败，请稍后重试");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [activeTag, keyword, user?.token]);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  useEffect(() => {
    loadActors();
  }, [loadActors]);

  const headerTop = useMemo(
    () => ({
      paddingTop: insets.top,
    }),
    [insets.top],
  );

  return (
    <View style={styles.page}>
      <View style={[styles.topBar, headerTop]}>
        <View style={styles.searchWrap}>
          <Ionicons
            name="search"
            size={18}
            color={theme.textMuted}
            style={{ marginLeft: 12 }}
          />
          <TextInput
            value={keyword}
            onChangeText={setKeyword}
            placeholder="搜索人物名称或简介..."
            placeholderTextColor={theme.pinkPlaceholder}
            style={styles.searchInput}
            returnKeyType="search"
            onSubmitEditing={loadActors}
          />
          {keyword.trim() !== "" && (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() => setKeyword("")}
              activeOpacity={0.7}
            >
              <Ionicons name="close-circle" size={18} color={theme.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.tagsBar}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={tags.length ? tags : (["热门"] as SocialHallTag[])}
          keyExtractor={(t) => t}
          contentContainerStyle={styles.tagsList}
          renderItem={({ item }) => (
            <TagPill
              label={item}
              active={item === activeTag}
              onPress={() => setActiveTag(item)}
            />
          )}
        />
      </View>

      {error ? (
        <View style={styles.stateWrap}>
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            activeOpacity={0.85}
            onPress={loadActors}
          >
            <Text style={styles.retryText}>重试</Text>
          </TouchableOpacity>
        </View>
      ) : loading ? (
        <View style={styles.stateWrap}>
          <Text style={styles.stateText}>加载中...</Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(it) => it.id}
          contentContainerStyle={[
            styles.list,
            data.length === 0 && styles.emptyList,
          ]}
          renderItem={({ item }) => (
            <ActorCard
              item={item}
              onPress={() =>
                router.push({
                  pathname: "/(tabs)/entertainment/actor/[id]",
                  params: { id: item.id },
                })
              }
            />
          )}
          ListEmptyComponent={
            <View style={styles.stateWrap}>
              <Text style={styles.stateText}>没有找到匹配的人物</Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: theme.pageBg,
  },
  topBar: {
    backgroundColor: theme.navBarBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderNav,
    paddingHorizontal: 14,
    paddingBottom: 12,
    paddingTop: 12,
  },
  searchWrap: {
    height: 40,
    backgroundColor: theme.pinkBg,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    flexDirection: "row",
    alignItems: "center",
  },
  searchInput: {
    flex: 1,
    height: 40,
    paddingHorizontal: 10,
    color: theme.textPrimary,
    fontSize: 14,
  },
  clearBtn: {
    paddingHorizontal: 12,
    height: 40,
    justifyContent: "center",
  },
  tagsBar: {
    paddingTop: 10,
    paddingBottom: 6,
  },
  tagsList: {
    paddingHorizontal: 14,
    gap: 10,
  },
  tag: {
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.75)",
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  tagActive: {
    backgroundColor: theme.btnPrimaryBg,
    borderColor: theme.btnPrimaryBg,
  },
  tagText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.navTitlePink,
  },
  tagTextActive: {
    color: "#fff",
  },
  list: {
    paddingHorizontal: 14,
    paddingBottom: 16,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: "center",
  },
  actorCard: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
    ...theme.bubbleShadow,
  },
  actorTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: theme.pinkLighter,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,127,181,0.22)",
  },
  actorAvatarImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  actorInfo: {
    flex: 1,
    minWidth: 0,
  },
  actorNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actorName: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.textPrimary,
    maxWidth: "80%",
  },
  actorBio: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: theme.textSecondary,
  },
  tagRow: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actorTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.pinkBgTag,
    borderWidth: 1,
    borderColor: "rgba(255,127,181,0.16)",
  },
  actorTagText: {
    fontSize: 12,
    color: theme.navTitlePink,
    fontWeight: "700",
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

