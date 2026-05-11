import React, { useMemo, useState } from "react";
import {
  Image,
  ImageSourcePropType,
  Modal,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ImageStyle,
  ViewStyle,
} from "react-native";

type Props = {
  source: ImageSourcePropType;
  style?: StyleProp<ImageStyle>;
  disabled?: boolean;
  /** 预览层容器样式（黑底层） */
  overlayStyle?: StyleProp<ViewStyle>;
  /** 预览大图样式（默认 contain + 最大化展示） */
  previewImageStyle?: StyleProp<ImageStyle>;
  /** 点击缩略图时回调 */
  onOpen?: () => void;
  /** 关闭预览时回调 */
  onClose?: () => void;
  accessibilityLabel?: string;
};

function resolveUri(source: ImageSourcePropType): string | null {
  if (!source) return null;
  if (typeof source === "number") {
    const resolved = Image.resolveAssetSource(source);
    return resolved?.uri ?? null;
  }
  // { uri } 或数组形式
  const anySource: any = source as any;
  if (typeof anySource?.uri === "string") return anySource.uri;
  if (Array.isArray(anySource) && typeof anySource[0]?.uri === "string")
    return anySource[0].uri;
  return null;
}

export function PreviewableImage({
  source,
  style,
  disabled,
  overlayStyle,
  previewImageStyle,
  onOpen,
  onClose,
  accessibilityLabel,
}: Props) {
  const [visible, setVisible] = useState(false);
  const uri = useMemo(() => resolveUri(source), [source]);
  const canPreview = Boolean(uri) && !disabled;

  return (
    <>
      <Pressable
        disabled={!canPreview}
        onPress={() => {
          if (!canPreview) return;
          setVisible(true);
          onOpen?.();
        }}
        accessibilityRole={canPreview ? "imagebutton" : "image"}
        accessibilityLabel={accessibilityLabel}
      >
        <Image source={source} style={style} />
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent={Platform.OS === "android"}
        onRequestClose={() => {
          setVisible(false);
          onClose?.();
        }}
      >
        <Pressable
          style={[styles.overlay, overlayStyle]}
          onPress={() => {
            setVisible(false);
            onClose?.();
          }}
        >
          <View style={styles.previewWrap} pointerEvents="none">
            <Image
              source={{ uri: uri ?? undefined }}
              style={[styles.previewImage, previewImageStyle]}
              resizeMode="contain"
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 24,
  },
  previewWrap: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  previewImage: {
    width: "100%",
    height: "100%",
    maxWidth: 980,
  },
});

