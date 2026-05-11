import { useAuth } from '@/contexts/AuthContext';
import { theme } from '@/constants/theme';
import {
  EmojiItem,
  fetchEmojiCategories,
  fetchEmojiList,
  sendEmojiMessage,
  sendImageMessage,
} from '@/services/chat';
import { uploadAvatarFile } from '@/services/users';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { PreviewableImage } from '@/components/PreviewableImage';

/** 控制台接口返回的消息格式（与 chat_web.html 一致） */
type ConsoleMessage = {
  id: string;
  platform_sender_account_id: string;
  content_text?: string;
  platform_sent_at: string;
  message_type?: string;
  content_image_id?: string;
  content_emoji_url?: string;
};

const CHAT_CONSOLE_API_BASE =
  process.env.EXPO_PUBLIC_CHAT_CONSOLE_API_BASE || 'http://127.0.0.1:10053';
const POLL_INTERVAL_MS = 5000;

function buildConsoleUrl(
  apiBase: string,
  path: string,
  query: Record<string, string>
): string {
  const q = new URLSearchParams(query);
  return `${apiBase.replace(/\/$/, '')}${path}?${q.toString()}`;
}

export default function AdminChatConsoleScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    platform?: string;
    actor_id?: string;
    audience_id?: string;
    api_base?: string;
    conversation_id?: string;
  }>();

  const [urlPlatform, setUrlPlatform] = useState(params.platform ?? '');
  const [urlActorId, setUrlActorId] = useState(params.actor_id ?? '');
  const [urlAudienceId, setUrlAudienceId] = useState(params.audience_id ?? '');
  const [urlConversationId, setUrlConversationId] = useState(
    params.conversation_id ?? ''
  );
  const [urlApiBase, setUrlApiBase] = useState(
    params.api_base || CHAT_CONSOLE_API_BASE
  );

  useEffect(() => {
    if (params.platform != null) setUrlPlatform(params.platform);
    if (params.actor_id != null) setUrlActorId(params.actor_id);
    if (params.audience_id != null) setUrlAudienceId(params.audience_id);
    if (params.conversation_id != null)
      setUrlConversationId(params.conversation_id);
    if (params.api_base != null) setUrlApiBase(params.api_base);
  }, [
    params.platform,
    params.actor_id,
    params.audience_id,
    params.conversation_id,
    params.api_base,
  ]);

  const platform = urlPlatform.trim();
  const actorId = urlActorId.trim();
  const audienceId = urlAudienceId.trim();
  const apiBase =
    urlApiBase.trim().replace(/\/$/, '') ||
    CHAT_CONSOLE_API_BASE.replace(/\/$/, '');
  const conversationId = urlConversationId.trim();

  const [messages, setMessages] = useState<ConsoleMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [reachedTop, setReachedTop] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [resumeReason, setResumeReason] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [emojiList, setEmojiList] = useState<EmojiItem[]>([]);
  const [emojiCategories, setEmojiCategories] = useState<string[]>([]);
  const [selectedEmojiCategory, setSelectedEmojiCategory] = useState<
    string | null
  >(null);
  const [showEmojiPanel, setShowEmojiPanel] = useState(false);
  const [showPlusPanel, setShowPlusPanel] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesRef = useRef<ConsoleMessage[]>([]);
  messagesRef.current = messages;

  const canUseImageEmoji = Boolean(conversationId && user?.token);

  const appendMessages = useCallback(
    (msgs: ConsoleMessage[], toEnd: boolean) => {
      if (!msgs.length) return;
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        const filtered = msgs.filter((m) => !known.has(m.id));
        if (!filtered.length) return prev;
        return toEnd ? prev.concat(filtered) : filtered.concat(prev);
      });
      if (toEnd) {
        setTimeout(() => {
          scrollRef.current?.scrollToEnd?.({ animated: true });
        }, 100);
      }
    },
    []
  );

  const fetchLatest = useCallback(async () => {
    if (!platform || !actorId || !audienceId) return;
    const current = messagesRef.current;
    try {
      if (current.length === 0) {
        const url = buildConsoleUrl(apiBase, '/chat/messages', {
          platform,
          actor_id: actorId,
          audience_id: audienceId,
        });
        const res = await fetch(url);
        const data = await res.json();
        const list = (data.data || []) as ConsoleMessage[];
        appendMessages(list, true);
        return;
      }
      const last = current[current.length - 1];
      const url = buildConsoleUrl(apiBase, '/chat/messages', {
        platform,
        actor_id: actorId,
        audience_id: audienceId,
        anchor_time: last.platform_sent_at,
        direction: 'after',
      });
      const res = await fetch(url);
      const data = await res.json();
      appendMessages((data.data || []) as ConsoleMessage[], true);
    } catch (e) {
      setStatus(`拉取失败：${(e as Error).message}`);
    }
  }, [apiBase, platform, actorId, audienceId, appendMessages]);

  const fetchHistory = useCallback(async () => {
    if (loadingHistory || !messages.length) return;
    setLoadingHistory(true);
    const first = messages[0];
    const url = buildConsoleUrl(apiBase, '/chat/messages', {
      platform,
      actor_id: actorId,
      audience_id: audienceId,
      anchor_time: first.platform_sent_at,
      direction: 'before',
    });
    try {
      const res = await fetch(url);
      const data = await res.json();
      const list = (data.data || []) as ConsoleMessage[];
      appendMessages(list, false);
      if (!list.length) setReachedTop(true);
    } finally {
      setLoadingHistory(false);
    }
  }, [
    apiBase,
    platform,
    actorId,
    audienceId,
    messages.length,
    loadingHistory,
    appendMessages,
  ]);

  useEffect(() => {
    if (!platform || !actorId || !audienceId) {
      setStatus('缺少参数：platform / actor_id / audience_id');
      return;
    }
    setStatus('');
    fetchLatest();
    pollingRef.current = setInterval(fetchLatest, POLL_INTERVAL_MS);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [platform, actorId, audienceId, apiBase]);

  useEffect(() => {
    if (!user?.token) return;
    let isMounted = true;
    const load = async () => {
      try {
        const categories = await fetchEmojiCategories(user.token);
        if (!isMounted) return;
        setEmojiCategories(categories);
        const list = await fetchEmojiList(
          user.token,
          categories[0] ?? undefined
        );
        if (!isMounted) return;
        setEmojiList(list);
      } catch {
        // 静默
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [user?.token]);

  const handleEmojiCategoryPress = useCallback(
    async (categoryId: string | null) => {
      if (!user?.token) return;
      setSelectedEmojiCategory(categoryId);
      try {
        const list = await fetchEmojiList(user.token, categoryId ?? undefined);
        setEmojiList(list);
      } catch {
        // 静默
      }
    },
    [user?.token]
  );

  const sendReply = useCallback(async () => {
    const text = replyText.trim();
    if (!text || !platform || !actorId || !audienceId) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/chat/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          actor_id: actorId,
          audience_id: audienceId,
          message_type: 'text',
          content_text: text,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setReplyText('');
      setStatus('已发送');
      await fetchLatest();
    } catch (e) {
      setError(`发送失败：${(e as Error).message}`);
    } finally {
      setSending(false);
    }
  }, [apiBase, platform, actorId, audienceId, replyText, fetchLatest]);

  const sendHumanResume = useCallback(async () => {
    const reason = resumeReason.trim();
    if (!reason || !platform || !actorId || !audienceId) {
      setStatus('请填写退出 human_mode 的理由');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/chat/human_resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          actor_id: actorId,
          audience_id: audienceId,
          reason,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setResumeReason('');
      setStatus('已提交 human_resume');
    } catch (e) {
      setError(`human_resume 失败：${(e as Error).message}`);
    } finally {
      setSending(false);
    }
  }, [apiBase, platform, actorId, audienceId, resumeReason]);

  const pickImageAndSend = useCallback(async () => {
    if (!conversationId || !user?.token) return;

    // 原生端优先使用 ImagePicker 裁剪，Web 端继续用 DocumentPicker
    if (Platform.OS !== 'web') {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setError('需要相册权限才能选择图片');
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
      const file = {
        uri: asset.uri,
        name:
          asset.fileName ??
          `console_image_${Date.now()}_${Math.random()
            .toString(16)
            .slice(2)}.jpg`,
        type: asset.mimeType ?? 'image/jpeg',
      };
      setSending(true);
      setError(null);
      try {
        const uploadResult = await uploadAvatarFile(user.token, file, {
          compress: true,
        });
        if (!uploadResult?.imageId) {
          setError('图片上传失败，请重试');
          return;
        }
        await sendImageMessage(
          conversationId,
          uploadResult.imageId,
          user.token,
          { localUri: uploadResult.localUri }
        );
        setStatus('图片已发送');
        await fetchLatest();
      } catch (e) {
        setError((e as Error).message || '发送图片失败');
      } finally {
        setSending(false);
      }
      return;
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const file = (result as any).output?.[0] ?? {
      uri: asset.uri,
      name: asset.name,
    };
    setSending(true);
    setError(null);
    try {
      const uploadResult = await uploadAvatarFile(user.token, file, {
        compress: true,
      });
      if (!uploadResult?.imageId) {
        setError('图片上传失败，请重试');
        return;
      }
      await sendImageMessage(conversationId, uploadResult.imageId, user.token, {
        localUri: uploadResult.localUri,
      });
      setStatus('图片已发送');
      await fetchLatest();
    } catch (e) {
      setError((e as Error).message || '发送图片失败');
    } finally {
      setSending(false);
    }
  }, [conversationId, user?.token, fetchLatest]);

  const sendEmoji = useCallback(
    async (emoji: EmojiItem) => {
      const emojiUrl = emoji.url || '';
      if (!emojiUrl || !conversationId || !user?.token) return;
      setSending(true);
      setError(null);
      try {
        await sendEmojiMessage(conversationId, emojiUrl, user.token);
        setShowEmojiPanel(false);
        setStatus('表情已发送');
        await fetchLatest();
      } catch (e) {
        setError((e as Error).message || '发送表情失败');
      } finally {
        setSending(false);
      }
    },
    [conversationId, user?.token, fetchLatest]
  );

  const closePanels = useCallback(() => {
    setShowEmojiPanel(false);
    setShowPlusPanel(false);
  }, []);

  const meta = `${platform || '-'} | ${actorId || '-'} -> ${audienceId || '-'}`;
  const hasParams = Boolean(platform && actorId && audienceId);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <View style={styles.metaBar}>
        <Text style={styles.metaText} numberOfLines={1}>
          {meta}
        </Text>
        {conversationId ? (
          <Text style={styles.metaHint}>已关联个聊，可发图片/表情</Text>
        ) : (
          <Text style={styles.metaHint}>
            填写下方 conversation_id 可发图片与表情
          </Text>
        )}
      </View>

      <View style={styles.paramsForm}>
        <Text style={styles.paramsLabel}>platform</Text>
        <TextInput
          style={styles.paramsInput}
          value={urlPlatform}
          onChangeText={setUrlPlatform}
          placeholder="如 wechat"
          placeholderTextColor={theme.pinkPlaceholder}
        />
        <Text style={styles.paramsLabel}>actor_id</Text>
        <TextInput
          style={styles.paramsInput}
          value={urlActorId}
          onChangeText={setUrlActorId}
          placeholder="管理员账号"
          placeholderTextColor={theme.pinkPlaceholder}
        />
        <Text style={styles.paramsLabel}>audience_id</Text>
        <TextInput
          style={styles.paramsInput}
          value={urlAudienceId}
          onChangeText={setUrlAudienceId}
          placeholder="对方账号"
          placeholderTextColor={theme.pinkPlaceholder}
        />
        <Text style={styles.paramsLabel}>
          conversation_id（个聊会话 id，用于发图/表情）
        </Text>
        <TextInput
          style={styles.paramsInput}
          value={urlConversationId}
          onChangeText={setUrlConversationId}
          placeholder="可选，从聊天页进入时带 id"
          placeholderTextColor={theme.pinkPlaceholder}
        />
        <Text style={styles.paramsLabel}>api_base（控制台后端）</Text>
        <TextInput
          style={styles.paramsInput}
          value={urlApiBase}
          onChangeText={setUrlApiBase}
          placeholder={CHAT_CONSOLE_API_BASE}
          placeholderTextColor={theme.pinkPlaceholder}
        />
      </View>

      {error ? (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        style={styles.chatScroll}
        contentContainerStyle={styles.chatContent}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          if (y < 80 && !reachedTop && !loadingHistory) fetchHistory();
        }}
        scrollEventThrottle={200}
      >
        {messages.map((msg) => {
          const isOut = msg.platform_sender_account_id === actorId;
          const content =
            msg.content_text ??
            (msg.message_type === 'image'
              ? '[图片]'
              : msg.message_type === 'emoji'
                ? '[表情]'
                : msg.message_type === 'voice'
                  ? '[语音]'
                  : '[非文本]');
          return (
            <Animated.View
              key={msg.id}
              entering={FadeInDown.duration(200)}
              style={[
                styles.bubble,
                isOut ? styles.bubbleOut : styles.bubbleIn,
              ]}
            >
              <Text style={styles.bubbleText}>{content}</Text>
              <Text style={styles.bubbleMeta}>
                {new Date(msg.platform_sent_at).toLocaleString()}
              </Text>
            </Animated.View>
          );
        })}
        {loadingHistory ? (
          <View style={styles.loadingMore}>
            <ActivityIndicator size="small" color={theme.textMuted} />
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="输入回复..."
          placeholderTextColor={theme.pinkPlaceholder}
          value={replyText}
          onChangeText={setReplyText}
          multiline
          maxLength={2000}
          editable={hasParams && !sending}
        />
        <TouchableOpacity
          style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
          onPress={sendReply}
          disabled={!hasParams || sending}
          activeOpacity={0.7}
        >
          <Text style={styles.sendBtnText}>发送</Text>
        </TouchableOpacity>
      </View>

      {canUseImageEmoji && (
        <View style={styles.toolRow}>
          <TouchableOpacity
            style={[styles.toolBtn, showPlusPanel && styles.toolBtnActive]}
            onPress={() => {
              setShowPlusPanel((v) => !v);
              if (!showPlusPanel) setShowEmojiPanel(false);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={24} color={theme.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toolBtn, showEmojiPanel && styles.toolBtnActive]}
            onPress={() => {
              setShowEmojiPanel((v) => !v);
              if (!showEmojiPanel) setShowPlusPanel(false);
            }}
            activeOpacity={0.7}
          >
            <Ionicons
              name="happy-outline"
              size={24}
              color={theme.textSecondary}
            />
          </TouchableOpacity>
        </View>
      )}

      {showPlusPanel && canUseImageEmoji && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
          style={styles.plusPanel}
        >
          <TouchableOpacity
            style={styles.plusItem}
            onPress={() => {
              closePanels();
              pickImageAndSend();
            }}
            disabled={sending}
            activeOpacity={0.7}
          >
            <Text style={styles.plusIcon}>🖼</Text>
            <Text style={styles.plusLabel}>相册</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {showEmojiPanel && emojiList.length > 0 && canUseImageEmoji && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
          style={styles.emojiPanel}
        >
          <FlatList
            horizontal
            data={['all', ...emojiCategories]}
            keyExtractor={(item) => item}
            contentContainerStyle={styles.emojiCategoryList}
            renderItem={({ item }) => {
              const isAll = item === 'all';
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
          <FlatList
            data={emojiList}
            keyExtractor={(item) => item.id}
            numColumns={5}
            contentContainerStyle={styles.emojiList}
            style={styles.emojiListScroll}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.emojiItem}
                onPress={() => sendEmoji(item)}
                disabled={sending}
                activeOpacity={0.7}
              >
                {item.url ? (
                  <PreviewableImage
                    source={{ uri: item.url }}
                    style={styles.emojiImage}
                    accessibilityLabel="表情"
                  />
                ) : (
                  <Text style={styles.emojiSymbol}>{item.symbol ?? ''}</Text>
                )}
              </TouchableOpacity>
            )}
          />
        </Animated.View>
      )}

      <View style={styles.resumeBlock}>
        <TextInput
          style={styles.input}
          placeholder="退出 human_mode 的理由..."
          placeholderTextColor={theme.pinkPlaceholder}
          value={resumeReason}
          onChangeText={setResumeReason}
          editable={hasParams && !sending}
        />
        <TouchableOpacity
          style={[styles.resumeBtn, sending && styles.sendBtnDisabled]}
          onPress={sendHumanResume}
          disabled={!hasParams || sending}
          activeOpacity={0.7}
        >
          <Text style={styles.resumeBtnText}>退出 human_mode</Text>
        </TouchableOpacity>
      </View>

      {status ? (
        <Text style={styles.status} numberOfLines={1}>
          {status}
        </Text>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const EMOJI_PADDING = 8;
const EMOJI_MARGIN = 4;
const EMOJI_COLS = 5;
const emojiItemSize = Math.floor(
  (SCREEN_WIDTH - EMOJI_PADDING - EMOJI_COLS * EMOJI_MARGIN * 2) / EMOJI_COLS
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.chatBg,
  },
  metaBar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
    backgroundColor: theme.cardBg,
  },
  metaText: {
    fontSize: 12,
    color: theme.textMuted,
  },
  metaHint: {
    fontSize: 11,
    color: theme.textMuted,
    marginTop: 2,
  },
  errorBar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffe6e6',
  },
  errorText: {
    fontSize: 12,
    color: '#c00',
  },
  chatScroll: {
    flex: 1,
  },
  chatContent: {
    padding: 12,
    paddingBottom: 16,
  },
  bubble: {
    maxWidth: '80%',
    padding: 10,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  bubbleIn: {
    alignSelf: 'flex-start',
    backgroundColor: theme.bubbleLeftBg ?? '#f0f0f0',
  },
  bubbleOut: {
    alignSelf: 'flex-end',
    backgroundColor: theme.bubbleRightBg ?? '#e3f2fd',
  },
  bubbleText: {
    fontSize: 15,
    color: theme.textPrimary,
    lineHeight: 20,
  },
  bubbleMeta: {
    fontSize: 11,
    color: theme.textMuted,
    marginTop: 4,
  },
  loadingMore: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    backgroundColor: theme.cardBg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.textPrimary,
    borderWidth: 1,
    borderColor: theme.border,
  },
  sendBtn: {
    backgroundColor: theme.wechatGreen,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.6,
  },
  sendBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
    backgroundColor: theme.cardBg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
  },
  toolBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolBtnActive: {
    backgroundColor: 'rgba(255,127,181,0.2)',
  },
  plusPanel: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 16,
    backgroundColor: '#fafafa',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
  },
  plusItem: {
    alignItems: 'center',
    minWidth: 64,
  },
  plusIcon: {
    fontSize: 28,
  },
  plusLabel: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 4,
  },
  emojiPanel: {
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingVertical: 8,
    backgroundColor: '#fafafa',
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
    backgroundColor: '#f0f0f0',
  },
  emojiCategoryItemActive: {
    backgroundColor: theme.wechatGreen,
  },
  emojiCategoryLabel: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  emojiCategoryLabelActive: {
    color: '#fff',
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
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    margin: EMOJI_MARGIN,
  },
  emojiSymbol: {
    fontSize: Math.round(emojiItemSize * 0.5),
  },
  emojiImage: {
    width: Math.round(emojiItemSize * 0.7),
    height: Math.round(emojiItemSize * 0.7),
  },
  resumeBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: theme.cardBg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
  },
  resumeBtn: {
    backgroundColor: theme.wechatGreen,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    justifyContent: 'center',
  },
  resumeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  status: {
    fontSize: 12,
    color: theme.textMuted,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  paramsForm: {
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
    backgroundColor: '#fafafa',
  },
  paramsLabel: {
    fontSize: 11,
    color: theme.textMuted,
    marginTop: 8,
    marginBottom: 2,
  },
  paramsInput: {
    backgroundColor: theme.cardBg,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: theme.textPrimary,
  },
});
