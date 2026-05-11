import { Alert as RNAlert, Platform } from "react-native";

type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
};

function webAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
): void {
  if (typeof window === "undefined") return;
  const fullMessage = message ? `${title}\n\n${message}` : title;

  if (!buttons || buttons.length === 0) {
    window.alert(fullMessage);
    return;
  }
  if (buttons.length === 1) {
    window.alert(fullMessage);
    buttons[0].onPress?.();
    return;
  }
  // 两个按钮：用 confirm，确定 = 非 cancel 按钮，取消 = cancel 按钮
  const cancelBtn = buttons.find((b) => b.style === "cancel");
  const confirmBtn = buttons.find((b) => b.style !== "cancel") ?? buttons[1];
  const confirmed = window.confirm(fullMessage);
  if (confirmed) {
    confirmBtn?.onPress?.();
  } else {
    cancelBtn?.onPress?.();
  }
}

/**
 * 跨平台 Alert，在 Web 上使用 window.alert / window.confirm 实现，
 * 在 iOS/Android 上使用 React Native 原生 Alert。
 */
export const Alert = {
  alert: ((
    title: string,
    message?: string,
    buttons?: AlertButton[],
    ...rest: unknown[]
  ) => {
    if (Platform.OS === "web") {
      webAlert(title, message, buttons);
    } else {
      (RNAlert.alert as (...a: unknown[]) => void)(title, message, buttons, ...rest);
    }
  }) as typeof RNAlert.alert,
};
