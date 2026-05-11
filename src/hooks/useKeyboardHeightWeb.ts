import { useEffect, useState } from "react";
import { Platform } from "react-native";

/**
 * 仅在 Web 端生效：通过 Visual Viewport API 得到“被键盘占掉”的高度，
 * 用于给容器加 paddingBottom，实现类似 Android resize 的避让效果。
 * 在 iOS/Android 上恒为 0（由 KeyboardAvoidingView / windowSoftInputMode 处理）。
 */
export function useKeyboardHeightWeb(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const keyboardHeight = Math.max(0, window.innerHeight - vv.height);
      setHeight(keyboardHeight);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return height;
}
