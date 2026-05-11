import { Platform } from "react-native";

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

type LocalCacheModule = {
  upsertChatMessages: (chatId: string, messages: CachedChatMessage[]) => Promise<void>;
  getLatestChatMessages: (chatId: string, limit: number) => Promise<CachedChatMessage[]>;
  getChatMessagesBefore: (
    chatId: string,
    beforeIso: string,
    limit: number,
  ) => Promise<CachedChatMessage[]>;
  clearAllLocalCache: () => Promise<void>;
};

let implPromise: Promise<LocalCacheModule> | null = null;

async function getImpl(): Promise<LocalCacheModule> {
  if (!implPromise) {
    implPromise = (async () => {
      if (Platform.OS === "web") {
        return (await import("./localCache.web")) as LocalCacheModule;
      }
      return (await import("./localCache.native")) as LocalCacheModule;
    })();
  }
  return implPromise;
}

export async function upsertChatMessages(
  chatId: string,
  messages: CachedChatMessage[],
) {
  const impl = await getImpl();
  return impl.upsertChatMessages(chatId, messages);
}

export async function getLatestChatMessages(chatId: string, limit: number) {
  const impl = await getImpl();
  return impl.getLatestChatMessages(chatId, limit);
}

export async function getChatMessagesBefore(
  chatId: string,
  beforeIso: string,
  limit: number,
) {
  const impl = await getImpl();
  return impl.getChatMessagesBefore(chatId, beforeIso, limit);
}

export async function clearAllLocalCache() {
  const impl = await getImpl();
  return impl.clearAllLocalCache();
}

