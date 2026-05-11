import { usePhoneMode } from "@/contexts/PhoneModeContext";
import { getCachedImageUri } from "@/services/imageCache";
import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const DEFAULT_PIN = "000000";
const PIN_LENGTH = 6;

const SLIDER_HEIGHT = 52;
const SLIDER_PADDING = 6;
const THUMB_SIZE = SLIDER_HEIGHT - SLIDER_PADDING * 2;
const SLIDER_MAX_DISTANCE = 200;

function getTimeString() {
  const d = new Date();
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function getDateString() {
  const d = new Date();
  const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${d.getMonth() + 1}月${d.getDate()}日 ${week[d.getDay()]}`;
}

const KEYPAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

export function PhoneLockScreen() {
  const { unlock, wallpaperUri, lockScreenType, setLockScreenType } =
    usePhoneMode();
  const [time, setTime] = useState(getTimeString);
  const [date] = useState(getDateString);
  const [sliderWidth, setSliderWidth] = useState(280);
  const [dragX, setDragX] = useState(0);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [resolvedWallpaperUri, setResolvedWallpaperUri] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const id = setInterval(() => setTime(getTimeString()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!wallpaperUri) {
        setResolvedWallpaperUri(null);
        return;
      }
      if (/^https?:\/\//i.test(wallpaperUri)) {
        const cached = await getCachedImageUri(wallpaperUri);
        if (!cancelled) setResolvedWallpaperUri(cached || wallpaperUri);
      } else {
        setResolvedWallpaperUri(wallpaperUri);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallpaperUri]);

  useEffect(() => {
    if (pin.length !== PIN_LENGTH) return;
    if (pin === DEFAULT_PIN) {
      unlock();
      setPin("");
      setPinError(false);
    } else {
      setPinError(true);
      const t = setTimeout(() => {
        setPin("");
        setPinError(false);
      }, 600);
      return () => clearTimeout(t);
    }
  }, [pin, unlock]);

  const onKeyPress = useCallback(
    (key: string) => {
      if (key === "del") {
        setPin((p) => p.slice(0, -1));
        setPinError(false);
      } else if (key !== "" && pin.length < PIN_LENGTH) {
        setPin((p) => p + key);
        setPinError(false);
      }
    },
    [pin.length],
  );

  const maxDrag = Math.min(
    SLIDER_MAX_DISTANCE,
    Math.max(0, sliderWidth - THUMB_SIZE - SLIDER_PADDING * 2),
  );
  const maxDragRef = useRef(maxDrag);
  maxDragRef.current = maxDrag;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        const m = maxDragRef.current;
        setDragX(Math.max(0, Math.min(m, g.dx)));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx >= maxDragRef.current * 0.75) {
          unlock();
        }
        setDragX(0);
      },
    }),
  ).current;

  const onSliderLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setSliderWidth(w);
  }, []);

  const defaultWallpaper = require("@/assets/bg.jpg");
  const source = resolvedWallpaperUri
    ? { uri: resolvedWallpaperUri }
    : defaultWallpaper;

  const switchLabel =
    lockScreenType === "password" ? "使用滑动解锁" : "使用密码解锁";
  const onSwitch = () =>
    setLockScreenType(lockScreenType === "password" ? "slide" : "password");

  return (
    <View style={styles.container}>
      <Image
        source={source}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={styles.dim} />
      <View style={styles.topInfo}>
        <Text style={styles.time}>{time}</Text>
        <Text style={styles.date}>{date}</Text>
        <Text style={styles.weather}>晴 26℃</Text>
      </View>

      {lockScreenType === "password" ? (
        <View style={styles.passwordSection}>
          <Text style={styles.enterPinHint}>输入密码</Text>
          <View style={styles.dotsRow}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i < pin.length && styles.dotFilled,
                  pinError && styles.dotError,
                ]}
              />
            ))}
          </View>
          {pinError && (
            <Text style={styles.pinErrorText}>密码错误，请重试</Text>
          )}
          <View style={styles.keypad}>
            {KEYPAD_KEYS.map((key, idx) =>
              key === "" ? (
                <View key={idx} style={styles.keypadCell} />
              ) : (
                <TouchableOpacity
                  key={idx}
                  style={styles.keypadCell}
                  activeOpacity={0.7}
                  onPress={() => onKeyPress(key)}
                >
                  <Text style={styles.keypadText}>
                    {key === "del" ? "删除" : key}
                  </Text>
                </TouchableOpacity>
              ),
            )}
          </View>
        </View>
      ) : (
        <View
          style={[styles.sliderWrap, { width: sliderWidth }]}
          onLayout={onSliderLayout}
          {...pan.panHandlers}
        >
          <View style={styles.sliderTrack}>
            <View
              style={[
                styles.thumb,
                {
                  transform: [{ translateX: dragX }],
                },
              ]}
            />
            <Text style={styles.sliderLabel}>滑动解锁</Text>
          </View>
        </View>
      )}

      <TouchableOpacity
        style={styles.switchModeBtn}
        activeOpacity={0.8}
        onPress={onSwitch}
      >
        <Text style={styles.switchModeText}>{switchLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-between",
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  topInfo: {
    paddingTop: 80,
    paddingRight: 24,
    alignItems: "flex-end",
  },
  time: {
    fontSize: 56,
    fontWeight: "200",
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  date: {
    fontSize: 18,
    color: "rgba(255,255,255,0.95)",
    marginTop: 4,
  },
  weather: {
    fontSize: 15,
    color: "rgba(255,255,255,0.9)",
    marginTop: 2,
  },
  sliderWrap: {
    alignSelf: "center",
    marginBottom: 48,
    height: SLIDER_HEIGHT,
  },
  sliderTrack: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: SLIDER_HEIGHT / 2,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  thumb: {
    position: "absolute",
    left: SLIDER_PADDING,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: "rgba(255,255,255,0.95)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  sliderLabel: {
    fontSize: 15,
    color: "rgba(255,255,255,0.95)",
  },
  passwordSection: {
    alignSelf: "stretch",
    alignItems: "center",
    marginBottom: 24,
    paddingHorizontal: 24,
  },
  enterPinHint: {
    fontSize: 16,
    color: "rgba(255,255,255,0.9)",
    marginBottom: 16,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 8,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.8)",
    backgroundColor: "transparent",
  },
  dotFilled: {
    backgroundColor: "rgba(255,255,255,0.95)",
    borderColor: "rgba(255,255,255,0.95)",
  },
  dotError: {
    borderColor: "rgba(255,100,100,0.9)",
    backgroundColor: "rgba(255,100,100,0.5)",
  },
  pinErrorText: {
    fontSize: 13,
    color: "rgba(255,180,180,0.95)",
    marginBottom: 16,
  },
  keypad: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    maxWidth: 260,
  },
  keypadCell: {
    width: 72,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  keypadText: {
    fontSize: 22,
    color: "#fff",
    fontWeight: "500",
  },
  switchModeBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginBottom: 40,
    alignSelf: "center",
  },
  switchModeText: {
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
  },
});
