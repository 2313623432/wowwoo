import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  ImageSourcePropType,
  StyleProp,
  ViewStyle,
} from "react-native";

type Props = {
  size?: number;
  style?: StyleProp<ViewStyle>;
  /** 不传则使用默认 WOWWOO 吉祥物 */
  source?: ImageSourcePropType;
};

/**
 * WOWWOO 吉祥物：轻微呼吸放大缩小动效
 */
export function Mascot({ size = 120, style, source }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.05,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => {
      animation.stop();
    };
  }, [scale]);

  return (
    <Animated.Image
      source={source ?? require("../../assets/logo.png")}
      style={[
        {
          width: size,
          height: size,
          transform: [{ scale }],
        },
        style,
      ]}
      resizeMode="contain"
    />
  );
}
