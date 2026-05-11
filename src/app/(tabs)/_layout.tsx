import { PhoneDesktop } from "@/components/PhoneDesktop";
import { PhoneFrame } from "@/components/PhoneFrame";
import { PhoneLockScreen } from "@/components/PhoneLockScreen";
import { theme } from "@/constants/theme";
import { usePhoneMode } from "@/contexts/PhoneModeContext";
import { useAuth } from "@/contexts/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import {
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/services/api";
import {
  getLocalAppVersion,
  isMajorVersionUpdate,
  parseVersionFromUrl,
} from "@/utils/version";

type UpdateInfo = {
  version: string;
  url: string;
};

function PhoneModeHomeButton() {
  const { setPhoneScreen } = usePhoneMode();
  const insets = useSafeAreaInsets();
  return (
    <TouchableOpacity
      style={[styles.homeBtn, { top: insets.top + 8 }]}
      activeOpacity={0.8}
      onPress={() => setPhoneScreen("desktop")}
    >
      <Ionicons name="home" size={22} color={theme.pink} />
    </TouchableOpacity>
  );
}

const tabBarCommon = {
  tabBarActiveTintColor: theme.pink,
  tabBarIconStyle: { minWidth: 50 },
  tabBarInactiveTintColor: "#d48ca6",
  tabBarLabelStyle: { fontSize: 12, marginTop: 0, display: "none" as const },
  tabBarItemStyle: { paddingVertical: 4 },
};

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { phoneModeEnabled, isLocked, phoneScreen } = usePhoneMode();
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateVisible, setUpdateVisible] = useState(false);
  const lastPromptedVersionRef = useRef<string | null>(null);

  // 登录守卫：未登录或无 token 时，强制跳转到登录页
  useEffect(() => {
    if (isLoading) return;
    if (!user?.token) {
      try {
        router.replace("/(auth)/login");
      } catch {
        // ignore
      }
    }
  }, [isLoading, user?.token, router]);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    let cancelled = false;

    const checkUpdate = async () => {
      try {
        const data = await apiRequest<{ url?: string }>(
          "/api/v1/external/download_url",
          { method: "GET" },
        );
        const url = typeof data.url === "string" ? data.url : null;
        if (!url) return;
        const remoteVersion = parseVersionFromUrl(url);
        if (!remoteVersion) return;
        const localVersion = getLocalAppVersion();
        if (!isMajorVersionUpdate(localVersion, remoteVersion)) return;
        if (lastPromptedVersionRef.current === remoteVersion) return;
        lastPromptedVersionRef.current = remoteVersion;
        if (cancelled) return;
        setUpdateInfo({ version: remoteVersion, url });
        setUpdateVisible(true);
      } catch {
        // 忽略轮询失败，等待下次轮询
      }
    };

    checkUpdate();
    timer = setInterval(checkUpdate, 60 * 1000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  const handleDownload = () => {
    if (!updateInfo?.url) return;
    setUpdateVisible(false);
    Linking.openURL(updateInfo.url).catch(() => {});
  };

  const handleReloadWeb = () => {
    setUpdateVisible(false);
    if (typeof window !== "undefined" && window.location) {
      window.location.reload();
    }
  };

  /** 关闭更新弹窗时清除“已提示版本”，以便下次自动检测时仍会再次弹出 */
  const handleCloseUpdateModal = () => {
    setUpdateVisible(false);
    lastPromptedVersionRef.current = null;
  };

  const updateModal = (
    <Modal
      visible={updateVisible && !!updateInfo}
      transparent
      animationType="fade"
      onRequestClose={handleCloseUpdateModal}
    >
      <View style={styles.updateMask}>
        <View style={styles.updateCard}>
          <Text style={styles.updateTitle}>
            发现新版本 v{updateInfo?.version}
          </Text>
          <Text style={styles.updateText}>
            {Platform.OS === "web"
              ? "检测到有新的 Android 客户端版本，建议刷新浏览器或前往下载最新安装包。"
              : "检测到有新的 Android 客户端版本，可以前往下载并安装最新 APK。"}
          </Text>
          <Text style={styles.updateUrl} numberOfLines={2}>
            下载链接：{updateInfo?.url}
          </Text>
          <View style={styles.updateButtonsRow}>
            {Platform.OS === "web" ? (
              <>
                <TouchableOpacity
                  style={styles.updateButton}
                  activeOpacity={0.85}
                  onPress={handleReloadWeb}
                >
                  <Text style={styles.updateButtonText}>刷新浏览器</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.updateButton, styles.updateButtonPrimary]}
                  activeOpacity={0.85}
                  onPress={handleDownload}
                >
                  <Text style={styles.updateButtonPrimaryText}>前往下载</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.updateButton}
                  activeOpacity={0.85}
                  onPress={handleCloseUpdateModal}
                >
                  <Text style={styles.updateButtonText}>稍后再说</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.updateButton, styles.updateButtonPrimary]}
                  activeOpacity={0.85}
                  onPress={handleDownload}
                >
                  <Text style={styles.updateButtonPrimaryText}>立即下载</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );

  const tabBarStyle = {
    backgroundColor: theme.tabBarBg,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingTop: 8,
    paddingBottom: Math.max(insets.bottom, 20) + 8,
    minHeight: 56 + Math.max(insets.bottom, 20),
  };

  const phoneModeTabBarStyle = {
    height: 0,
    overflow: "hidden" as const,
    padding: 0,
    minHeight: 0,
    borderTopWidth: 0,
  };

  // 统一在一个根下渲染 updateModal，避免在两种布局间“移动”同一 Modal 导致 Android 报错：
  // "The specified child already has a parent. You must call removeView() on the child's parent first."
  return (
    <>
      {/* 正在重定向到登录页时，不渲染 Tabs 内容，避免闪烁 */}
      {!isLoading && !user?.token ? null : (
        <View style={phoneModeEnabled ? styles.phoneModeRoot : styles.normalModeRoot}>
          <PhoneFrame enabled={phoneModeEnabled}>
            {/* Tabs 在手机模式开关时始终挂载，避免 expo-router state.stale 崩溃 */}
            <View
              style={[
                styles.phoneContent,
                !phoneModeEnabled && styles.phoneContentNormal,
                phoneModeEnabled && isLocked && styles.phoneContentHidden,
              ]}
              pointerEvents={phoneModeEnabled && isLocked ? "none" : "auto"}
            >
              <View
                style={[
                  styles.tabsWrap,
                  phoneModeEnabled &&
                    phoneScreen === "desktop" &&
                    styles.tabsWrapHidden,
                ]}
                pointerEvents={
                  phoneModeEnabled && phoneScreen === "desktop" ? "none" : "auto"
                }
              >
                <Tabs
                  screenOptions={{
                    ...(phoneModeEnabled
                      ? {
                          headerShown: false,
                          ...tabBarCommon,
                          tabBarStyle: phoneModeTabBarStyle,
                        }
                      : {
                          headerShown: true,
                          headerTitleAlign: "center",
                          headerStyle: {
                            backgroundColor: theme.navBarBg,
                            borderBottomWidth: 1,
                            borderBottomColor: theme.borderNav,
                          },
                          headerTitleStyle: {
                            fontSize: 20,
                            fontWeight: "700",
                            color: theme.navTitlePink,
                          },
                          ...tabBarCommon,
                          tabBarStyle,
                        }),
                  }}
                >
                  <Tabs.Screen
                    name="chat"
                    options={{
                      title: "聊天",
                      headerShown: false,
                      tabBarIcon: phoneModeEnabled
                        ? undefined
                        : ({ color, focused }) => (
                            <View>
                              <Ionicons
                                name={focused ? "chatbubble" : "chatbubble-outline"}
                                size={24}
                                color={color}
                              />
                              <Text
                                style={{
                                  color: theme.navTitlePink,
                                  fontSize: 12,
                                  width: "100%",
                                  textAlign: "center",
                                }}
                              >
                                聊天
                              </Text>
                            </View>
                          ),
                    }}
                  />
                  <Tabs.Screen
                    name="moments"
                    options={{
                      title: "朋友圈",
                      tabBarIcon: phoneModeEnabled
                        ? undefined
                        : ({ color, focused }) => (
                            <View
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Ionicons
                                name={focused ? "compass" : "compass-outline"}
                                size={24}
                                color={color}
                              />
                              <Text
                                style={{
                                  color: theme.navTitlePink,
                                  fontSize: 12,
                                  minWidth: 50,
                                  textAlign: "center",
                                }}
                              >
                                朋友圈
                              </Text>
                            </View>
                          ),
                    }}
                  />
                  <Tabs.Screen
                    name="entertainment"
                    options={{
                      title: "娱乐",
                      headerShown: false,
                      tabBarIcon: phoneModeEnabled
                        ? undefined
                        : ({ color, focused }) => (
                            <View
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Ionicons
                                name={
                                  focused ? "game-controller" : "game-controller-outline"
                                }
                                size={24}
                                color={color}
                              />
                              <Text
                                style={{
                                  color: theme.navTitlePink,
                                  fontSize: 12,
                                  minWidth: 50,
                                  textAlign: "center",
                                }}
                              >
                                娱乐
                              </Text>
                            </View>
                          ),
                    }}
                    listeners={{
                      tabPress: (e) => {
                        // 始终回到娱乐首页，而不是保留上次停留的子页
                        e.preventDefault();
                        router.replace("/(tabs)/entertainment");
                      },
                    }}
                  />
                  <Tabs.Screen
                    name="profile"
                    options={{
                      title: "我的",
                      headerTitleAlign: phoneModeEnabled ? "center" : "left",
                      headerTitleStyle: {
                        fontSize: 20,
                        fontWeight: "700",
                        color: "#a53f68",
                      },
                      tabBarIcon: phoneModeEnabled
                        ? undefined
                        : ({ color, focused }) => (
                            <View>
                              <Ionicons
                                name={focused ? "person" : "person-outline"}
                                size={24}
                                color={focused ? theme.wechatGreen : color}
                              />
                              <Text style={{ color: theme.navTitlePink, fontSize: 12 }}>
                                我的
                              </Text>
                            </View>
                          ),
                    }}
                  />
                </Tabs>
              </View>
              {phoneModeEnabled && phoneScreen === "desktop" && (
                <View style={styles.desktopOverlay}>
                  <PhoneDesktop />
                </View>
              )}
              {phoneModeEnabled ? <PhoneModeHomeButton /> : null}
            </View>
            {phoneModeEnabled && isLocked && (
              <View style={styles.lockOverlay} pointerEvents="auto">
                <PhoneLockScreen />
              </View>
            )}
          </PhoneFrame>
        </View>
      )}
      {updateModal}
    </>
  );
}

const styles = StyleSheet.create({
  phoneModeRoot: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  normalModeRoot: {
    flex: 1,
    backgroundColor: theme.pageBg,
  },
  phoneContent: {
    flex: 1,
    position: "relative",
  },
  phoneContentNormal: {
    backgroundColor: theme.pageBg,
  },
  phoneContentHidden: {
    opacity: 0,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
  },
  tabsWrap: {
    flex: 1,
  },
  tabsWrapHidden: {
    opacity: 0,
  },
  desktopOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    elevation: 10,
  },
  homeBtn: {
    position: "absolute",
    zIndex: 20,
    elevation: 20,
    left: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  updateMask: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
  },
  updateCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    ...theme.bubbleShadow,
  },
  updateTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: theme.textPrimary,
    lineHeight: 24,
  },
  updateText: {
    marginTop: 8,
    fontSize: 14,
    color: theme.textSecondary,
    lineHeight: 20,
  },
  updateUrl: {
    marginTop: 8,
    fontSize: 12,
    color: theme.textMuted,
  },
  updateButtonsRow: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap",
  },
  updateButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(165,63,104,0.06)",
  },
  updateButtonPrimary: {
    backgroundColor: theme.wechatGreen,
  },
  updateButtonText: {
    fontSize: 14,
    color: theme.navTitlePink,
  },
  updateButtonPrimaryText: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "600",
  },
});
