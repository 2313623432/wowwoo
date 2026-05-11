import { theme } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { Audio, type AVPlaybackStatus } from "expo-av";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

/** 同一时间只播放一条语音：下一条开始时打断上一条 */
let exclusiveVoiceInterrupt: (() => void) | null = null;

function formatMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "0:00";
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0
    ? `${m}:${String(s).padStart(2, "0")}`
    : `0:${String(s).padStart(2, "0")}`;
}

type Props = {
  uri: string;
  isMine: boolean;
};

export function VoiceMessageBubble({ uri, isMine }: Props) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const uriRef = useRef(uri);
  uriRef.current = uri;

  const interruptRef = useRef<(() => void) | null>(null);

  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [positionMs, setPositionMs] = useState(0);

  const interruptSelf = useCallback(() => {
    const s = soundRef.current;
    if (s) {
      void s.stopAsync().catch(() => {});
      void s.setPositionAsync(0).catch(() => {});
    }
    setPlaying(false);
    setPositionMs(0);
    if (exclusiveVoiceInterrupt === interruptRef.current) {
      exclusiveVoiceInterrupt = null;
    }
  }, []);

  interruptRef.current = interruptSelf;

  useEffect(() => {
    return () => {
      if (exclusiveVoiceInterrupt === interruptRef.current) {
        exclusiveVoiceInterrupt = null;
      }
      void soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
  }, []);

  useEffect(() => {
    void (async () => {
      await soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
      setPlaying(false);
      setDurationMs(null);
      setPositionMs(0);
      setLoadError(false);
    })();
  }, [uri]);

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setDurationMs(status.durationMillis ?? null);
    setPositionMs(status.positionMillis ?? 0);
    setPlaying(status.isPlaying);
    if (status.didJustFinish) {
      setPlaying(false);
      setPositionMs(0);
      if (exclusiveVoiceInterrupt === interruptRef.current) {
        exclusiveVoiceInterrupt = null;
      }
      void soundRef.current?.setPositionAsync(0).catch(() => {});
    }
  }, []);

  const ensureSound = useCallback(async () => {
    if (soundRef.current) return soundRef.current;
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
    } catch {
      // 仍尝试加载
    }
    const { sound } = await Audio.Sound.createAsync(
      { uri: uriRef.current },
      { shouldPlay: false },
      onPlaybackStatusUpdate,
    );
    soundRef.current = sound;
    return sound;
  }, [onPlaybackStatusUpdate]);

  const toggle = useCallback(async () => {
    if (loadError) return;
    try {
      if (playing) {
        await soundRef.current?.pauseAsync();
        setPlaying(false);
        return;
      }

      exclusiveVoiceInterrupt?.();
      exclusiveVoiceInterrupt = interruptSelf;

      setLoading(true);
      const sound = await ensureSound();
      const st = await sound.getStatusAsync();
      if (!st.isLoaded) {
        setLoadError(true);
        return;
      }
      const atEnd =
        st.durationMillis != null &&
        st.positionMillis != null &&
        st.durationMillis > 0 &&
        st.positionMillis >= st.durationMillis - 80;
      if (atEnd) {
        await sound.setPositionAsync(0);
      }
      await sound.playAsync();
      setPlaying(true);
    } catch {
      setLoadError(true);
      if (exclusiveVoiceInterrupt === interruptRef.current) {
        exclusiveVoiceInterrupt = null;
      }
    } finally {
      setLoading(false);
    }
  }, [ensureSound, interruptSelf, loadError, playing]);

  const labelColor = isMine ? theme.bubbleRightText : theme.textPrimary;
  const iconColor = isMine ? theme.bubbleRightText : theme.pink;
  const remainMs =
    durationMs != null && durationMs > 0
      ? Math.max(0, durationMs - positionMs)
      : null;

  return (
    <Pressable
      onPress={toggle}
      style={[
        styles.row,
        isMine ? styles.rowMe : styles.rowOther,
        loadError && styles.rowMuted,
      ]}
      accessibilityRole="button"
      accessibilityLabel={playing ? "暂停语音" : "播放语音"}
    >
      {!isMine ? (
        <>
          {loading ? (
            <ActivityIndicator size="small" color={iconColor} />
          ) : (
            <Ionicons
              name={playing ? "pause" : "play"}
              size={22}
              color={iconColor}
            />
          )}
          <View style={styles.waveWrap}>
            {[3, 5, 4, 6, 3].map((h, i) => (
              <View
                key={i}
                style={[
                  styles.waveBar,
                  { height: h + (playing ? 4 : 0) },
                  { backgroundColor: iconColor, opacity: playing ? 0.9 : 0.35 },
                ]}
              />
            ))}
          </View>
          <Text style={[styles.dur, { color: labelColor }]}>
            {loadError
              ? "无法播放"
              : playing
                ? formatMs(remainMs ?? positionMs)
                : formatMs(durationMs)}
          </Text>
        </>
      ) : (
        <>
          <Text style={[styles.dur, { color: labelColor }]}>
            {loadError
              ? "无法播放"
              : playing
                ? formatMs(remainMs ?? positionMs)
                : formatMs(durationMs)}
          </Text>
          <View style={styles.waveWrap}>
            {[3, 5, 4, 6, 3].map((h, i) => (
              <View
                key={i}
                style={[
                  styles.waveBar,
                  { height: h + (playing ? 4 : 0) },
                  { backgroundColor: iconColor, opacity: playing ? 0.9 : 0.35 },
                ]}
              />
            ))}
          </View>
          {loading ? (
            <ActivityIndicator size="small" color={iconColor} />
          ) : (
            <Ionicons
              name={playing ? "pause" : "play"}
              size={22}
              color={iconColor}
            />
          )}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 132,
    maxWidth: 240,
    paddingVertical: 4,
  },
  rowMe: {
    flexDirection: "row-reverse",
  },
  rowOther: {
    flexDirection: "row",
  },
  rowMuted: {
    opacity: 0.7,
  },
  waveWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 22,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
  },
  dur: {
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    minWidth: 36,
  },
});
