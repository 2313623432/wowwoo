import * as SQLite from "expo-sqlite";

type SqlDatabase = SQLite.SQLiteDatabase;

let dbPromise: Promise<SqlDatabase> | null = null;

async function getDb(): Promise<SqlDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync("wowwoo-cache.db");
      await db.execAsync(`
        PRAGMA journal_mode = WAL;

        CREATE TABLE IF NOT EXISTS chat_messages (
          chat_id TEXT NOT NULL,
          message_id TEXT NOT NULL,
          created_at_ms INTEGER NOT NULL,
          payload_json TEXT NOT NULL,
          PRIMARY KEY (chat_id, message_id)
        );

        CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_created
          ON chat_messages(chat_id, created_at_ms);

        CREATE TABLE IF NOT EXISTS image_cache (
          url TEXT PRIMARY KEY NOT NULL,
          local_uri TEXT NOT NULL,
          updated_at_ms INTEGER NOT NULL
        );
      `);
      return db;
    })();
  }
  return dbPromise;
}

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

export async function upsertChatMessages(
  chatId: string,
  messages: CachedChatMessage[],
) {
  if (!chatId || !messages?.length) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const m of messages) {
      if (!m?.id || !m?.createdAt) continue;
      const createdAtMs = isoToMs(m.createdAt) || Date.now();
      const payloadJson = JSON.stringify(m);
      await db.runAsync(
        `INSERT OR REPLACE INTO chat_messages
         (chat_id, message_id, created_at_ms, payload_json)
         VALUES (?, ?, ?, ?)`,
        [String(chatId), String(m.id), createdAtMs, payloadJson],
      );
    }
  });
}

export async function getLatestChatMessages(
  chatId: string,
  limit: number,
): Promise<CachedChatMessage[]> {
  if (!chatId) return [];
  const db = await getDb();
  const rows = await db.getAllAsync<{
    payload_json: string;
  }>(
    `SELECT payload_json
     FROM chat_messages
     WHERE chat_id = ?
     ORDER BY created_at_ms DESC
     LIMIT ?`,
    [String(chatId), Math.max(1, limit)],
  );
  const list = rows
    .map((r) => {
      try {
        return JSON.parse(r.payload_json) as CachedChatMessage;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as CachedChatMessage[];
  list.sort((a, b) => isoToMs(a.createdAt) - isoToMs(b.createdAt));
  return list;
}

export async function getChatMessagesBefore(
  chatId: string,
  beforeIso: string,
  limit: number,
): Promise<CachedChatMessage[]> {
  if (!chatId) return [];
  const beforeMs = isoToMs(beforeIso);
  if (!beforeMs) return [];
  const db = await getDb();
  const rows = await db.getAllAsync<{
    payload_json: string;
  }>(
    `SELECT payload_json
     FROM chat_messages
     WHERE chat_id = ?
       AND created_at_ms < ?
     ORDER BY created_at_ms DESC
     LIMIT ?`,
    [String(chatId), beforeMs, Math.max(1, limit)],
  );
  const list = rows
    .map((r) => {
      try {
        return JSON.parse(r.payload_json) as CachedChatMessage;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as CachedChatMessage[];
  list.sort((a, b) => isoToMs(a.createdAt) - isoToMs(b.createdAt));
  return list;
}

export async function clearAllLocalCache() {
  const db = await getDb();
  await db.execAsync(`
    DELETE FROM chat_messages;
    DELETE FROM image_cache;
  `);
}

