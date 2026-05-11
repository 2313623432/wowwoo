import {
  cacheDirectory,
  deleteAsync,
  downloadAsync,
  getInfoAsync,
  makeDirectoryAsync,
} from "expo-file-system";
import { Platform } from "react-native";

const CACHE_DIR = `${cacheDirectory ?? ""}wowwoo-image-cache/`;

const inflight = new Map<string, Promise<string>>();

function fnv1a32(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // 转无符号 32-bit
  return (h >>> 0).toString(16).padStart(8, "0");
}

function guessExtFromUrl(url: string): string {
  const clean = url.split("?")[0]?.split("#")[0] ?? "";
  const m = clean.match(/\.([a-z0-9]+)$/i);
  const ext = m?.[1]?.toLowerCase();
  if (!ext) return "img";
  if (ext.length > 5) return "img";
  return ext;
}

async function ensureCacheDir() {
  if (!CACHE_DIR) return;
  try {
    const info = await getInfoAsync(CACHE_DIR);
    if (info.exists && info.isDirectory) return;
  } catch {
    // ignore
  }
  try {
    await makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  } catch {
    // ignore
  }
}

async function fileExists(uri: string): Promise<boolean> {
  try {
    const info = await getInfoAsync(uri);
    return Boolean(info.exists);
  } catch {
    return false;
  }
}

/**
 * 将远端图片 URL 缓存到本地文件并返回本地 uri。
 * - 失败时回退返回原 url（保证 UI 不崩）
 */
export async function getCachedImageUri(url: string): Promise<string> {
  const u = String(url || "").trim();
  if (!u) return "";
  if (Platform.OS === "web") return u;
  if (!/^https?:\/\//i.test(u)) return u;

  const cached = inflight.get(u);
  if (cached) return cached;

  const p = (async () => {
    try {
      await ensureCacheDir();
      const ext = guessExtFromUrl(u);
      const fileName = `${fnv1a32(u)}.${ext}`;
      const localUri = `${CACHE_DIR}${fileName}`;
      // 已下载过则直接复用（用 hash 文件名保证稳定映射）
      if (await fileExists(localUri)) return localUri;

      const res = await downloadAsync(u, localUri);
      const ok = res?.status === 200 && (await fileExists(localUri));
      if (!ok) return u;
      return localUri;
    } catch {
      return u;
    } finally {
      inflight.delete(u);
    }
  })();

  inflight.set(u, p);
  return p;
}

export async function clearImageFileCache() {
  if (Platform.OS === "web") return;
  if (!CACHE_DIR) return;
  try {
    const info = await getInfoAsync(CACHE_DIR);
    if (!info.exists) return;
    await deleteAsync(CACHE_DIR, { idempotent: true });
  } catch {
    // ignore
  }
}

