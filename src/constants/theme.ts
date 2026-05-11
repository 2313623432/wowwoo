/**
 * WOWWOO · 恋爱聊天主题色与样式常量
 * 参考品牌：粉白渐变 + 软萌 IP 吉祥物
 */
export const theme = {
  // 主色（整体粉色调）
  wechatGreen: "#ff7fb5", // 兼容旧命名：实际为主粉色
  wechatGreenDark: "#e5659c",

  // 背景
  pageBg: "#fff5fb",
  chatBg: "#f9edf5",
  navBarBg: "rgba(255, 244, 250, 0.96)",
  tabBarBg: "rgba(255, 244, 250, 0.98)",
  cardBg: "#ffffff",

  // 渐变/装饰（logo 同款粉蓝渐变）
  gradientStart: "#ffd6ea",
  gradientEnd: "#c9d9ff",

  // 边框
  border: "#ffd9e6",
  borderNav: "#ffd0df",

  // 文字
  textPrimary: "#0f172a",
  textSecondary: "#64748b",
  textMuted: "#94a3b8",
  navTitle: "#a53f68",
  navTitlePink: "#b14e79",

  // 粉红强调
  pink: "#ff7fb5",
  pinkLight: "#ffbfd5",
  pinkLighter: "#ffe1f0",
  pinkBg: "#fff7fb",
  pinkBgTag: "#ffe6f3",
  pinkPlaceholder: "#d79ab6",

  // 聊天气泡
  bubbleLeftBg: "#ffffff",
  bubbleRightBg: "#ffb3cf",
  bubbleRightText: "#000000",

  // 按钮
  btnPrimaryBg: "#ff7fb5",
  btnSecondaryStart: "#ff8eb5",
  btnSecondaryEnd: "#ff6b9d",

  // 未读红点
  badgeRed: "#ff3b30",

  // 圆角
  radiusSm: 8,
  radiusMd: 12,
  radiusLg: 20,
  radiusXl: 24,
  radiusFull: 40,

  // 阴影（React Native shadow 数值）
  shadowLight: {
    shadowColor: "#ff78a0",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  bubbleShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
} as const;

export type Theme = typeof theme;
