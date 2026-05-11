import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * 跨平台安全存储：iOS/Android 用 SecureStore，Web 用 localStorage，避免 Web 上 SecureStore 不可用导致卡住。
 */
const isNative = Platform.OS === "ios" || Platform.OS === "android";

export async function secureGetItem(key: string): Promise<string | null> {
  if (isNative) {
    return SecureStore.getItemAsync(key);
  }
  if (typeof localStorage !== "undefined") {
    return localStorage.getItem(key);
  }
  return null;
}

export async function secureSetItem(key: string, value: string): Promise<void> {
  if (isNative) {
    await SecureStore.setItemAsync(key, value);
    return;
  }
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(key, value);
  }
  return Promise.resolve();
}

export async function secureDeleteItem(key: string): Promise<void> {
  if (isNative) {
    await SecureStore.deleteItemAsync(key);
    return;
  }
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(key);
  }
  return Promise.resolve();
}
