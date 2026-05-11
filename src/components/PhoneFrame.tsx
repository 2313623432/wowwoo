import { theme } from "@/constants/theme";
import { View, StyleSheet, ViewStyle, useWindowDimensions } from "react-native";

const FRAME_RADIUS = 36;
const FRAME_STROKE = 12;
const FRAME_COLOR = "#2d2d2d";

type PhoneFrameProps = {
  children: React.ReactNode;
  style?: ViewStyle;
  enabled?: boolean;
};

export function PhoneFrame({ children, style, enabled = true }: PhoneFrameProps) {
  const { width: winW, height: winH } = useWindowDimensions();
  const isPortrait = winH >= winW;
  const maxContentW = Math.min(winW - 32, 400);
  const maxContentH = Math.min(winH - 48, 780);
  const contentW = isPortrait ? maxContentW : maxContentH * (390 / 844);
  const contentH = isPortrait ? maxContentH : maxContentW * (844 / 390);
  const frameW = contentW + FRAME_STROKE * 2;
  const frameH = contentH + FRAME_STROKE * 2 + 28;

  return (
    <View style={[styles.outer, !enabled && styles.outerPlain, style]}>
      <View
        style={[
          styles.frame,
          enabled
            ? {
                width: frameW,
                height: frameH,
                borderRadius: FRAME_RADIUS + FRAME_STROKE,
              }
            : styles.framePlain,
        ]}
      >
        {enabled ? <View style={[styles.notch, styles.notchTop]} /> : null}
        <View
          style={[
            styles.screen,
            enabled
              ? {
                  width: contentW,
                  height: contentH,
                  borderRadius: FRAME_RADIUS,
                }
              : styles.screenPlain,
          ]}
        >
          {children}
        </View>
        {enabled ? <View style={[styles.notch, styles.notchBottom]} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a1a1a",
  },
  outerPlain: {
    alignItems: "stretch",
    justifyContent: "flex-start",
    backgroundColor: "transparent",
  },
  frame: {
    backgroundColor: FRAME_COLOR,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadowLight,
    shadowColor: "#000",
    shadowOpacity: 0.35,
  },
  framePlain: {
    flex: 1,
    width: "100%",
    height: "100%",
    borderRadius: 0,
    backgroundColor: "transparent",
    shadowOpacity: 0,
    elevation: 0,
  },
  screen: {
    overflow: "hidden",
    backgroundColor: "#000",
  },
  screenPlain: {
    flex: 1,
    width: "100%",
    height: "100%",
    borderRadius: 0,
    backgroundColor: "transparent",
  },
  notch: {
    position: "absolute",
    width: 120,
    height: 28,
    backgroundColor: FRAME_COLOR,
    borderRadius: 14,
  },
  notchTop: {
    top: 0,
  },
  notchBottom: {
    bottom: 0,
  },
});
