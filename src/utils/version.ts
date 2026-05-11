import Constants from "expo-constants";

/** 从 APK 下载链接中解析版本号，如 xxx_v1.2.0.apk -> "1.2.0" */
export function parseVersionFromUrl(url: string): string | null {
  const match = url.match(/_v(\d+\.\d+\.\d+)\.apk$/i);
  return match ? match[1] : null;
}

/** 当前应用版本（来自 app.json/expoConfig） */
export function getLocalAppVersion(): string {
  return Constants.expoConfig?.version ?? "0.0.0";
}

/**
 * 是否认为远程版本“有更新”（任意版本号不同即视为有更新，用于手动「检查版本更新」）。
 */
export function isVersionDifferent(local: string, remote: string): boolean {
  return local.trim() !== remote.trim();
}

/**
 * 是否认为远程是大版本更新（比较前两位版本号，如 1.1.0 取 1.1：远程 > 本地时为 true，用于自动轮询）。
 */
export function isMajorVersionUpdate(local: string, remote: string): boolean {
  const lParts = local.split(".");
  const rParts = remote.split(".");
  const lMajor = parseInt(lParts[0], 10) || 0;
  const lMinor = parseInt(lParts[1], 10) || 0;
  const rMajor = parseInt(rParts[0], 10) || 0;
  const rMinor = parseInt(rParts[1], 10) || 0;
  console.log(
    "lMajor",
    lMajor,
    "lMinor",
    lMinor,
    "rMajor",
    rMajor,
    "rMinor",
    rMinor,
  );
  return rMajor !== lMajor || rMinor !== lMinor;
}

/** 是否认为远程版本在「中间段」上更新（主版本相同、次版本不同则视为有新版本） */
export function isMiddleVersionDifferent(
  local: string,
  remote: string,
): boolean {
  const [lMajor, lMinor] = local.split(".").map((v) => parseInt(v, 10) || 0);
  const [rMajor, rMinor] = remote.split(".").map((v) => parseInt(v, 10) || 0);
  if (!Number.isFinite(lMajor) || !Number.isFinite(rMajor)) return false;
  if (!Number.isFinite(lMinor) || !Number.isFinite(rMinor)) return false;
  if (lMajor !== rMajor) return false;
  return lMinor !== rMinor;
}

export type CheckUpdateResult = {
  hasNew: boolean;
  version?: string;
  url?: string;
};
