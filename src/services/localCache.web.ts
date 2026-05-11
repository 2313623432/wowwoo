function isoToMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export type CachedChatMessage = {
  id: string;
  type: string;
  text?: string;
  mediaUrl?: string;
  localImageUri?: string;
  thumbnailUrl?: string;
  isMine: boolean;
  createdAt: string;
};

// web 端降级：内存缓存（不持久化）
const webStore = new Map<string, CachedChatMessage[]>();

export async function upsertChatMessages(
  chatId: string,
  messages: CachedChatMessage[],
) {
  if (!chatId || !messages?.length) return;
  const prev = webStore.get(chatId) ?? [];
  const byId = new Map(prev.map((m) => [String(m.id), m]));
  for (const m of messages) {
    if (m?.id) byId.set(String(m.id), m);
  }
  const merged = Array.from(byId.values());
  merged.sort((a, b) => isoToMs(a.createdAt) - isoToMs(b.createdAt));
  webStore.set(chatId, merged);
}

export async function getLatestChatMessages(
  chatId: string,
  limit: number,
): Promise<CachedChatMessage[]> {
  if (!chatId) return [];
  const list = webStore.get(chatId) ?? [];
  const slice = list.slice(-Math.max(1, limit));
  return [...slice];
}

export async function getChatMessagesBefore(
  chatId: string,
  beforeIso: string,
  limit: number,
): Promise<CachedChatMessage[]> {
  if (!chatId) return [];
  const beforeMs = isoToMs(beforeIso);
  if (!beforeMs) return [];
  const list = webStore.get(chatId) ?? [];
  const filtered = list.filter((m) => isoToMs(m.createdAt) < beforeMs);
  const slice = filtered.slice(-Math.max(1, limit));
  return [...slice];
}

export async function clearAllLocalCache() {
  webStore.clear();
}

