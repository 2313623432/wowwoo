import { setToastHandler, type ToastOptions } from "@/utils/toast";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";

type ToastItem = {
  id: number;
  message: string;
  durationMs: number;
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(1);

  const show = useMemo(
    () => (message: string, options?: ToastOptions) => {
      const durationMs =
        typeof options?.durationMs === "number" && options.durationMs > 0
          ? options.durationMs
          : 2200;

      const id = idRef.current++;
      setToast({ id, message, durationMs });

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setToast((cur) => (cur?.id === id ? null : cur));
      }, durationMs);
    },
    [],
  );

  useEffect(() => {
    setToastHandler(show);
    return () => {
      setToastHandler(null);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [show]);

  useEffect(() => {
    if (!toast) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 120,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 8,
          duration: 120,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 140,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 140,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [toast, opacity, translateY]);

  return (
    <View style={styles.root}>
      {children}
      <View pointerEvents="none" style={styles.layer}>
        <Animated.View
          style={[
            styles.toast,
            {
              opacity,
              transform: [{ translateY }],
            },
          ]}
        >
          <Text style={styles.text} numberOfLines={3}>
            {toast?.message ?? ""}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  layer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: Platform.OS === "web" ? 18 : 24,
    alignItems: "center",
  },
  toast: {
    maxWidth: 520,
    width: "92%",
    backgroundColor: "rgba(0,0,0,0.82)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  text: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 18,
  },
});

