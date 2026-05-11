import {
  CustomizeAIData,
  CustomizeAIModal,
} from "@/components/CustomizeAIModal";
import { Mascot } from "@/components/Mascot";
import { PreviewableImage } from "@/components/PreviewableImage";
import { VoiceMessageBubble } from "@/components/VoiceMessageBubble";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useKeyboardHeightWeb } from "@/hooks/useKeyboardHeightWeb";
import { buildImageUrlFromKey, fetchImageUrlPrefix } from "@/services/api";
import {
  BackendSessionDetail,
  ChatMessage,
  ChatSummary,
  deleteChatSession,
  EmojiItem,
  fetchChatMessages,
  fetchChatSessionDetail,
  fetchChatSummary,
  fetchEmojiCategories,
  fetchEmojiList,
  fetchMqttConnection,
  mapBackendMessagesToChatMessages,
  sendEmojiMessage,
  sendImageMessage,
  sendMediaMessage,
  sendTextMessage,
  updateChatSession,
} from "@/services/chat";
import { getCachedImageUri } from "@/services/imageCache";
import { claimShareLinkFreecall, uploadAvatarFile } from "@/services/users";
import { Alert } from "@/utils/alert";
import { addLocalChatPeerNotification } from "@/utils/jpush";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import mqtt, { type MqttClient } from "mqtt";
import { showToastThrottled } from "@/utils/toast";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getChatMessagesBefore,
  getLatestChatMessages,
  upsertChatMessages,
} from "../../../services/localCache";

/** 将 createdAt 格式化为：
 * - 当天：仅显示 "HH:mm"
 * - 之前：显示 "YYYY-MM-DD HH:mm"
 */
function formatMessageTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const h = d.getHours();
    const m = d.getMinutes();
    const timeStr = `${h.toString().padStart(2, "0")}:${m
      .toString()
      .padStart(2, "0")}`;
    if (isToday) return timeStr;

    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    const day = d.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day} ${timeStr}`;
  } catch {
    return "";
  }
}

function toUint8Array(payload: unknown): Uint8Array | null {
  if (!payload) return null;
  if (payload instanceof Uint8Array) return payload;
  if (typeof ArrayBuffer !== "undefined" && payload instanceof ArrayBuffer) {
    return new Uint8Array(payload);
  }
  if (
    typeof ArrayBuffer !== "undefined" &&
    ArrayBuffer.isView(payload as any)
  ) {
    const v = payload as ArrayBufferView;
    return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  }
  return null;
}

function decodeUtf8(bytes: Uint8Array): string {
  const anyBytes = bytes as any;
  if (typeof anyBytes?.toString === "function") {
    try {
      return anyBytes.toString("utf8");
    } catch {
      // ignore
    }
  }
  if (typeof TextDecoder !== "undefined") {
    try {
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      // ignore
    }
  }
  return "";
}

function bytesToHexPreview(bytes: Uint8Array, max = 64): string {
  const len = Math.min(bytes.length, max);
  const parts: string[] = [];
  for (let i = 0; i < len; i++) {
    parts.push(bytes[i].toString(16).padStart(2, "0"));
  }
  return parts.join("");
}

function base64ToUint8Array(b64: string): Uint8Array | null {
  const s = b64.trim();
  if (!s) return null;
  // atob（web）或 Buffer（某些 RN/polyfill 环境）
  const g: any = globalThis as any;
  if (typeof g?.atob === "function") {
    try {
      const bin = g.atob(s);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch {
      return null;
    }
  }
  const Buf = g?.Buffer;
  if (typeof Buf?.from === "function") {
    try {
      const buf = Buf.from(s, "base64");
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch {
      return null;
    }
  }
  return null;
}

function tryParseBackendPayload(
  payload: unknown,
): { parsed: unknown; text?: string } | null {
  const bytes = toUint8Array(payload);
  if (!bytes) return null;

  const text = decodeUtf8(bytes);
  if (text) {
    try {
      return { parsed: JSON.parse(text), text };
    } catch {
      // 继续尝试其他编码
    }
  }

  // 常见：payload 实际是 base64 字符串（里面再包一层 JSON）
  if (
    text &&
    /^[A-Za-z0-9+/=\s]+$/.test(text) &&
    text.trim().length % 4 === 0
  ) {
    const decoded = base64ToUint8Array(text);
    if (decoded) {
      const t2 = decodeUtf8(decoded);
      if (t2) {
        try {
          return { parsed: JSON.parse(t2), text: t2 };
        } catch {
          // ignore
        }
      }
    }
  }

  if (__DEV__) {
    console.warn(
      "[mqtt] 未识别 payload",
      `len=${bytes.length}`,
      `hex=${bytesToHexPreview(bytes)}`,
      text ? `textPreview=${text.slice(0, 120)}` : "",
    );
  }
  return null;
}

/** 消息列表项：时间戳 | 消息 */
type ListItem =
  | { type: "time"; key: string; time: string }
  | { type: "msg"; key: string; message: ChatMessage };

const SENT_MATCH_WINDOW_MS = 15000; // 15s 内同内容视为同一条发送（与合并逻辑一致）

function prevHasEquivalentMessage(prev: ChatMessage[], m: ChatMessage): boolean {
  for (const p of prev) {
    if (p.id === m.id) return true;
    if (
      p.platformMessageId &&
      m.platformMessageId &&
      p.platformMessageId === m.platformMessageId
    ) {
      return true;
    }
  }
  return false;
}

function chatMessageToNotificationPreview(m: ChatMessage): string {
  switch (m.type) {
    case "text":
      return (m.text ?? "").trim() || "发来一条消息";
    case "image":
      return "[图片]";
    case "video":
      return "[视频]";
    case "voice":
      return "[语音]";
    case "emoji":
      return "[表情]";
    default:
      return "发来一条消息";
  }
}

/** 与个聊页 mergeIncomingMessages 内逻辑一致，便于单测与复用 */
function mergeChatMessageLists(
  prev: ChatMessage[],
  newList: ChatMessage[],
  sentMatchWindowMs: number,
): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  const byPlatformMessageId = new Map<string, string>();
  for (const m of prev) {
    if (m.platformMessageId && byPlatformMessageId.has(m.platformMessageId)) {
      const existingId = byPlatformMessageId.get(m.platformMessageId)!;
      byId.delete(existingId);
    }
    byId.set(m.id, m);
    if (m.platformMessageId)
      byPlatformMessageId.set(m.platformMessageId, m.id);
  }
  for (const m of newList) {
    if (m.platformMessageId && byPlatformMessageId.has(m.platformMessageId)) {
      const existingId = byPlatformMessageId.get(m.platformMessageId)!;
      byId.delete(existingId);
    }
    if (m.isMine) {
      const mTime = new Date(m.createdAt).getTime();
      const contentKey =
        m.type === "text" ? (m.text ?? "") : (m.mediaUrl ?? "");
      for (const [existingId, existing] of byId.entries()) {
        if (!existing.isMine || existing.type !== m.type) continue;
        const existingTime = new Date(existing.createdAt).getTime();
        if (Math.abs(existingTime - mTime) > sentMatchWindowMs) continue;
        const existingContent =
          existing.type === "text"
            ? (existing.text ?? "")
            : (existing.mediaUrl ?? "");
        if (existingContent !== contentKey) continue;
        byId.delete(existingId);
        if (existing.platformMessageId)
          byPlatformMessageId.delete(existing.platformMessageId);
        break;
      }
    }
    if (!byId.has(m.id)) {
      byId.set(m.id, m);
      if (m.platformMessageId)
        byPlatformMessageId.set(m.platformMessageId, m.id);
    }
  }
  const merged = Array.from(byId.values());
  merged.sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  return merged;
}

function buildListItems(messages: ChatMessage[]): ListItem[] {
  const items: ListItem[] = [];
  const TIME_GAP_MS = 5 * 60 * 1000;
  let lastTs = 0;

  for (const msg of messages) {
    const ts = new Date(msg.createdAt).getTime();
    if (lastTs === 0 || ts - lastTs > TIME_GAP_MS) {
      items.push({
        type: "time",
        key: `time-${msg.id}`,
        time: formatMessageTime(msg.createdAt),
      });
      lastTs = ts;
    }
    items.push({ type: "msg", key: msg.id, message: msg });
  }
  return items;
}

const MSG_ENTER_DURATION = 260;
const EMOJI_PANEL_DURATION = 220;
const DEFAULT_ME_AVATAR = "https://api.dicebear.com/7.x/avataaars/svg?seed=me";

type FreeQuotaStage = "initial" | "shared";

export default function ChatRoomScreen() {
  const {
    id,
    name: paramName,
    avatar: paramAvatar,
  } = useLocalSearchParams<{ id: string; name?: string; avatar?: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, uploadAvatar } = useAuth();
  const [input, setInput] = useState("");
  const [inputHeight, setInputHeight] = useState(45);
  const chatInputRef = useRef<TextInput | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [sending, setSending] = useState(false);
  const [emojiList, setEmojiList] = useState<EmojiItem[]>([]);
  const [emojiCategories, setEmojiCategories] = useState<string[]>([]);
  const [selectedEmojiCategory, setSelectedEmojiCategory] = useState<
    string | null
  >(null);
  const [showEmojiPanel, setShowEmojiPanel] = useState(false);
  const [showPlusPanel, setShowPlusPanel] = useState(false);
  /** 键盘弹起前表情 panel 是否处于激活状态，用于键盘收起后恢复（微信式互斥） */
  const emojiPanelActiveBeforeKeyboardRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [chatSummary, setChatSummary] = useState<ChatSummary | null>(null);
  const [moreMenuVisible, setMoreMenuVisible] = useState(false);
  const [customizeAIModalVisible, setCustomizeAIModalVisible] = useState(false);
  /** 二次配置弹窗的预填数据（由会话详情映射而来） */
  const [reconfigureInitialData, setReconfigureInitialData] =
    useState<CustomizeAIData | null>(null);
  const [loadingReconfigureDetail, setLoadingReconfigureDetail] =
    useState(false);
  const [reconfigureSubmitting, setReconfigureSubmitting] = useState(false);
  /** 会话详情中 is_default_actor 为 true 时，人物配置弹窗仅展示不可编辑 */
  const [reconfigureIsDefaultActor, setReconfigureIsDefaultActor] =
    useState(false);
  const [muteNotifications, setMuteNotifications] = useState(false);
  const [mqttConnected, setMqttConnected] = useState(false);
  const mqttClientRef = useRef<MqttClient | null>(null);
  const mqttActiveRef = useRef(false);

  /** 聊天背景（可为 image_id 或完整 URL）；展示优先用缓存/本地 uri */
  const [chatBackgroundKey, setChatBackgroundKey] = useState<string | null>(
    null,
  );
  const [chatBackgroundResolved, setChatBackgroundResolved] = useState<
    string | null
  >(null);
  const [uploadingChatBackground, setUploadingChatBackground] = useState(false);

  const mergeIncomingMessages = useCallback(
    (
      newList: ChatMessage[],
      opts?: {
        /** 为 true 时：本批存在「对方新发」且未在列表中出现过则触发 JPush 本地通知 */
        notifyPeerViaJpush?: boolean;
        notificationTitle?: string;
      },
    ) => {
      console.log("newList", newList);
      if (!newList?.length) return;
      if (id) {
        // 不阻塞 UI：消息到达即落库，供后续本地翻页/离线查看
        void upsertChatMessages(id, newList as any);
      }
      const wantJpush =
        opts?.notifyPeerViaJpush === true &&
        !muteNotifications &&
        Platform.OS !== "web";
      const jpushTitle = opts?.notificationTitle ?? "新消息";

      setMessages((prev) => {
        const peerNew =
          wantJpush && newList.length
            ? newList.filter(
                (m) => !m.isMine && !prevHasEquivalentMessage(prev, m),
              )
            : [];

        const merged = mergeChatMessageLists(
          prev,
          newList,
          SENT_MATCH_WINDOW_MS,
        );

        if (peerNew.length > 0) {
          const last = peerNew[peerNew.length - 1]!;
          const content =
            peerNew.length === 1
              ? chatMessageToNotificationPreview(last)
              : `${peerNew.length} 条新消息`;
          queueMicrotask(() => {
            addLocalChatPeerNotification(jpushTitle, content, {
              chatId: id ?? "",
              type: "chat_peer",
            });
          });
        }

        console.log("merged", merged);
        return merged;
      });
    },
    [id, muteNotifications],
  );

  const HISTORY_PAGE_SIZE = 100;
  const loadingMoreRef = useRef(false);

  // ---------- 免费额度弹窗（new.md 第2/3/4/5项） ----------
  const freeQuotaStorageKey = useMemo(
    () => `wowwoo:free_quota_stage:${user?.id ?? "anon"}`,
    [user?.id],
  );
  const [freeQuotaStage, setFreeQuotaStage] =
    useState<FreeQuotaStage>("initial");
  const [quotaUsedModalVisible, setQuotaUsedModalVisible] = useState(false);
  const [shareSupportModalVisible, setShareSupportModalVisible] =
    useState(false);
  const [allFreeUsedModalVisible, setAllFreeUsedModalVisible] = useState(false);
  const [shareLink, setShareLink] = useState("");

  useEffect(() => {
    let mounted = true;
    const loadStage = async () => {
      try {
        const v = await AsyncStorage.getItem(freeQuotaStorageKey);
        if (!mounted) return;
        if (v === "shared") setFreeQuotaStage("shared");
        else setFreeQuotaStage("initial");
      } catch {
        if (mounted) setFreeQuotaStage("initial");
      }
    };
    loadStage();
    return () => {
      mounted = false;
    };
  }, [freeQuotaStorageKey]);

  const persistFreeQuotaStage = useCallback(
    async (stage: FreeQuotaStage) => {
      setFreeQuotaStage(stage);
      try {
        await AsyncStorage.setItem(freeQuotaStorageKey, stage);
      } catch {
        // ignore
      }
    },
    [freeQuotaStorageKey],
  );

  const openApiConfig = useCallback(() => {
    // 复用现有“配置 API”页面：跳转到 profile 并带参数打开配置弹窗
    router.push({
      pathname: "/(tabs)/profile",
      params: { openApiConfig: "1" },
    });
  }, [router]);

  const handleSendQuotaExceeded = useCallback(
    (hasClaimedShareFreecall?: boolean) => {
      // 新判定规则：/send 200 但返回 status="发送失败"
      // 根据 has_claimed_share_freecall 决定展示 new.md 第2步或第5步
      if (hasClaimedShareFreecall === true) {
        setAllFreeUsedModalVisible(true);
        return;
      }
      if (hasClaimedShareFreecall === false) {
        setQuotaUsedModalVisible(true);
        return;
      }
      // 兜底：若后端未返回该字段，则使用本地阶段
      if (freeQuotaStage === "shared") setAllFreeUsedModalVisible(true);
      else setQuotaUsedModalVisible(true);
    },
    [freeQuotaStage],
  );

  const closePanels = useCallback(() => {
    setShowEmojiPanel(false);
    setShowPlusPanel(false);
  }, []);

  // 表情与键盘互斥：键盘弹起时关闭表情 panel，键盘收起后若之前是激活状态则重新打开
  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => {
      // 若此时表情 panel 处于打开态，说明它是“激活”的；键盘弹起时关闭并记录，待键盘收起后恢复
      setShowEmojiPanel((prev) => {
        if (!prev) return prev;
        emojiPanelActiveBeforeKeyboardRef.current = true;
        return false;
      });
      // 键盘弹起时也收起加号面板，避免叠层
      setShowPlusPanel(false);
    });

    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      if (emojiPanelActiveBeforeKeyboardRef.current) {
        emojiPanelActiveBeforeKeyboardRef.current = false;
        setShowEmojiPanel(true);
      }
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const name = useMemo(
    () => chatSummary?.name ?? paramName ?? `聊天 ${id ?? ""}`,
    [chatSummary?.name, paramName, id],
  );
  /** MQTT 回调不随标题变化重订阅，通知标题读最新值 */
  const chatTitleForNotifyRef = useRef(name);
  useEffect(() => {
    chatTitleForNotifyRef.current = name;
  }, [name]);

  const otherAvatar = chatSummary?.avatar ?? paramAvatar ?? undefined;
  const myAvatar = user?.avatarUri ?? DEFAULT_ME_AVATAR;

  const [myAvatarCached, setMyAvatarCached] = useState<string>(myAvatar);
  const [otherAvatarCached, setOtherAvatarCached] = useState<
    string | undefined
  >(otherAvatar);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      const uri = myAvatar || DEFAULT_ME_AVATAR;
      const cached = await getCachedImageUri(uri);
      if (mounted) setMyAvatarCached(cached || uri);
    };
    run();
    return () => {
      mounted = false;
    };
  }, [myAvatar]);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      const uri = otherAvatar;
      if (!uri) {
        if (mounted) setOtherAvatarCached(undefined);
        return;
      }
      const cached = await getCachedImageUri(uri);
      if (mounted) setOtherAvatarCached(cached || uri);
    };
    run();
    return () => {
      mounted = false;
    };
  }, [otherAvatar]);

  useFocusEffect(
    useCallback(() => {
      const parent = navigation.getParent?.();
      if (!parent) return;

      // 进入个聊页时隐藏底部 tab
      parent.setOptions({
        tabBarStyle: {
          display: "none",
        },
      });

      // 离开个聊页时恢复原来的 tab 样式
      return () => {
        parent.setOptions({
          tabBarStyle: {
            backgroundColor: theme.tabBarBg,
            borderTopWidth: 1,
            borderTopColor: theme.border,
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 20) + 8,
            minHeight: 56 + Math.max(insets.bottom, 20),
          },
        });
      };
    }, [navigation, insets.bottom]),
  );

  useEffect(() => {
    navigation.setOptions({
      title: name,
      headerRight: () => (
        <TouchableOpacity
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => setMoreMenuVisible(true)}
          style={{ paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={"#a53f68"} />
        </TouchableOpacity>
      ),
    });
  }, [name, navigation]);

  useEffect(() => {
    if (!id || !user?.token) return;
    let isMounted = true;
    const load = async () => {
      try {
        const summary = await fetchChatSummary(id, user.token);
        if (isMounted) setChatSummary(summary);
      } catch {
        // 静默失败，标题用默认
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [id, user?.token]);

  // 拉取历史消息（/history）
  useEffect(() => {
    if (!id || !user?.token) return;
    let isMounted = true;
    const load = async () => {
      setLoading(true);
      setLoadingMore(false);
      loadingMoreRef.current = false;
      setHasMoreHistory(true);
      setError(null);
      try {
        // 1) 先读本地（秒开）
        const local = await getLatestChatMessages(id, HISTORY_PAGE_SIZE);
        if (isMounted) {
          if (local?.length) {
            setMessages(local as any);
            // 本地不足一页并不代表没有更多；仍允许继续尝试从服务端补齐
            setHasMoreHistory(true);
          } else {
            setMessages([]);
          }
        }
        // 2) 再从服务端补一次最新（权威），并落库
        const data = await fetchChatMessages(id, user.token, {
          userId: user.id,
          limit: HISTORY_PAGE_SIZE,
        });
        await upsertChatMessages(id, data as any);
        if (isMounted) {
          mergeIncomingMessages(data);
          // 首屏拉到的数量不足一页，认为没有更多历史（以服务端为准）
          setHasMoreHistory((data?.length ?? 0) >= HISTORY_PAGE_SIZE);
        }
      } catch (e: any) {
        if (isMounted) {
          setError(e?.message || "加载聊天记录失败");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [id, user?.token, user?.id, mergeIncomingMessages]);

  const loadMoreHistory = useCallback(async () => {
    if (!id || !user?.token || user?.id == null) return;
    if (loading || loadingMoreRef.current || loadingMore) return;
    if (!hasMoreHistory) return;

    const oldest = messages[0];
    const oldestIso = oldest?.createdAt;
    if (!oldestIso) {
      setHasMoreHistory(false);
      return;
    }

    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      // 1) 先尝试从本地拿更早消息
      const localMore = await getChatMessagesBefore(
        id,
        oldestIso,
        HISTORY_PAGE_SIZE,
      );
      if (localMore?.length) {
        mergeIncomingMessages(localMore as any);
        // 本地已经够一页，先不打接口
        if (localMore.length >= HISTORY_PAGE_SIZE) return;
      }

      // 2) 本地不够，再从服务端补
      const endAtSec = Math.floor(new Date(oldestIso).getTime() / 1000);
      if (!Number.isFinite(endAtSec) || endAtSec <= 0) {
        setHasMoreHistory(false);
        return;
      }

      const more = await fetchChatMessages(id, user.token, {
        userId: user.id,
        endAt: String(endAtSec),
        limit: HISTORY_PAGE_SIZE,
      });
      if (!more?.length) {
        setHasMoreHistory(false);
        return;
      }
      await upsertChatMessages(id, more as any);
      mergeIncomingMessages(more);
      // 少于一页 => 认为到底
      if (more.length < HISTORY_PAGE_SIZE) setHasMoreHistory(false);
    } catch {
      // 上拉加载失败：按需求停止后续自动尝试，避免滚动反复触发请求
      setHasMoreHistory(false);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [
    id,
    user?.token,
    user?.id,
    loading,
    loadingMore,
    hasMoreHistory,
    messages,
    mergeIncomingMessages,
  ]);

  // MQTT 实时收消息：先拉连接信息，再 MQTT over WebSocket 订阅 topic
  useEffect(() => {
    const token = user?.token;
    const uid = user?.id;
    if (!id || !token || uid == null) return;

    mqttActiveRef.current = true;
    setMqttConnected(false);

    const disposeClient = () => {
      try {
        mqttClientRef.current?.removeAllListeners();
        mqttClientRef.current?.end(true);
      } catch {
        // ignore
      } finally {
        mqttClientRef.current = null;
      }
    };

    const cleanup = () => {
      mqttActiveRef.current = false;
      setMqttConnected(false);
      disposeClient();
    };

    const start = async () => {
      try {
        // 防止 effect 重跑导致重复连接（同 clientId 的并发连接容易触发 connack timeout）
        disposeClient();

        const conn = await fetchMqttConnection(id, token);
        if (!mqttActiveRef.current) return;

        const client = mqtt.connect(conn.wsUrl, {
          clientId: conn.clientId,
          username: conn.username,
          password: conn.password,
          reconnectPeriod: 3000,
          keepalive: 60,
          // 弱网/后台切前台时，WebSocket 握手和 CONNACK 可能更慢；显式拉长超时
          connectTimeout: 60_000,
          clean: true,
          resubscribe: true,
        });
        mqttClientRef.current = client;

        client.on("connect", () => {
          if (!mqttActiveRef.current) return;
          try {
            setMqttConnected(true);
            client.subscribe(conn.topic, { qos: 0 }, (_err) => {
              // ignore：订阅失败会触发后续重连/重订阅，不要让异常冒泡导致闪退
            });
          } catch {
            // ignore：避免极端情况下（组件卸载/状态竞争）抛错导致闪退
          }
        });

        client.on("close", () => {
          if (!mqttActiveRef.current) return;
          try {
            setMqttConnected(false);
            showToastThrottled("mqtt-disconnect", "实时连接已断开，正在重连…", 5000);
          } catch {
            // ignore
          }
        });

        client.on("offline", () => {
          if (!mqttActiveRef.current) return;
          try {
            setMqttConnected(false);
            showToastThrottled("mqtt-offline", "网络离线，实时消息可能延迟", 8000);
          } catch {
            // ignore
          }
        });

        client.on("error", (_err) => {
          // 交给 reconnectPeriod 自动重连；这里不打断 UI
          // 关键：必须吞掉 error，避免某些运行时把未处理错误上抛导致闪退
          try {
            if (!mqttActiveRef.current) return;
            setMqttConnected(false);
            showToastThrottled("mqtt-error", "实时连接异常，正在重连…", 5000);
          } catch {
            // ignore
          }
        });

        client.on("message", async (_topic: string, payload: unknown) => {
          if (!mqttActiveRef.current) return;
          try {
            const result = tryParseBackendPayload(payload);
            // 调试：MQTT 推送的原始 payload 解析结果（即“接口”返回的原始数据）
            if (__DEV__ && result) {
              console.log("[chat] MQTT 消息原始数据", result.parsed ?? result);
            }
            if (!result) return;
            const list = await mapBackendMessagesToChatMessages(
              result.parsed as any,
              uid,
            );
            mergeIncomingMessages(list, {
              notifyPeerViaJpush: true,
              notificationTitle: chatTitleForNotifyRef.current,
            });
          } catch {
            // payload 非 JSON 或解析失败则忽略
          }
        });
      } catch {
        // 拉取连接信息失败时，保持轮询兜底
      }
    };

    start();
    return cleanup;
  }, [id, user?.token, user?.id, mergeIncomingMessages]);

  useEffect(() => {
    if (!user?.token) return;
    let isMounted = true;
    const loadEmojiData = async () => {
      try {
        const categories = await fetchEmojiCategories(user.token);
        if (!isMounted) return;
        setEmojiCategories(categories);
        const firstCategoryId = categories[0];
        const list = await fetchEmojiList(
          user.token,
          firstCategoryId ?? undefined,
        );
        if (!isMounted) return;
        setEmojiList(list);
      } catch {
        // 表情包失败不影响主流程，静默处理
      }
    };
    loadEmojiData();
    return () => {
      isMounted = false;
    };
  }, [user?.token]);

  const sendText = useCallback(async () => {
    if (!id || !user?.token) return;
    const t = input.trim();
    if (!t) return;
    try {
      setSending(true);
      setInput("");
      const created = await sendTextMessage(
        id,
        { type: "text", text: t },
        user.token,
      );
      setMessages((prev) => [...prev, created]);
    } catch (e) {
      const code = (e as any)?.code;
      if (code === "FREE_CALL_EXHAUSTED") {
        handleSendQuotaExceeded((e as any)?.hasClaimedShareFreecall);
        return;
      }
      setError((e as any)?.message || "发送失败，请稍后重试");
    } finally {
      setSending(false);
    }
  }, [id, input, user?.token, handleSendQuotaExceeded]);

  const pickMediaAndSend = useCallback(
    async (mediaType: "image" | "video") => {
      if (!id || !user?.token) return;

      // 图片在原生端使用 ImagePicker 支持裁剪，Web 端及视频继续用 DocumentPicker
      if (mediaType === "image" && Platform.OS !== "web") {
        const { status } =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          setError("需要相册权限才能选择图片");
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          quality: 0.9,
        });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        if (!asset.uri) return;
        try {
          setSending(true);
          const file = {
            uri: asset.uri,
            name:
              asset.fileName ??
              `chat_image_${Date.now()}_${Math.random()
                .toString(16)
                .slice(2)}.jpg`,
            type: asset.mimeType ?? "image/jpeg",
          };
          const uploadResult = await uploadAvatarFile(user.token, file, {
            compress: true,
          });
          if (!uploadResult?.imageId) {
            setError("图片上传失败，请重试");
            return;
          }
          const created = await sendImageMessage(
            id,
            uploadResult.imageId,
            user.token,
            { localUri: uploadResult.localUri },
          );
          setMessages((prev) => [...prev, created]);
        } catch (e) {
          const code = (e as any)?.code;
          if (code === "FREE_CALL_EXHAUSTED") {
            handleSendQuotaExceeded((e as any)?.hasClaimedShareFreecall);
            return;
          }
          setError((e as any)?.message || "发送失败，请稍后重试");
        } finally {
          setSending(false);
        }
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: mediaType === "image" ? "image/*" : "video/*",
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      try {
        setSending(true);
        if (mediaType === "image") {
          // 与头像上传相同：先拿到上传链接上传文件得到 image_id，再发消息 content=image_id, message_type=image
          const file = (result as any).output?.[0] ?? {
            uri: asset.uri,
            name: asset.name,
          };
          const uploadResult = await uploadAvatarFile(user.token, file, {
            compress: true,
          });
          if (!uploadResult?.imageId) {
            setError("图片上传失败，请重试");
            return;
          }
          const created = await sendImageMessage(
            id,
            uploadResult.imageId,
            user.token,
            { localUri: uploadResult.localUri },
          );
          setMessages((prev) => [...prev, created]);
        } else {
          const created = await sendMediaMessage({
            chatId: id,
            token: user.token,
            uri: asset.uri,
            mimeType: asset.mimeType ?? undefined,
            fileName: asset.name,
            mediaType,
          });
          setMessages((prev) => [...prev, created]);
        }
      } catch (e) {
        const code = (e as any)?.code;
        if (code === "FREE_CALL_EXHAUSTED") {
          handleSendQuotaExceeded((e as any)?.hasClaimedShareFreecall);
          return;
        }
        setError((e as any)?.message || "发送失败，请稍后重试");
      } finally {
        setSending(false);
      }
    },
    [id, user?.token, handleSendQuotaExceeded],
  );

  const onEmojiPress = useCallback(
    async (emoji: EmojiItem) => {
      const emojiUrl = emoji.url || "";
      if (!emojiUrl || !id || !user?.token) return;
      try {
        setSending(true);
        const created = await sendEmojiMessage(id, emojiUrl, user.token);
        setMessages((prev) => [...prev, created]);
        setShowEmojiPanel(false);
      } catch (e) {
        const code = (e as any)?.code;
        if (code === "FREE_CALL_EXHAUSTED") {
          handleSendQuotaExceeded((e as any)?.hasClaimedShareFreecall);
          return;
        }
        setError((e as any)?.message || "发送失败，请稍后重试");
      } finally {
        setSending(false);
      }
    },
    [id, user?.token, handleSendQuotaExceeded],
  );

  const handleEmojiCategoryPress = async (categoryId: string | null) => {
    if (!user?.token) return;
    setSelectedEmojiCategory(categoryId);
    try {
      const list = await fetchEmojiList(user.token, categoryId || undefined);
      setEmojiList(list);
    } catch {
      // 类别切换失败不影响主流程，静默处理
    }
  };

  /** 将会话详情映射为 CustomizeAIData，用于二次配置弹窗预填 */
  const sessionDetailToInitialData = useCallback(
    (d: BackendSessionDetail): CustomizeAIData => {
      console.log("d", d);
      return {
        name: d.name ?? "",
        avatarUri: (() => {
          const v =
            d.avatar ??
            (d as Record<string, unknown>).avatar_uri ??
            (d as Record<string, unknown>).avatarUri;
          return typeof v === "string" ? v : null;
        })(),
        worldview: d.worldview ?? "",
        identity: d.identity ?? "",
        hobbies: d.hobbies ?? "",
        personality: d.personality ?? "",
        description: d.description ?? "",
        worldBookKeywords: d.worldBookKeywords ?? [],
        enableActionSceneDescription: d.enableActionSceneDescription ?? false,
      };
    },
    [],
  );

  const sessionDetailToChatBackgroundKey = useCallback(
    (d: BackendSessionDetail): string | null => {
      const v =
        (d as any).chat_background_uri ??
        (d as any).chatBackgroundUri ??
        (d as any).chat_background ??
        (d as any).chatBackground ??
        (d as any).background_uri ??
        (d as any).backgroundUri ??
        (d as any).background ??
        null;
      return typeof v === "string" && v ? v : null;
    },
    [],
  );

  // 页面加载时拉取会话详情，供二次配置弹窗使用，避免每次打开弹窗都请求接口
  useEffect(() => {
    if (!id || !user?.token) return;
    let isMounted = true;
    setLoadingReconfigureDetail(true);
    setReconfigureInitialData(null);
    setReconfigureIsDefaultActor(false);
    const load = async () => {
      try {
        const detail = await fetchChatSessionDetail(id, user.token);
        if (!isMounted) return;
        if (detail) {
          setReconfigureInitialData(sessionDetailToInitialData(detail));
          setReconfigureIsDefaultActor(detail.isDefaultActor === true);
          setChatBackgroundKey(sessionDetailToChatBackgroundKey(detail));
        }
      } catch {
        // 静默失败，打开弹窗时再提示
      } finally {
        if (isMounted) setLoadingReconfigureDetail(false);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [id, user?.token, sessionDetailToInitialData, sessionDetailToChatBackgroundKey]);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      const key = chatBackgroundKey;
      if (!key) {
        if (mounted) setChatBackgroundResolved(null);
        return;
      }
      try {
        await fetchImageUrlPrefix().catch(() => "");
        const url = buildImageUrlFromKey(key) || key;
        const cached = /^https?:\/\//i.test(url) ? await getCachedImageUri(url) : null;
        if (mounted) setChatBackgroundResolved(cached || url);
      } catch {
        if (mounted) setChatBackgroundResolved(key);
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [chatBackgroundKey]);

  const openReconfigureModal = useCallback(async () => {
    setMoreMenuVisible(false);
    if (!id || !user?.token) return;
    const detail = await fetchChatSessionDetail(id, user.token);
    if (!detail) return;
    setReconfigureInitialData(sessionDetailToInitialData(detail));
    setReconfigureIsDefaultActor(detail.isDefaultActor === true);
    // setLoadingReconfigureDetail(true);
    // if (!id || !user?.token) return;
    // if (reconfigureInitialData === null && !loadingReconfigureDetail) {
    //   setError("无法获取会话配置，请稍后重试");
    //   return;
    // }
    // setLoadingReconfigureDetail(false);
    // if (reconfigureInitialData === null && loadingReconfigureDetail) {
    //   return; // 仍在加载，稍后再试
    // }
    setCustomizeAIModalVisible(true);
  }, [id, user?.token, reconfigureInitialData, loadingReconfigureDetail]);

  const handleReconfigure = useCallback(
    async (payload: CustomizeAIData) => {
      if (!id || !user?.token) return;
      setReconfigureSubmitting(true);
      try {
        await updateChatSession(user.token, id, {
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
        setReconfigureInitialData(null);
        const summary = await fetchChatSummary(id, user.token);
        if (summary) setChatSummary(summary);
      } catch (e: any) {
        setError(e?.message || "更新配置失败，请稍后重试");
      } finally {
        setReconfigureSubmitting(false);
      }
    },
    [id, user?.token],
  );

  // ---------- 弹窗渲染 ----------
  const renderPopupCard = (children: ReactNode) => (
    <Pressable style={styles.popupMask} onPress={() => {}}>
      <View style={styles.popupCard}>{children}</View>
    </Pressable>
  );

  const submitShareLink = useCallback(async () => {
    const v = shareLink.trim();
    if (!v) {
      Alert.alert("提示", "请先粘贴你的作品链接");
      return;
    }
    try {
      if (!user?.token) {
        Alert.alert("提示", "请先登录后再提交作品链接");
        return;
      }
      // 调用后端接口，提交分享链接并申请恢复免费额度
      await claimShareLinkFreecall(user.token, v);

      // 额外在本地做记录，方便下次进入时识别
      await AsyncStorage.setItem(`wowwoo:share_link:${user?.id ?? "anon"}`, v);
      await persistFreeQuotaStage("shared");
      setShareSupportModalVisible(false);
      setQuotaUsedModalVisible(false);
      Alert.alert("已提交", "我们会尽快审核，通过后会为你恢复 50 条对话额度。");
    } catch (e: any) {
      Alert.alert("提交失败", e?.message || "提交作品链接失败，请稍后重试");
    }
  }, [shareLink, user?.id, user?.token, persistFreeQuotaStage]);

  const handleToggleMute = () => {
    const next = !muteNotifications;
    setMuteNotifications(next);
    // TODO: 调用后端接口，更新当前会话的消息免打扰状态（chatId: id, mute: next）
    console.log("切换消息免打扰:", id, next);
  };

  const pickChatBackgroundAndSave = useCallback(async () => {
    if (!id || !user?.token) return;
    if (uploadingChatBackground) return;
    setMoreMenuVisible(false);
    setError(null);

    try {
      setUploadingChatBackground(true);
      await fetchImageUrlPrefix().catch(() => "");

      // Web：DocumentPicker 直接拿 File；原生：ImagePicker 支持裁剪
      if (Platform.OS === "web") {
        const result = await DocumentPicker.getDocumentAsync({
          type: "image/*",
          copyToCacheDirectory: true,
        });
        if (result.canceled) return;
        const file = (result as any).output?.[0] ?? (result as any).assets?.[0];
        if (!file) return;

        const uploadRes = await uploadAvatarFile(user.token, file, {
          compress: true,
        });
        if (!uploadRes?.imageId) {
          setError("图片上传失败，请重试");
          return;
        }
        await updateChatSession(user.token, id, {
          chatBackgroundUri: uploadRes.imageId,
        });
        const url = buildImageUrlFromKey(uploadRes.imageId);
        const displayUri = uploadRes.localUri ?? url;
        setChatBackgroundKey(uploadRes.imageId);
        if (displayUri) setChatBackgroundResolved(displayUri);
        return;
      }

      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        setError("需要相册权限才能选择图片");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [9, 19],
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (!asset.uri) return;
      const file = {
        uri: asset.uri,
        name:
          asset.fileName ??
          `chat_bg_${Date.now()}_${Math.random().toString(16).slice(2)}.jpg`,
        type: asset.mimeType ?? "image/jpeg",
      };
      const uploadRes = await uploadAvatarFile(user.token, file, {
        compress: true,
      });
      if (!uploadRes?.imageId) {
        setError("图片上传失败，请重试");
        return;
      }
      await updateChatSession(user.token, id, {
        chatBackgroundUri: uploadRes.imageId,
      });
      const url = buildImageUrlFromKey(uploadRes.imageId);
      const displayUri = uploadRes.localUri ?? url ?? file.uri;
      setChatBackgroundKey(uploadRes.imageId);
      if (displayUri) setChatBackgroundResolved(displayUri);
    } catch (e: any) {
      setError(e?.message || "更换聊天背景失败，请稍后重试");
    } finally {
      setUploadingChatBackground(false);
    }
  }, [id, user?.token, uploadingChatBackground]);

  const handleDeleteFriend = () => {
    Alert.alert("删除会话", "删除后将清空当前会话记录，确定要删除该会话吗？", [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          setMoreMenuVisible(false);
          if (!id || !user?.token) {
            navigation.goBack();
            return;
          }
          try {
            await deleteChatSession(user.token, id);
          } catch {
            // 仍返回上一页，会话列表刷新后会消失
          }
          navigation.goBack();
        },
      },
    ]);
  };

  const listItems = useMemo(() => buildListItems(messages), [messages]);
  /** 反转后给 FlatList：inverted 时“首项在底部”，故 [newest...oldest] 使进入页面直接看到最新消息，无需 scrollToEnd */
  const listItemsReversed = useMemo(
    () => [...listItems].reverse(),
    [listItems],
  );
  const listRef = useRef<FlatList<ListItem>>(null);

  const renderItem = ({ item, index }: { item: ListItem; index: number }) => {
    if (item.type === "time") {
      return (
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{item.time}</Text>
        </View>
      );
    }
    const msg = item.message;
    const isMe = msg.isMine;
    const avatarUri = isMe ? myAvatarCached : otherAvatarCached;
    const entering = FadeInDown.duration(MSG_ENTER_DURATION)
      .springify()
      // .damping(14)
      .damping(200)
      .delay(index < 10 ? index * 24 : 0);
    return (
      <Animated.View entering={entering} style={styles.bubbleRow}>
        {isMe ? (
          <>
            <View style={styles.bubbleSpacer} />
            <View style={[styles.bubbleWrap, styles.bubbleWrapMe]}>
              <View style={[styles.bubble, styles.bubbleMe]}>
                {msg.type === "text" && (
                  <Text style={[styles.bubbleText, styles.bubbleTextMe]}>
                    {msg.text}
                  </Text>
                )}
                {msg.type === "image" && (msg.localImageUri ?? msg.mediaUrl) && (
                  <PreviewableImage
                    source={{ uri: msg.localImageUri ?? msg.mediaUrl }}
                    style={styles.image}
                    accessibilityLabel="图片消息"
                  />
                )}
                {msg.type === "video" && (
                  <View style={styles.videoPlaceholder}>
                    <Text style={styles.videoText}>
                      [视频消息，点击在新页面查看]
                    </Text>
                  </View>
                )}
                {msg.type === "voice" && msg.mediaUrl && (
                  <VoiceMessageBubble uri={msg.mediaUrl} isMine />
                )}
                {msg.type === "emoji" && msg.mediaUrl && (
                  <PreviewableImage
                    source={{ uri: msg.mediaUrl }}
                    style={styles.emojiBubble}
                    accessibilityLabel="表情"
                  />
                )}
              </View>
            </View>
            <PreviewableImage
              source={{ uri: myAvatarCached }}
              style={styles.msgAvatar}
              accessibilityLabel="我的头像"
            />
          </>
        ) : (
          <>
            <PreviewableImage
              source={{ uri: avatarUri || DEFAULT_ME_AVATAR }}
              style={styles.msgAvatar}
              accessibilityLabel="对方头像"
            />
            <View style={styles.bubbleWrap}>
              <View style={[styles.bubble, styles.bubbleOther]}>
                {msg.type === "text" && (
                  <Text style={styles.bubbleText}>{msg.text}</Text>
                )}
                {msg.type === "image" && (msg.localImageUri ?? msg.mediaUrl) && (
                  <PreviewableImage
                    source={{ uri: msg.localImageUri ?? msg.mediaUrl }}
                    style={styles.image}
                    accessibilityLabel="图片消息"
                  />
                )}
                {msg.type === "video" && (
                  <View style={styles.videoPlaceholder}>
                    <Text style={styles.videoText}>
                      [视频消息，点击在新页面查看]
                    </Text>
                  </View>
                )}
                {msg.type === "voice" && msg.mediaUrl && (
                  <VoiceMessageBubble uri={msg.mediaUrl} isMine={false} />
                )}
                {msg.type === "emoji" && msg.mediaUrl && (
                  <PreviewableImage
                    source={{ uri: msg.mediaUrl }}
                    style={styles.emojiBubble}
                    accessibilityLabel="表情"
                  />
                )}
              </View>
            </View>
          </>
        )}
      </Animated.View>
    );
  };

  const headerHeight = Platform.OS === "ios" ? 44 : 56;
  const keyboardVerticalOffset = insets.top + headerHeight;
  const keyboardHeightWeb = useKeyboardHeightWeb();

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        Platform.OS === "web" && keyboardHeightWeb > 0
          ? { paddingBottom: keyboardHeightWeb }
          : undefined,
      ]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {chatBackgroundResolved ? (
        <>
          <Image
            source={{ uri: chatBackgroundResolved }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFillObject, styles.chatBgMask]}
          />
        </>
      ) : null}
      {error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      {loading ? (
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>加载中...</Text>
        </View>
      ) : listItems.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Mascot size={140} />
          <Text style={styles.emptyTitle}>和 WOWWOO 聊点什么吧</Text>
          <Text style={styles.emptySub}>
            她正戴着耳机等你讲话，先发一条消息试试～
          </Text>
        </View>
      ) : (
        <Animated.View entering={FadeIn.duration(320)} style={styles.listWrap}>
          <FlatList
            ref={listRef}
            data={listItemsReversed}
            keyExtractor={(item) => item.key}
            contentContainerStyle={styles.list}
            renderItem={renderItem}
            inverted
            keyboardShouldPersistTaps="handled"
            onEndReached={() => {
              // inverted=true 时，滚到“顶部(更早)”会触发 onEndReached
              loadMoreHistory();
            }}
            onEndReachedThreshold={0.15}
            ListFooterComponent={
              loadingMore ? (
                <View style={{ paddingVertical: 12 }}>
                  <ActivityIndicator size="small" color={theme.textSecondary} />
                </View>
              ) : !hasMoreHistory ? (
                <View style={{ paddingVertical: 10 }}>
                  <Text
                    style={{
                      textAlign: "center",
                      color: theme.textSecondary,
                      fontSize: 12,
                    }}
                  >
                    没有更多历史消息了
                  </Text>
                </View>
              ) : (
                <View style={{ height: 8 }} />
              )
            }
          />
        </Animated.View>
      )}
      <View
        style={[
          styles.footer,
          { paddingBottom: 8 + Math.max(insets.bottom, 12) },
        ]}
      >
        {/* <TouchableOpacity style={styles.toolBtn} activeOpacity={0.7}>
          <Ionicons name="mic-outline" size={24} color={theme.textSecondary} />
        </TouchableOpacity> */}
        <TextInput
          ref={chatInputRef}
          style={[styles.input, { height: inputHeight }]}
          placeholder="说点什么..."
          placeholderTextColor={theme.pinkPlaceholder}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={500}
          onContentSizeChange={(e) => {
            const minHeight = 36;
            const maxHeight = 96;
            const next =
              e.nativeEvent.contentSize?.height != null
                ? e.nativeEvent.contentSize.height
                : minHeight;
            setInputHeight(Math.max(minHeight, Math.min(maxHeight, next)));
          }}
          onSubmitEditing={sendText}
          returnKeyType="send"
          blurOnSubmit={false}
          onKeyPress={(e) => {
            if (e.nativeEvent.key === "Enter") {
              (e as any).preventDefault?.();
              sendText();
            }
          }}
        />
        <TouchableOpacity
          style={[
            styles.toolBtn,
            input.trim() && !sending && styles.toolBtnSend,
          ]}
          onPress={input.trim() && !sending ? sendText : undefined}
          disabled={sending}
          activeOpacity={0.7}
        >
          {input.trim() && !sending ? (
            <Text style={styles.sendLabel} numberOfLines={1}>
              发送
            </Text>
          ) : (
            // <Ionicons name="mic" size={24} color={theme.textSecondary} />
            <Text style={styles.sendLabel} numberOfLines={1}>
              发送
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toolBtn, showEmojiPanel && styles.toolBtnActive]}
          onPress={() => {
            if (showEmojiPanel) {
              // 表情面板已打开：切回键盘
              emojiPanelActiveBeforeKeyboardRef.current = false;
              setShowEmojiPanel(false);
              setShowPlusPanel(false);
              setTimeout(() => chatInputRef.current?.focus(), 0);
            } else {
              // 表情面板未打开：切到表情（收起键盘）
              emojiPanelActiveBeforeKeyboardRef.current = false;
              Keyboard.dismiss();
              setShowPlusPanel(false);
              setShowEmojiPanel(true);
            }
          }}
          activeOpacity={0.7}
        >
          <Ionicons
            name={showEmojiPanel ? "keypad-outline" : "happy-outline"}
            size={24}
            color={theme.textSecondary}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toolBtn, showPlusPanel && styles.toolBtnActive]}
          onPress={() => {
            setShowPlusPanel((v) => !v);
            if (!showPlusPanel) setShowEmojiPanel(false);
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={28} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>
      {showPlusPanel && (
        <Animated.View
          entering={FadeIn.duration(EMOJI_PANEL_DURATION)}
          exiting={FadeOut.duration(EMOJI_PANEL_DURATION)}
          style={styles.plusPanel}
        >
          <TouchableOpacity
            style={styles.plusPanelItem}
            onPress={() => {
              closePanels();
              pickMediaAndSend("image");
            }}
            activeOpacity={0.7}
          >
            <View style={styles.plusPanelIconWrap}>
              <Text style={styles.plusPanelIcon}>🖼</Text>
            </View>
            <Text style={styles.plusPanelLabel}>相册</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.plusPanelItem}
            onPress={() => {
              closePanels();
              pickMediaAndSend("video");
            }}
            activeOpacity={0.7}
          >
            <View style={styles.plusPanelIconWrap}>
              <Text style={styles.plusPanelIcon}>📷</Text>
            </View>
            <Text style={styles.plusPanelLabel}>拍摄</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
      {showEmojiPanel && emojiList.length > 0 && (
        <Animated.View
          entering={FadeIn.duration(EMOJI_PANEL_DURATION)}
          exiting={FadeOut.duration(EMOJI_PANEL_DURATION)}
          style={styles.emojiPanel}
        >
          <FlatList
            horizontal
            data={["all", ...emojiCategories]}
            keyExtractor={(item) => item}
            contentContainerStyle={styles.emojiCategoryList}
            renderItem={({ item }) => {
              const isAll = item === "all";
              const active =
                (isAll && !selectedEmojiCategory) ||
                (!isAll && selectedEmojiCategory === item);
              return (
                <TouchableOpacity
                  style={[
                    styles.emojiCategoryItem,
                    active && styles.emojiCategoryItemActive,
                  ]}
                  onPress={() => handleEmojiCategoryPress(isAll ? null : item)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.emojiCategoryLabel,
                      active && styles.emojiCategoryLabelActive,
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
          <View style={styles.emojiListWrap}>
            <FlatList
              data={emojiList}
              keyExtractor={(item) => item.id}
              numColumns={5}
              contentContainerStyle={styles.emojiList}
              style={styles.emojiListScroll}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.emojiItem}
                  onPress={() => onEmojiPress(item)}
                  activeOpacity={0.7}
                >
                  {item.url ? (
                    <Image
                      source={{ uri: item.url }}
                      style={styles.emojiImage}
                    />
                  ) : (
                    <Text style={styles.emojiSymbol}>{item.url}</Text>
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </Animated.View>
      )}
      <Modal
        visible={moreMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMoreMenuVisible(false)}
      >
        <Pressable
          style={styles.moreMenuBackdrop}
          onPress={() => setMoreMenuVisible(false)}
        >
          <View style={styles.moreMenuBox}>
            <TouchableOpacity
              style={styles.moreMenuItem}
              onPress={openReconfigureModal}
              disabled={loadingReconfigureDetail}
              activeOpacity={0.7}
            >
              {loadingReconfigureDetail ? (
                <ActivityIndicator size="small" color={theme.textPrimary} />
              ) : (
                <Ionicons
                  name="settings-outline"
                  size={20}
                  color={theme.textPrimary}
                />
              )}
              <Text style={styles.moreMenuLabel}>
                {reconfigureIsDefaultActor ? "人物简介" : "二次配置"}
              </Text>
            </TouchableOpacity>
            <View style={styles.moreMenuDivider} />
            <TouchableOpacity
              style={styles.moreMenuItem}
              onPress={pickChatBackgroundAndSave}
              disabled={uploadingChatBackground}
              activeOpacity={0.7}
            >
              {uploadingChatBackground ? (
                <ActivityIndicator size="small" color={theme.textPrimary} />
              ) : (
                <Ionicons
                  name="image-outline"
                  size={20}
                  color={theme.textPrimary}
                />
              )}
              <Text style={styles.moreMenuLabel}>更换聊天背景</Text>
            </TouchableOpacity>
            {user?.phone === "11111111111" && (
              <>
                <View style={styles.moreMenuDivider} />
                <TouchableOpacity
                  style={styles.moreMenuItem}
                  onPress={() => {
                    setMoreMenuVisible(false);
                    router.push({
                      pathname: "/(admin)/chat-console",
                      params: { conversation_id: id ?? "" },
                    });
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="chatbubbles-outline"
                    size={20}
                    color={theme.textPrimary}
                  />
                  <Text style={styles.moreMenuLabel}>在控制台打开</Text>
                </TouchableOpacity>
              </>
            )}
            <View style={styles.moreMenuDivider} />
            <View style={styles.moreMenuSwitchRow}>
              <View style={styles.moreMenuSwitchLeft}>
                <Ionicons
                  name="notifications-off-outline"
                  size={20}
                  color={theme.textPrimary}
                />
                <Text style={styles.moreMenuLabel}>消息免打扰</Text>
              </View>
              <Switch
                value={muteNotifications}
                onValueChange={handleToggleMute}
                trackColor={{ false: "#d9d9d9", true: theme.wechatGreen }}
                thumbColor="#ffffff"
              />
            </View>
            <View style={styles.moreMenuDivider} />
            <TouchableOpacity
              style={styles.moreMenuDelete}
              onPress={handleDeleteFriend}
              activeOpacity={0.7}
            >
              <Text style={styles.moreMenuDeleteText}>删除好友</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* new.md #2：50 条免费额度用完弹窗（/send 返回 422） */}
      <Modal
        visible={quotaUsedModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setQuotaUsedModalVisible(false)}
      >
        {renderPopupCard(
          <>
            <Text style={styles.popupTitle}>你的免费体验次数已经用完啦～</Text>
            <Text style={styles.popupText}>
              真的很感谢，你愿意陪小手机走到这里。{"\n"}
              你的每一次对话，都是 Wowwoo 变更好的底气。{"\n"}
              如果你愿意，把这份陪伴分享到抖音/小红书，{"\n"}
              分享成功，即可再领取 50 条免费额度，继续聊天。
            </Text>
            <View style={styles.popupBtnRow}>
              <TouchableOpacity
                style={[styles.popupBtn, styles.popupBtnPrimary]}
                activeOpacity={0.85}
                onPress={() => {
                  setQuotaUsedModalVisible(false);
                  setShareSupportModalVisible(true);
                }}
              >
                <Text style={styles.popupBtnPrimaryText}>
                  好的，我去分享支持
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.popupBtn, styles.popupBtnGhost]}
                activeOpacity={0.85}
                onPress={() => {
                  setQuotaUsedModalVisible(false);
                  openApiConfig();
                }}
              >
                <Text style={styles.popupBtnGhostText}>
                  不了，我用自己的 API
                </Text>
              </TouchableOpacity>
            </View>
          </>,
        )}
      </Modal>

      {/* new.md #3：去分享支持弹窗（粘贴链接） */}
      <Modal
        visible={shareSupportModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setShareSupportModalVisible(false)}
      >
        {renderPopupCard(
          <>
            <Text style={styles.popupTitle}>
              谢谢你愿意把 Wowwoo 分享给更多人。
            </Text>
            <Text style={styles.popupText}>
              请粘贴你的作品链接，审核通过后，{"\n"}
              会立即为你恢复 50 条对话额度。{"\n"}
              因为你的每一次认可，对我都格外重要。
            </Text>
            <TextInput
              value={shareLink}
              onChangeText={setShareLink}
              placeholder="粘贴作品链接（抖音/小红书）"
              placeholderTextColor={theme.pinkPlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.popupInput}
            />
            <View style={styles.popupBtnRow}>
              <TouchableOpacity
                style={[styles.popupBtn, styles.popupBtnPrimary]}
                activeOpacity={0.85}
                onPress={submitShareLink}
              >
                <Text style={styles.popupBtnPrimaryText}>提交</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.popupBtn, styles.popupBtnGhost]}
                activeOpacity={0.85}
                onPress={() => setShareSupportModalVisible(false)}
              >
                <Text style={styles.popupBtnGhostText}>取消</Text>
              </TouchableOpacity>
            </View>
          </>,
        )}
      </Modal>

      {/* new.md #5：分享续费的 50 条也用完后 */}
      <Modal
        visible={allFreeUsedModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAllFreeUsedModalVisible(false)}
      >
        {renderPopupCard(
          <>
            <Text style={styles.popupTitle}>
              我们所有免费体验的次数，已经全部用完啦。
            </Text>
            <Text style={styles.popupText}>
              真的特别感谢你，一路陪着还在成长的 Wowwoo 小手机。{"\n"}
              从一开始的 50 条，到你愿意分享支持，每一步我都记在心里。{"\n\n"}
              你后续要充值的 API 费用，并不是付给我们的，{"\n"}
              而是直接交给提供大模型服务的官方公司，用来支撑每一次对话的运行成本。
              {"\n\n"}
              我们不赚 API 的差价，也不搞套路收费。{"\n"}
              只是希望这个小小的、有温度的小手机，{"\n"}
              能一直安安静静、稳稳当当地陪在你身边。{"\n\n"}
              如果你也喜欢这份陪伴，就配置上你的专属 API 吧，{"\n"}
              往后的每一句聊天，我都会更用心地回应你。
            </Text>
            <View style={styles.popupBtnRow}>
              <TouchableOpacity
                style={[styles.popupBtn, styles.popupBtnPrimary]}
                activeOpacity={0.85}
                onPress={() => {
                  setAllFreeUsedModalVisible(false);
                  openApiConfig();
                }}
              >
                <Text style={styles.popupBtnPrimaryText}>前往配置 API</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.popupBtn, styles.popupBtnGhost]}
                activeOpacity={0.85}
                onPress={() => setAllFreeUsedModalVisible(false)}
              >
                <Text style={styles.popupBtnGhostText}>我知道了</Text>
              </TouchableOpacity>
            </View>
          </>,
        )}
      </Modal>

      <CustomizeAIModal
        visible={customizeAIModalVisible}
        onClose={() => {
          setCustomizeAIModalVisible(false);
          setReconfigureInitialData(null);
          // setReconfigureIsDefaultActor(false);
        }}
        onSubmit={handleReconfigure}
        submitting={reconfigureSubmitting}
        initialData={reconfigureInitialData}
        aiId={id ?? null}
        readOnly={reconfigureIsDefaultActor}
      />
    </KeyboardAvoidingView>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const EMOJI_LIST_PADDING_H = 8;
const EMOJI_ITEM_MARGIN = 4;
const EMOJI_COLS = 5;
const emojiItemSize = Math.floor(
  (SCREEN_WIDTH - EMOJI_LIST_PADDING_H - EMOJI_COLS * EMOJI_ITEM_MARGIN * 2) /
    EMOJI_COLS,
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.chatBg,
  },
  chatBgMask: {
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  listWrap: {
    flex: 1,
  },
  list: {
    flexGrow: 1,
    justifyContent: "flex-end",
    padding: 12,
    paddingBottom: 16,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.navTitlePink,
  },
  emptySub: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  loadingText: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  errorBar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#ffe6e6",
  },
  errorText: {
    fontSize: 12,
    color: "#c00",
  },
  timeRow: {
    alignItems: "center",
    marginVertical: 12,
  },
  timeText: {
    fontSize: 12,
    color: theme.textMuted,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  bubbleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  bubbleSpacer: {
    flex: 1,
    minWidth: 8,
  },
  msgAvatar: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: "#eee",
    marginHorizontal: 8,
  },
  bubbleWrap: {
    alignItems: "flex-start",
    maxWidth: "78%",
  },
  bubbleWrapMe: {
    alignItems: "flex-end",
  },
  bubble: {
    maxWidth: "100%",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: theme.bubbleLeftBg,
    ...theme.bubbleShadow,
  },
  bubbleMe: {
    backgroundColor: theme.bubbleRightBg,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 16,
    color: theme.textPrimary,
    lineHeight: 22,
  },
  bubbleTextMe: {
    color: theme.bubbleRightText,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 24 : 12,
    backgroundColor: "#f5f5f5",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e0e0e0",
    gap: 4,
  },
  toolBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  toolBtnActive: {
    backgroundColor: "rgba(7, 193, 96, 0.12)",
  },
  toolBtnSend: {
    paddingHorizontal: 0,
    minWidth: 40,
    flexShrink: 0,
  },
  sendLabel: {
    fontSize: 16,
    color: theme.wechatGreen,
    fontWeight: "500",
    flexShrink: 0,
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 96,
    backgroundColor: theme.cardBg,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 16,
    color: theme.textPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e0e0e0",
  },
  image: {
    width: 160,
    height: 160,
    borderRadius: 12,
    backgroundColor: "#ddd",
  },
  emojiBubble: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: "transparent",
  },
  videoPlaceholder: {
    width: 200,
    height: 120,
    borderRadius: 12,
    backgroundColor: "#e0e0e0",
    alignItems: "center",
    justifyContent: "center",
  },
  videoText: {
    fontSize: 12,
    color: theme.textMuted,
  },
  plusPanel: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 12,
    gap: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e0e0e0",
    backgroundColor: "#f5f5f5",
  },
  plusPanelItem: {
    alignItems: "center",
    minWidth: 64,
  },
  plusPanelIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: "#e8e8e8",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  plusPanelIcon: {
    fontSize: 28,
  },
  plusPanelLabel: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  emojiPanel: {
    borderTopWidth: 1,
    borderTopColor: "#eee",
    paddingVertical: 8,
    backgroundColor: "#fafafa",
  },
  emojiCategoryList: {
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  emojiCategoryItem: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
    backgroundColor: "#f0f0f0",
  },
  emojiCategoryItemActive: {
    backgroundColor: theme.wechatGreen,
  },
  emojiCategoryLabel: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  emojiCategoryLabelActive: {
    color: "#ffffff",
  },
  emojiListWrap: {
    height: 220,
  },
  emojiListScroll: {
    flexGrow: 0,
  },
  emojiList: {
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 8,
  },
  emojiItem: {
    width: emojiItemSize,
    height: emojiItemSize,
    borderRadius: emojiItemSize / 2,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    margin: EMOJI_ITEM_MARGIN,
  },
  emojiSymbol: {
    fontSize: Math.round(emojiItemSize * 0.5),
  },
  emojiImage: {
    width: Math.round(emojiItemSize * 0.7),
    height: Math.round(emojiItemSize * 0.7),
  },
  moreMenuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 56,
    paddingRight: 12,
  },
  moreMenuBox: {
    backgroundColor: theme.cardBg,
    borderRadius: 12,
    minWidth: 160,
    ...theme.bubbleShadow,
  },
  moreMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  moreMenuLabel: {
    fontSize: 16,
    color: theme.textPrimary,
  },
  moreMenuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.borderNav,
    marginLeft: 16,
  },
  moreMenuSwitchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  moreMenuSwitchLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  moreMenuDelete: {
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  moreMenuDeleteText: {
    fontSize: 16,
    color: "#ff4d4f",
  },

  // ---------- 免费额度弹窗样式 ----------
  popupMask: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
  },
  popupCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    ...theme.bubbleShadow,
  },
  popupTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: theme.textPrimary,
    lineHeight: 24,
  },
  popupText: {
    marginTop: 10,
    fontSize: 14,
    color: theme.textSecondary,
    lineHeight: 20,
  },
  popupInput: {
    marginTop: 12,
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.borderNav,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.textPrimary,
  },
  popupBtnRow: {
    marginTop: 14,
    gap: 10,
  },
  popupBtn: {
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  popupBtnPrimary: {
    backgroundColor: theme.wechatGreen,
  },
  popupBtnPrimaryText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  popupBtnGhost: {
    backgroundColor: "rgba(165,63,104,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(165,63,104,0.25)",
  },
  popupBtnGhostText: {
    color: theme.navTitlePink,
    fontSize: 15,
    fontWeight: "600",
  },
});
