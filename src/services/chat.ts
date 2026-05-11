import { apiRequest, BASE_URL, buildImageUrlFromKey } from "./api";

type SendFailedPayload = {
  status?: string;
  has_claimed_share_freecall?: boolean;
  [k: string]: any;
};

function shouldMockSendQuotaExhausted(): boolean {
  // 可视化测试：开发环境下默认 mock /send 返回“发送失败”
  // 关闭方式：.env.local 设置 EXPO_PUBLIC_MOCK_SEND_QUOTA=0
  return typeof __DEV__ !== "undefined" && __DEV__
    ? process.env.EXPO_PUBLIC_MOCK_SEND_QUOTA !== "0"
    : false;
}

function parseSendFailed(res: unknown): SendFailedPayload | null {
  if (!res || typeof res !== "object") return null;
  const status = (res as any).status;
  if (status !== "发送失败") return null;
  return res as SendFailedPayload;
}

function throwFreeCallExhausted(payload: SendFailedPayload) {
  const claimed = payload.has_claimed_share_freecall;
  throw {
    message: "免费额度已用完",
    code: "FREE_CALL_EXHAUSTED",
    hasClaimedShareFreecall: typeof claimed === "boolean" ? claimed : undefined,
    payload,
  };
}

export type ChatSummary = {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  time: string;
  unread?: number;
};

export type ChatMessageType = "text" | "image" | "video" | "voice" | "emoji";

export type ChatMessage = {
  id: string;
  type: ChatMessageType;
  text?: string;
  mediaUrl?: string;
  /** 上传后优先用本地 uri 展示，避免远端首次加载慢导致白屏 */
  localImageUri?: string;
  thumbnailUrl?: string;
  isMine: boolean;
  createdAt: string;
  /** 用于 history(platform_message_id) 与 MQTT(id) 跨源去重 */
  platformMessageId?: string;
};

export type MqttConnectionInfo = {
  wsUrl: string;
  topic: string;
  clientId: string;
  username?: string;
  password?: string;
};

export type EmojiItem = {
  id: string;
  name?: string;
  url?: string;
  symbol?: string;
  imageUrl?: string;
};

export type EmojiCategory = {
  id: number | string;
  name: string;
  icon?: string | null;
};

// ---------- 后端 API 类型 ----------

type BackendChatSession = {
  id: string | number;
  user_id: string;
  /** 旧版字段（部分环境仍返回） */
  session_id?: string;
  /** 旧版字段（部分环境仍返回） */
  title?: string;
  /** 新版字段（截图文档） */
  name?: string;
  avatar?: string | null;
  unread_message_count?: number | null;
  last_message?: string | null;
  status?: string;
  created_at: string;
  updated_at: string;
};

/** 单条会话详情（GET /api/v1/user-chat-sessions/{id}），含 AI 配置字段 */
export type BackendSessionDetail = BackendChatSession & {
  /** 是否为默认角色（系统预设），为 true 时前端仅展示头像/名称/描述，不可编辑 */
  isDefaultActor?: boolean | null;
  /** 聊天背景：后端可能返回 snake_case / camelCase，这里都兼容 */
  chat_background_uri?: string | null;
  chatBackgroundUri?: string | null;
  worldview?: string | null;
  identity?: string | null;
  hobbies?: string | null;
  personality?: string | null;
  description?: string | null;
  world_book_keywords?: { name: string; description: string }[] | null;
  worldBookKeywords?: { name: string; description: string }[] | null;
  enableActionSceneDescription?: boolean | null;
};

type BackendEmoji = {
  id: number;
  name: string;
  emoji: string;
  category?: string;
  url?: string;
};

type BackendEmojiCategory = {
  id: number | string;
  name: string;
  icon?: string | null;
};

const DEFAULT_AVATAR = "https://api.dicebear.com/7.x/avataaars/svg?seed=chat";

function formatSessionTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.floor((today.getTime() - dDate.getTime()) / 86400000);
    const h = d.getHours();
    const m = d.getMinutes();
    const hm = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
    if (dDate.getTime() === today.getTime()) return hm;
    if (dDate.getTime() === yesterday.getTime()) return "昨天";
    if (diffDays < 7)
      return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][
        d.getDay()
      ];
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return "";
  }
}

function mapSessionToSummary(s: BackendChatSession): ChatSummary {
  let avatar = s.avatar ?? DEFAULT_AVATAR;
  if (avatar.startsWith("/")) {
    avatar = `${BASE_URL.replace(/\/$/, "")}${avatar}`;
  }
  const sessionKey = String(s.session_id ?? s.id);
  const displayName = s.name || s.title || sessionKey;
  return {
    id: sessionKey,
    name: displayName,
    avatar,
    lastMessage: s.last_message ?? "",
    time: formatSessionTime(s.updated_at),
    unread: s.unread_message_count ?? 0,
  };
}

/** 将 avatar（可能是 image_id）解析为可访问的临时链接 */
async function resolveSessionAvatar(
  token: string,
  avatar: string,
): Promise<string> {
  if (avatar.startsWith("http")) return avatar;
  // if (avatar.startsWith("/"))
  // return `${BASE_URL.replace(/\/$/, "")}${avatar}`;
  const url = buildImageUrlFromKey(avatar);
  return url ? toAbsUrl(url) : avatar;
}

// ---------- 会话列表与摘要（对接 GET /api/v1/user-chat-sessions/） ----------

/** 获取当前用户的会话列表 - GET /api/v1/user-chat-sessions/ */
export async function fetchChatList(
  token: string,
  params?: { skip?: number; limit?: number },
): Promise<ChatSummary[]> {
  const qs = new URLSearchParams();
  if (params?.skip != null) qs.set("skip", String(params.skip));
  if (params?.limit != null) qs.set("limit", String(params.limit));
  const query = qs.toString();
  const path = query
    ? `/api/v1/user-chat-sessions/?${query}`
    : "/api/v1/user-chat-sessions/";
  const list = await apiRequest<BackendChatSession[]>(path, {
    method: "GET",
    token,
  });
  const summaries = (list || []).map(mapSessionToSummary);
  const avatarCache = new Map<string, Promise<string>>();
  return Promise.all(
    summaries.map(async (s) => {
      const resolved =
        avatarCache.get(s.avatar) ?? resolveSessionAvatar(token, s.avatar);
      if (!avatarCache.has(s.avatar)) avatarCache.set(s.avatar, resolved);
      const avatar = await resolved;
      return { ...s, avatar };
    }),
  );
}

/** 创建聊天会话（智能体）- POST /api/v1/user-chat-sessions/，请求体与 API 文档一致 */
export type WorldBookKeywordPayload = {
  name: string;
  description: string;
};

export type CreateSessionPayload = {
  name?: string;
  avatarUri?: string;
  /** 聊天背景：image_id（推荐）或完整 URL */
  chatBackgroundUri?: string;
  worldview?: string;
  identity?: string;
  hobbies?: string;
  personality?: string;
  description?: string;
  worldBookKeywords?: WorldBookKeywordPayload[];
  enableActionSceneDescription?: boolean;
};

export type CreateSessionResult = {
  id: string;
  user_id: string;
  session_id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export async function createChatSession(
  token: string,
  payload: CreateSessionPayload,
): Promise<CreateSessionResult> {
  const res = await apiRequest<CreateSessionResult>("/api/v1/user-chat-sessions/", {
    method: "POST",
    token,
    body: payload,
  });
  return (res ?? ({} as any)) as CreateSessionResult;
}

/** 删除聊天会话 - DELETE /api/v1/user-chat-sessions/{session_id} */
export async function deleteChatSession(
  token: string,
  sessionId: string,
): Promise<{ id: number; session_id: string; status: string }> {
  const res = await apiRequest(
    `/api/v1/user-chat-sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "DELETE",
      token,
    },
  );
  return (res ?? ({} as any)) as any;
}

/** 根据会话 id（session_id）获取会话摘要 */
export async function fetchChatSummary(
  chatId: string,
  token: string,
): Promise<ChatSummary | null> {
  const list = await apiRequest<BackendChatSession[]>(
    "/api/v1/user-chat-sessions/",
    { method: "GET", token },
  );
  const session = (list || []).find((s) => {
    const key = String(s.session_id ?? s.id);
    return key === String(chatId);
  });
  if (!session) return null;
  const summary = mapSessionToSummary(session);
  const avatar = await resolveSessionAvatar(token, summary.avatar);
  return { ...summary, avatar };
}

/** 获取单条会话详情（含 AI 配置）- GET /api/v1/user-chat-sessions/{id} */
export async function fetchChatSessionDetail(
  chatId: string,
  token: string,
): Promise<BackendSessionDetail | null> {
  try {
    const raw = await apiRequest<BackendSessionDetail>(
      `/api/v1/user-chat-sessions/${encodeURIComponent(chatId)}`,
      { method: "GET", token },
    );
    if (!raw) return null;
    // const avatarResolved = await resolveSessionAvatar(
    //   token,
    //   raw.avatar ?? DEFAULT_AVATAR,
    // );
    return { ...raw };
  } catch {
    return null;
  }
}

/** 更新当前会话 AI 配置 - PUT /api/v1/user-chat-sessions/{id} */
export async function updateChatSession(
  token: string,
  chatId: string,
  payload: CreateSessionPayload,
): Promise<BackendSessionDetail> {
  const res = await apiRequest<BackendSessionDetail>(
    `/api/v1/user-chat-sessions/${encodeURIComponent(chatId)}`,
    {
      method: "PUT",
      token,
      body: payload,
    },
  );
  return (res ?? ({} as any)) as BackendSessionDetail;
}

// ---------- 历史消息（对接 GET /api/v1/messages/history） ----------

type BackendHistoryMessage = Record<string, any> & {
  id?: string | number;
  message_id?: string | number;
  msg_id?: string | number;
  conversation_id?: number;
  platform_message_id?: string;

  /** 发送者 ID（UUID），与当前用户 id 比较可判断 isMine */
  sender_id?: string;

  role?: string;
  sender?: string;
  from?: string;
  is_user?: boolean;
  isMine?: boolean;

  type?: string;
  message_type?: string;
  content_type?: string;

  /** 新版 history 接口：文本内容 */
  content_text?: string;
  content_raw?: { content_text?: string; message_type?: string };

  text?: string;
  content?: string;
  message?: string;
  msg?: string;
  prompt?: string;
  answer?: string;

  created_at?: string | number;
  create_at?: string | number; // GET /api/v1/messages/ 新消息接口返回
  createdAt?: string | number;
  platform_sent_at?: string;
  time?: string | number;
  timestamp?: string | number;

  media_url?: string;
  mediaUrl?: string;
  url?: string;
  image_url?: string;
  video_url?: string;
  voice_url?: string;
  image?: string;
  video?: string;
};

export type BackendIncomingMessage = BackendHistoryMessage;

function normalizeIso(v: unknown): string {
  if (v == null) return new Date().toISOString();
  if (typeof v === "number" && Number.isFinite(v)) {
    // 兼容秒级/毫秒级时间戳
    const ms = v < 1e12 ? v * 1000 : v;
    return new Date(ms).toISOString();
  }
  const s = String(v);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return new Date().toISOString();
}

function toAbsUrl(u: string): string {
  if (!u) return u;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/")) return `${BASE_URL.replace(/\/$/, "")}${u}`;
  return u;
}

function extractImageIdFromHistoryItem(item: BackendHistoryMessage): string {
  const candidate = String(
    item.content ??
      item.content_text ??
      item.content_raw?.content_text ??
      item.text ??
      item.message ??
      item.msg ??
      "",
  ).trim();
  return candidate;
}

export function mapBackendMessageToChatMessage(
  item: BackendHistoryMessage,
  idx: number,
  userId?: string,
): ChatMessage | null {
  if (!item || typeof item !== "object") return null;

  const createdAt = normalizeIso(
    item.created_at ??
      item.create_at ??
      item.createdAt ??
      item.platform_sent_at ??
      item.time ??
      item.timestamp,
  );
  const id = String(
    item.id ??
      item.platform_message_id ??
      item.message_id ??
      item.msg_id ??
      `${createdAt}-${idx}`,
  );
  // history 用 platform_message_id，MQTT 用 id，统一存一份用于跨源去重
  const platformMessageIdRaw =
    item.platform_message_id != null
      ? String(item.platform_message_id).trim()
      : item.id != null
        ? String(item.id).trim()
        : item.message_id != null
          ? String(item.message_id).trim()
          : "";
  const platformMessageId =
    platformMessageIdRaw === "" ? undefined : platformMessageIdRaw;

  // 优先用 sender_id 与当前用户 id 比较判断是否为自己发送
  let isMine = false;
  if (userId != null && item.sender_id != null) {
    isMine = String(item.sender_id).trim() === String(userId).trim();
  } else {
    const role = String(item.role ?? item.sender ?? item.from ?? "")
      .trim()
      .toLowerCase();
    isMine =
      item.isMine === true ||
      item.is_user === true ||
      role === "user" ||
      role === "human";
  }

  const rawType = String(
    item.type ?? item.message_type ?? item.content_type ?? "",
  )
    .trim()
    .toLowerCase();

  const hasImage =
    rawType.includes("image") || !!item.image_url || !!item.image;
  const hasVideo =
    rawType.includes("video") || !!item.video_url || !!item.video;
  const messageTypeNorm = String(item.message_type ?? "")
    .trim()
    .toLowerCase();
  const hasVoice =
    messageTypeNorm === "voice" ||
    rawType === "voice" ||
    !!item.voice_url;
  const hasEmoji = rawType.includes("emoji");

  let type: ChatMessageType = "text";
  if (hasImage) type = "image";
  else if (hasVideo) type = "video";
  else if (hasVoice) type = "voice";
  else if (hasEmoji) type = "emoji";

  // 新版 history 接口使用 content_text，兼容 content_raw.content_text
  const text = String(
    item.content_text ??
      item.content_raw?.content_text ??
      item.text ??
      item.content ??
      item.message ??
      item.msg ??
      item.prompt ??
      item.answer ??
      "",
  );

  const voiceUrlRaw = String(
    item.content ??
      item.content_text ??
      item.content_raw?.content_text ??
      item.voice_url ??
      item.media_url ??
      item.mediaUrl ??
      item.url ??
      "",
  ).trim();

  const mediaUrlRaw = String(
    item.media_url ??
      item.mediaUrl ??
      item.url ??
      item.image_url ??
      item.video_url ??
      item.image ??
      item.video ??
      (type === "emoji" ? String(item.content ?? "") : ""),
  ).trim();
  const mediaUrl = mediaUrlRaw
    ? toAbsUrl(mediaUrlRaw)
    : type === "emoji" && text.startsWith("http")
      ? toAbsUrl(text)
      : undefined;

  const base = {
    id,
    platformMessageId,
    isMine,
    createdAt,
  };
  if (type === "text") {
    return { ...base, type: "text", text };
  }
  if (type === "voice") {
    const u = voiceUrlRaw || mediaUrlRaw;
    return {
      ...base,
      type: "voice",
      mediaUrl: u ? toAbsUrl(u) : undefined,
    };
  }
  return { ...base, type, mediaUrl };
}

async function resolveImageForChatMessage(
  src: BackendHistoryMessage,
  msg: ChatMessage,
): Promise<ChatMessage> {
  if (msg.type !== "image" || msg.mediaUrl) return msg;
  const imageIdOrUrl = extractImageIdFromHistoryItem(src);
  if (!imageIdOrUrl) return msg;
  if (/^https?:\/\//i.test(imageIdOrUrl) || imageIdOrUrl.startsWith("/")) {
    return { ...msg, mediaUrl: toAbsUrl(imageIdOrUrl) };
  }
  const resolved = buildImageUrlFromKey(imageIdOrUrl);
  return resolved ? { ...msg, mediaUrl: toAbsUrl(resolved) } : msg;
}

async function resolveVoiceForChatMessage(
  src: BackendHistoryMessage,
  msg: ChatMessage,
): Promise<ChatMessage> {
  if (msg.type !== "voice" || msg.mediaUrl) return msg;
  const u = String(
    src.content ??
      src.content_text ??
      src.content_raw?.content_text ??
      src.voice_url ??
      src.media_url ??
      src.mediaUrl ??
      src.url ??
      "",
  ).trim();
  return u ? { ...msg, mediaUrl: toAbsUrl(u) } : msg;
}

export async function mapBackendMessagesToChatMessages(
  raw: unknown,
  userId: string,
): Promise<ChatMessage[]> {
  const list: BackendHistoryMessage[] = [
    (raw as any).data as BackendHistoryMessage,
  ];

  const pairs = list
    .map((it, idx) => ({
      src: it,
      msg: mapBackendMessageToChatMessage(it, idx, userId),
    }))
    .filter((p) => Boolean(p.msg)) as {
    src: BackendHistoryMessage;
    msg: ChatMessage;
  }[];

  const mapped = (
    await Promise.all(
      pairs.map(async ({ src, msg }) => {
        const afterImage = await resolveImageForChatMessage(src, msg);
        return resolveVoiceForChatMessage(src, afterImage);
      }),
    )
  ).filter(Boolean) as ChatMessage[];

  mapped.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  return mapped;
}

type FetchHistoryParams = {
  /** 分页：从该时间点（含/不含取决于后端实现）往前拉取 */
  endAt?: string;
  /** 返回消息总数量，默认 100 */
  limit?: number;
};

/** 获取单个会话（id）的历史消息 - GET /api/v1/messages/history */
export async function fetchChatMessages(
  chatId: string,
  token: string,
  params?: FetchHistoryParams & { userId?: string },
): Promise<ChatMessage[]> {
  const qs = new URLSearchParams();
  qs.set("id", String(chatId));
  if (params?.endAt) qs.set("end_at", params.endAt);
  qs.set("limit", String(params?.limit ?? 100));

  const raw = await apiRequest<any>(
    `/api/v1/messages/history?${qs.toString()}`,
    {
      method: "GET",
      token,
    },
  );
  if (!raw) return [];

  // 调试：接口返回的原始数据
  if (__DEV__) {
    console.log("[chat] history 接口原始数据", raw);
  }

  const list: BackendHistoryMessage[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.data)
      ? raw.data
      : Array.isArray(raw?.messages)
        ? raw.messages
        : [];

  const userId = params?.userId;
  const pairs = list
    .map((it, idx) => ({
      src: it,
      msg: mapBackendMessageToChatMessage(it, idx, userId),
    }))
    .filter((p) => Boolean(p.msg)) as {
    src: BackendHistoryMessage;
    msg: ChatMessage;
  }[];

  // 图片消息：history 里 content 往往是 imageId，需要转换为临时可访问链接
  const mapped = (
    await Promise.all(
      pairs.map(async ({ src, msg }) => {
        const afterImage = await resolveImageForChatMessage(src, msg);
        return resolveVoiceForChatMessage(src, afterImage);
      }),
    )
  ).filter(Boolean) as ChatMessage[];

  // UI 按数组顺序渲染；这里统一按时间升序，避免后端返回倒序导致“时间戳插入”错位
  mapped.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  return mapped;
}

/** 获取新消息 - GET /api/v1/messages/?id= 轮询用，返回与 history 同结构的 ChatMessage[] */
export async function fetchNewMessages(
  chatId: string,
  token: string,
  userId: string,
): Promise<ChatMessage[]> {
  const raw = await apiRequest<BackendHistoryMessage[]>(
    `/api/v1/messages/?id=${encodeURIComponent(chatId)}`,
    { method: "GET", token },
  );
  if (!raw) return [];
  return mapBackendMessagesToChatMessages(raw, userId);
}

/** 获取 MQTT over WebSocket 连接信息 - GET /api/v1/messages/mqtt/connection?id= */
export async function fetchMqttConnection(
  chatId: string,
  token: string,
): Promise<MqttConnectionInfo> {
  const raw = await apiRequest<any>(
    `/api/v1/messages/mqtt/connection?id=${encodeURIComponent(chatId)}`,
    { method: "GET", token },
  );
  if (!raw) {
    throw {
      message: "获取 MQTT 连接信息失败",
      payload: raw,
    };
  }
  const wsUrl = String(raw?.ws_url ?? raw?.wsUrl ?? raw?.url ?? "").trim();
  const topic = String(raw?.topic ?? "").trim();
  const clientId = String(raw?.client_id ?? raw?.clientId ?? "").trim();
  const username =
    raw?.username != null ? String(raw.username).trim() : undefined;
  const password =
    raw?.password != null ? String(raw.password).trim() : undefined;
  if (!wsUrl || !topic || !clientId) {
    throw {
      message: "MQTT 连接信息缺失（ws_url/topic/client_id）",
      payload: raw,
    };
  }
  return { wsUrl, topic, clientId, username, password };
}

type SendTextPayload = {
  type: "text";
  text: string;
};

type SendMediaParams = {
  chatId: string;
  token: string;
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  mediaType: Exclude<ChatMessageType, "text">;
};

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 发送消息请求体 - 对应 POST /api/v1/messages/send */
type SendMessagePayload = {
  conversation_id: string;
  content: string;
  message_type: string;
  platform: string;
};

/** 发送文本消息 - 调用 POST /api/v1/messages/send */
export async function sendTextMessage(
  chatId: string,
  payload: SendTextPayload,
  token: string,
): Promise<ChatMessage> {
  if (shouldMockSendQuotaExhausted()) {
    // 默认 mock 为“还未领取分享免费次数”，用于走 new.md 第2步弹窗
    throwFreeCallExhausted({
      status: "发送失败",
      has_claimed_share_freecall:
        process.env.EXPO_PUBLIC_MOCK_SEND_CLAIMED === "1",
    });
  }
  const body: SendMessagePayload = {
    conversation_id: chatId,
    content: payload.text,
    message_type: "text",
    platform: "wowwoo",
  };
  const res = await apiRequest<any>("/api/v1/messages/send", {
    method: "POST",
    token,
    body,
  });
  if (!res) {
    throw { message: "发送失败，请稍后重试" };
  }
  const failed = parseSendFailed(res);
  if (failed) {
    throwFreeCallExhausted(failed);
  }
  // 接口 200 返回 {}，无消息 id，用本地生成用于 UI 展示
  return {
    id: `send-${chatId}-${Date.now()}`,
    type: "text",
    text: payload.text,
    isMine: true,
    createdAt: new Date().toISOString(),
  };
}

/** 发送图片消息：content 为 image_id，message_type 为 image（需先通过头像上传方式拿到 image_id） */
export async function sendImageMessage(
  chatId: string,
  imageId: string,
  token: string,
  options?: { localUri?: string },
): Promise<ChatMessage> {
  if (shouldMockSendQuotaExhausted()) {
    throwFreeCallExhausted({
      status: "发送失败",
      has_claimed_share_freecall:
        process.env.EXPO_PUBLIC_MOCK_SEND_CLAIMED === "1",
    });
  }
  const body: SendMessagePayload = {
    conversation_id: chatId,
    content: imageId,
    message_type: "image",
    platform: "wowwoo",
  };
  const res = await apiRequest<any>("/api/v1/messages/send", {
    method: "POST",
    token,
    body,
  });
  if (!res) {
    throw { message: "发送失败，请稍后重试" };
  }
  const failed = parseSendFailed(res);
  if (failed) {
    throwFreeCallExhausted(failed);
  }
  const mediaUrl = buildImageUrlFromKey(imageId) || undefined;
  return {
    id: `send-${chatId}-${Date.now()}`,
    type: "image",
    mediaUrl,
    localImageUri: options?.localUri,
    isMine: true,
    createdAt: new Date().toISOString(),
  };
}

/** 发送表情包消息：content 为表情包 url，message_type 为 emoji */
export async function sendEmojiMessage(
  chatId: string,
  emojiUrl: string,
  token: string,
): Promise<ChatMessage> {
  if (shouldMockSendQuotaExhausted()) {
    throwFreeCallExhausted({
      status: "发送失败",
      has_claimed_share_freecall:
        process.env.EXPO_PUBLIC_MOCK_SEND_CLAIMED === "1",
    });
  }
  const body: SendMessagePayload = {
    conversation_id: chatId,
    content: emojiUrl,
    message_type: "emoji",
    platform: "wowwoo",
  };
  const res = await apiRequest<any>("/api/v1/messages/send", {
    method: "POST",
    token,
    body,
  });
  if (!res) {
    throw { message: "发送失败，请稍后重试" };
  }
  const failed = parseSendFailed(res);
  if (failed) {
    throwFreeCallExhausted(failed);
  }
  return {
    id: `send-${chatId}-${Date.now()}`,
    type: "emoji",
    mediaUrl: emojiUrl,
    isMine: true,
    createdAt: new Date().toISOString(),
  };
}

/** 发送视频消息（后端暂无接口，仅本地 Mock 返回） */
export async function sendMediaMessage({
  chatId,
  uri,
  mediaType,
}: SendMediaParams): Promise<ChatMessage> {
  await delay(400);
  return {
    id: `mock-${chatId}-${Date.now()}`,
    type: mediaType,
    mediaUrl: uri,
    isMine: true,
    createdAt: new Date().toISOString(),
  };
}

/** 获取表情包类别列表 - GET /api/v1/emoji/categories */
export async function fetchEmojiCategories(token: string): Promise<string[]> {
  const list = await apiRequest<string[]>("/api/v1/emojis/categories", {
    method: "GET",
    token,
  });
  return (list || []).map((c) => String(c));
}

/**
 * 获取表情包列表
 * - 不传 category 时：GET /api/v1/emoji
 * - 传 category 时：GET /api/v1/emoji?category=${category}
 */
export async function fetchEmojiList(
  token: string,
  category?: string,
): Promise<EmojiItem[]> {
  const path = category
    ? `/api/v1/emojis/?category=${encodeURIComponent(category)}`
    : "/api/v1/emojis";
  const list = await apiRequest<BackendEmoji[]>(path, {
    method: "GET",
    token,
  });
  return (list || []).map((e) => ({
    id: String(e.id),
    name: e.name,
    symbol: e.emoji,
    url: e.url,
  }));
}
