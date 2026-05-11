import JPush from "jpush-react-native";
import { PermissionsAndroid, Platform } from "react-native";

export const canUseJPush = () => { 
  return Platform.OS !== "web" && typeof JPush !== "undefined";

}

/** 个聊收到对方新消息时的本地通知（仅原生端；Web 无操作） */
export function addLocalChatPeerNotification(
  title: string,
  content: string,
  extras?: Record<string, string>,
) {
  if (Platform.OS === "web") return;
  try {
    JPush.addLocalNotification({
      messageID: String(Math.floor(Date.now() / 1000)),
      title: title.slice(0, 80) || "新消息",
      content: content.slice(0, 200) || "你有一条新消息",
      extras: extras ?? {},
    });
  } catch {
    // 原生模块未就绪时忽略
  }
}
export const initJPush = async () => {
  if (!canUseJPush()) return;

  if (Platform.OS === "android") {
    const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    const granted = await PermissionsAndroid.request(permission);
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      console.log("[JPush] notification permission not granted");
      return;
    }
  }

  const appKey = process.env.JPUSH_APP_KEY || "";
  if (!appKey || typeof JPush?.init !== "function") {
    return;
  }

  JPush.init({
    appKey: process.env.JPUSH_APP_KEY || '',
    channel: "developer-default",
    production: true,
  });

  if (typeof JPush?.addNotificationListener === "function") {
    JPush.addNotificationListener((notification) => {
      console.log("[JPush] notification:", notification);
    });
  }
};

export function setJPushEnabled(enabled: boolean) {
  if (!canUseJPush()) return;
  if (enabled) {
    JPush.resumePush?.();
    return;
  }
  JPush.stopPush?.();
}

export function sendJPushLocalNotification() {
  if (!canUseJPush() || typeof JPush?.addLocalNotification !== "function") {
    return;
  }

  JPush.addLocalNotification({
    messageID: String(Math.floor(Date.now() / 1000)),
    title: "测试推送",
    content: "这是测试推送内容",
    extras: {
      test: "test",
    },
  });
}
