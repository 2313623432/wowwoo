import { ComingSoonModal } from "@/components/ComingSoonModal";
import { CreateModal } from "@/components/CreateModal";
import {
  CustomizeAIData,
  CustomizeAIModal,
} from "@/components/CustomizeAIModal";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import {
  ChatSummary,
  createChatSession,
  deleteChatSession,
  fetchChatList,
} from "@/services/chat";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/utils/alert";
import {
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

function ChatRow({
  item,
  onDelete,
}: {
  item: ChatSummary;
  onDelete: (id: string) => void;
}) {
  const router = useRouter();

  return (
    <Swipeable
      overshootRight={false}
      overshootLeft={false}
      rightThreshold={48}
      leftThreshold={48}
      renderLeftActions={() => (
        <TouchableOpacity
          style={[styles.deleteAction, styles.deleteActionLeft]}
          activeOpacity={0.8}
          onPress={() => onDelete(item.id)}
        >
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <Text style={styles.deleteActionText}>删除</Text>
        </TouchableOpacity>
      )}
      renderRightActions={() => (
        <TouchableOpacity
          style={styles.deleteAction}
          activeOpacity={0.8}
          onPress={() => onDelete(item.id)}
        >
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <Text style={styles.deleteActionText}>删除</Text>
        </TouchableOpacity>
      )}
    >
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.7}
        onPress={() =>
          router.push({
            pathname: `/(tabs)/chat/[id]`,
            params: { id: item.id, name: item.name, avatar: item.avatar },
          })
        }
      >
        <Image source={{ uri: item.avatar }} style={styles.avatar} />
        <View style={styles.content}>
          <View style={styles.rowTop}>
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.time}>{item.time}</Text>
          </View>
          <View style={styles.rowBottom}>
            <Text style={styles.preview} numberOfLines={1}>
              {item.lastMessage}
            </Text>
            {item.unread != null && item.unread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {item.unread > 99 ? "99+" : item.unread}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
}

export default function ChatListScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [data, setData] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [comingSoonVisible, setComingSoonVisible] = useState(false);
  const [customizeAIModalVisible, setCustomizeAIModalVisible] = useState(false);
  const [creating, setCreating] = useState(false);
  const [welcomeModalVisible, setWelcomeModalVisible] = useState(false);

  const router = useRouter();

  const loadListWithState = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    setError(null);
    try {
      const list = await fetchChatList(user.token);
      setData(list);
    } catch (e: any) {
      setError(e?.message || "加载失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => {
    const checkFirstEnter = async () => {
      try {
        const key = "wowwoo_chat_list_first_enter_v1";
        const seen = await AsyncStorage.getItem(key);
        if (!seen) {
          setWelcomeModalVisible(true);
          await AsyncStorage.setItem(key, "1");
        }
      } catch {
        // 本地存储失败不影响主流程
      }
    };
    checkFirstEnter();
  }, []);

  useEffect(() => {
    loadListWithState();
  }, [loadListWithState]);

  useFocusEffect(
    useCallback(() => {
      if (user?.token) {
        fetchChatList(user.token)
          .then(setData)
          .catch(() => {});
      }
    }, [user?.token]),
  );

  const handleDelete = useCallback(
    (sessionId: string) => {
      if (!user?.token) return;
      // deleteChatSession(user.token, sessionId);
      Alert.alert("删除会话", "确定要删除这个会话吗？", [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: async () => {
            const prev = data;
            setData((d) => d.filter((x) => x.id !== sessionId));
            try {
              await deleteChatSession(user.token, sessionId);
            } catch (e: any) {
              setError(e?.message || "删除失败，请稍后重试");
              setData(prev);
            }
          },
        },
      ]);
    },
    [user?.token, data],
  );

  const handleCreateAgent = async (payload: CustomizeAIData) => {
    if (!user?.token) return;
    setCreating(true);
    try {
      const result = await createChatSession(user.token, {
        name: payload.name,
        avatarUri: payload.avatarUri ?? undefined,
        worldview: payload.worldview || undefined,
        identity: payload.identity || undefined,
        hobbies: payload.hobbies || undefined,
        personality: payload.personality || undefined,
        description: payload.description || undefined,
        worldBookKeywords:
          payload.worldBookKeywords?.length > 0
            ? payload.worldBookKeywords
            : undefined,
        enableActionSceneDescription: payload.enableActionSceneDescription,
      });
      setCustomizeAIModalVisible(false);
      await loadListWithState();
      router.push({
        pathname: "/(tabs)/chat/[id]",
        params: { id: result.id, name: result.title || payload.name },
      });
    } catch (e: any) {
      setError(e?.message || "创建会话失败，请稍后重试");
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
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
            onPress={() => {}}
            activeOpacity={0.7}
          >
            <Ionicons name="search" size={22} color={theme.navTitlePink} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerAddBtn}
            onPress={() => setCreateModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
      <CreateModal
        visible={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
        onCreateGroup={() => {
          setCreateModalVisible(false);
          setComingSoonVisible(true);
        }}
        onCreateAgent={() => {
          setCreateModalVisible(false);
          setCustomizeAIModalVisible(true);
        }}
      />
      <ComingSoonModal
        visible={comingSoonVisible}
        onClose={() => setComingSoonVisible(false)}
      />
      <CustomizeAIModal
        visible={customizeAIModalVisible}
        onClose={() => setCustomizeAIModalVisible(false)}
        onSubmit={handleCreateAgent}
        submitting={creating}
      />
      <Modal
        visible={welcomeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setWelcomeModalVisible(false)}
      >
        <View style={styles.welcomeOverlay}>
          <TouchableOpacity
            style={styles.welcomeBackdrop}
            activeOpacity={1}
            onPress={() => setWelcomeModalVisible(false)}
          />
          <View style={styles.welcomeCard}>
            <ScrollView
              bounces={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.welcomeContent}
            >
              <Text style={styles.welcomeTitle}>
                💛 谢谢你，成为 Wowwoo 小手机的第一批家人。
              </Text>
              <Text style={styles.welcomeParagraph}>
                其实刚刚上线时，我本来打算让大家刚进来就自己承担 API
                费用——每一次对话、每一句回应，成本都真的很高。
              </Text>
              <Text style={styles.welcomeParagraph}>
                但我实在舍不得，让最早相信我的人，一进来就先花钱。
              </Text>
              <Text style={styles.welcomeParagraph}>
                所以我咬牙决定：{"\n"}前 50 条对话，全部由我来买单。
              </Text>
              <Text style={styles.welcomeParagraph}>
                我只想让你，先安心心体验一次：{"\n"}
                什么是真正像「活人」一样，有温度、有回应的陪伴。
              </Text>
            </ScrollView>
            <TouchableOpacity
              style={styles.welcomeButton}
              activeOpacity={0.8}
              onPress={() => setWelcomeModalVisible(false)}
            >
              <Text style={styles.welcomeButtonText}>好的，我知道了</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {error ? (
        <View style={styles.stateWrap}>
          <Text style={styles.stateText}>{error}</Text>
        </View>
      ) : loading ? (
        <View style={styles.stateWrap}>
          <Text style={styles.stateText}>加载中...</Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ChatRow item={item} onDelete={handleDelete} />
          )}
          contentContainerStyle={
            data.length === 0 ? [styles.list, styles.emptyList] : styles.list
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.stateWrap}>
              <Text style={styles.stateText}>暂无会话</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
    backgroundColor: theme.btnPrimaryBg,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    paddingBottom: 16,
    backgroundColor: theme.cardBg,
  },
  emptyList: {
    flexGrow: 1,
  },
  stateWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    backgroundColor: theme.cardBg,
  },
  stateText: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: theme.cardBg,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#ffe4ef",
  },
  content: {
    flex: 1,
    marginLeft: 12,
    minWidth: 0,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  name: {
    fontSize: 17,
    fontWeight: "600",
    color: theme.textPrimary,
    flex: 1,
  },
  time: {
    fontSize: 13,
    color: theme.textMuted,
    marginLeft: 8,
  },
  rowBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  preview: {
    fontSize: 15,
    color: theme.textSecondary,
    flex: 1,
  },
  badge: {
    backgroundColor: theme.badgeRed,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 5,
    marginLeft: 8,
  },
  badgeText: {
    fontSize: 11,
    color: "#fff",
    fontWeight: "600",
  },
  separator: {
    height: 1,
    backgroundColor: "#ffe4ef",
    marginLeft: 76,
  },
  deleteAction: {
    width: 92,
    backgroundColor: "#ff3b30",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  deleteActionLeft: {
    alignSelf: "flex-start",
  },
  deleteActionText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  welcomeOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  welcomeBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  welcomeCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderWidth: 1,
    borderColor: "#d7e3ff",
  },
  welcomeContent: {
    paddingBottom: 12,
  },
  welcomeTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#34405a",
    lineHeight: 24,
    marginBottom: 12,
  },
  welcomeParagraph: {
    fontSize: 14,
    color: "#4b5770",
    lineHeight: 22,
    marginBottom: 8,
  },
  welcomeButton: {
    marginTop: 4,
    backgroundColor: theme.btnPrimaryBg,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  welcomeButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#ffffff",
  },
});
