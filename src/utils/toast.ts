import { Platform, ToastAndroid } from "react-native";
import { Alert } from "./alert";

export type ToastOptions = {
  durationMs?: number;
};

type ToastHandler = (message: string, options?: ToastOptions) => void;

let handler: ToastHandler | null = null;

/** 由 UI 层注册，供非 React 代码（如 services）统一弹 Toast */
export function setToastHandler(h: ToastHandler | null) {
  handler = h;
}

const lastShownAt = new Map<string, number>();

export function showToast(message: string, options?: ToastOptions) {
  const msg = String(message ?? "").trim();
  if (!msg) return;

  if (handler) {
    try {
      handler(msg, options);
      return;
    } catch {
      // fallthrough
    }
  }

  // 兜底：没有 Provider 时也别抛异常
  if (Platform.OS === "android") {
    try {
      ToastAndroid.show(msg, ToastAndroid.SHORT);
      return;
    } catch {
      // fallthrough
    }
  }
  try {
    // iOS/web：尽量别静默（但也避免 throw）
    Alert.alert("提示", msg);
  } catch {
    // ignore
  }
}

export function showToastThrottled(
  key: string,
  message: string,
  intervalMs = 5000,
  options?: ToastOptions,
) {
  const k = String(key ?? "").trim() || "__default__";
  const now = Date.now();
  const last = lastShownAt.get(k) ?? 0;
  if (now - last < intervalMs) return;
  lastShownAt.set(k, now);
  showToast(message, options);
}

