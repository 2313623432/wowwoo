import { usePhoneMode, type PhoneScreenTab } from "@/contexts/PhoneModeContext";
import { getCachedImageUri } from "@/services/imageCache";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

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

/** 桌面应用：设置、娱乐、朋友圈、聊天 */
const DESKTOP_APPS: {
  name: PhoneScreenTab | null;
  route: string | null;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  empty?: boolean;
}[] = [
  {
    name: "profile",
    route: "/(tabs)/profile",
    label: "设置",
    icon: "settings",
  },
  {
    name: "entertainment",
    route: "/(tabs)/entertainment",
    label: "娱乐",
    icon: "game-controller",
  },
  {
    name: "moments",
    route: "/(tabs)/moments",
    label: "朋友圈",
    icon: "people",
  },
  { name: "chat", route: "/(tabs)/chat", label: "聊天", icon: "chatbubble" },
];

export function PhoneDesktop() {
  const router = useRouter();
  const { setPhoneScreen, wallpaperUri } = usePhoneMode();
  const [time, setTime] = useState(getTimeString);
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
      // 远端 URL 在原生端缓存为本地文件，提升进入锁屏/桌面时的加载速度
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

  const defaultWallpaper = require("@/assets/bg.jpg");
  const source = resolvedWallpaperUri
    ? { uri: resolvedWallpaperUri }
    : defaultWallpaper;

  const onAppPress = useCallback(
    (tab: PhoneScreenTab | null, route: string | null) => {
      if (!tab || !route) return;
      setPhoneScreen(tab);
      router.replace(route as any);
    },
    [setPhoneScreen, router],
  );

  return (
    <View style={styles.container}>
      <Image
        source={source}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <View style={styles.dim} />

      {/* 顶部：左侧大组件 + 右侧时间/日期/天气 */}
      <View style={styles.topRow}>
        <View style={styles.widget}>
          <View style={styles.widgetContent}>
            <Image
              source={require("@/assets/widget_bg.jpeg")}
              style={styles.widgetImage}
              contentFit="cover"
            />
          </View>
        </View>
        <View style={styles.timeBlock}>
          <Text style={styles.time}>{time}</Text>
          <Text style={styles.date}>{getDateString()}</Text>
          <Text style={styles.weather}>晴 26℃</Text>
        </View>
      </View>

      {/* 下方一排应用图标 */}
      <View style={styles.appRow}>
        {DESKTOP_APPS.map((app, index) => (
          <TouchableOpacity
            key={app.label || index}
            style={styles.appIconWrap}
            activeOpacity={0.8}
            onPress={() => onAppPress(app.name, app.route)}
            disabled={app.empty}
          >
            {!app.empty ? (
              <>
                <View style={styles.appIconBox}>
                  <Ionicons
                    name={app.icon}
                    size={28}
                    color="rgba(255,255,255,0.95)"
                  />
                </View>
                <Text style={styles.appLabel} numberOfLines={1}>
                  {app.label}
                </Text>
              </>
            ) : (
              <View style={styles.appIconBoxEmpty} />
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  widget: {
    width: "48%",
    aspectRatio: 1,
    maxWidth: 160,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    overflow: "hidden",
  },
  widgetContent: {
    flex: 1,
    margin: 10,
    borderRadius: 16,
    overflow: "hidden",
  },
  widgetImage: {
    width: "100%",
    height: "100%",
  },
  timeBlock: {
    alignItems: "flex-end",
    paddingTop: 4,
  },
  time: {
    fontSize: 52,
    fontWeight: "200",
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  date: {
    fontSize: 16,
    color: "rgba(255,255,255,0.95)",
    marginTop: 4,
  },
  weather: {
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
    marginTop: 2,
  },
  appRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  appIconWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    maxWidth: 72,
  },
  appIconBox: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.4)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  appIconBoxEmpty: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  appLabel: {
    fontSize: 12,
    color: "#fff",
    marginTop: 6,
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
