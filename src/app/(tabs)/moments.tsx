import { useCallback, useLayoutEffect, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import { useNavigation, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { theme } from "@/constants/theme";
import * as ImagePicker from "expo-image-picker";
import { MomentApiItem } from "@/services/moment";
import { ComingSoonModal } from "@/components/ComingSoonModal";
import { PreviewableImage } from "@/components/PreviewableImage";

/** 朋友圈功能暂时不可用：点击 tab 只显示与「娱乐」一致的敬请期待弹窗，原有逻辑保留仅隐藏 UI */
const MOMENTS_FEATURE_DISABLED = true;
/** 宣传展示：开启后使用本地假数据，不请求后端、不上传 */
const MOMENTS_DEMO_MODE = true;

/** 将 created_at 格式化为相对时间 */
function formatMomentTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return "刚刚";
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return `${d.getMonth() + 1}-${d.getDate()}`;
  } catch {
    return "";
  }
}

export default function MomentsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [moments, setMoments] = useState<MomentApiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [composerVisible, setComposerVisible] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [photoComposerVisible, setPhotoComposerVisible] = useState(false);
  const [photoComposerText, setPhotoComposerText] = useState("");
  const [selectedPhotos, setSelectedPhotos] = useState<
    { uri: string; fileName: string; mimeType: string }[]
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [comingSoonVisible, setComingSoonVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (MOMENTS_FEATURE_DISABLED) {
        setComingSoonVisible(true);
      }
    }, []),
  );

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        if (MOMENTS_DEMO_MODE) {
          if (isMounted) setMoments([]);
          return;
        }
        // 非 demo 模式才接后端（当前用于宣传展示，默认关闭）
        if (isMounted) setMoments([]);
      } catch (e: any) {
        if (isMounted) {
          setError(e?.message || "加载朋友圈失败");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [user?.token]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: MOMENTS_FEATURE_DISABLED
        ? undefined
        : () => (
            <TouchableOpacity
              onPress={() => setActionSheetVisible(true)}
              style={styles.headerRightBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="camera-outline" size={24} color={theme.pink} />
            </TouchableOpacity>
          ),
    });
  }, [navigation]);

  const handlePublishText = () => {
    setActionSheetVisible(false);
    setComposerVisible(true);
  };

  const handlePublishPhotos = async () => {
    setActionSheetVisible(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      setError("需要相册权限才能选择图片");
      return;
    }
    // 先选一张并裁剪，用户可在发表框中多次添加，保证每张图都经过裁剪
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.uri) return;
    const picked = {
      uri: asset.uri,
      fileName:
        asset.fileName ??
        `moment_${Date.now()}_${Math.random().toString(16).slice(2)}.jpg`,
      mimeType: asset.mimeType ?? "image/jpeg",
    };
    setSelectedPhotos((prev) => {
      const merged = [...prev, picked].slice(0, 9);
      return merged;
    });
    setPhotoComposerText("");
    setPhotoComposerVisible(true);
  };

  const handleSubmitText = async () => {
    const trimmed = composerText.trim();
    if (!trimmed) {
      setComposerVisible(false);
      return;
    }
    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const meNickname = user?.nickname || "我";
      const created: MomentApiItem = {
        id: `mock_${Date.now()}`,
        user_id: user?.id || "me",
        nickname: meNickname,
        avatar: user?.avatarUri || null,
        content: trimmed,
        images: [],
        likes_count: 0,
        comments_count: 0,
        created_at: now,
      };
      setMoments((prev) => [created, ...prev]);
      setComposerText("");
      setComposerVisible(false);
    } catch (e: any) {
      setError(e?.message || "发表失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const submitPhotos = async () => {
    if (selectedPhotos.length === 0) {
      setPhotoComposerVisible(false);
      return;
    }
    const text = photoComposerText.trim();
    setSubmitting(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const meNickname = user?.nickname || "我";
      const created: MomentApiItem = {
        id: `mock_${Date.now()}`,
        user_id: user?.id || "me",
        nickname: meNickname,
        avatar: user?.avatarUri || null,
        content: text || "",
        images: selectedPhotos.map((p) => p.uri).slice(0, 9),
        likes_count: 0,
        comments_count: 0,
        created_at: now,
      };
      setMoments((prev) => [created, ...prev]);
      setSelectedPhotos([]);
      setPhotoComposerText("");
      setPhotoComposerVisible(false);
    } catch (e: any) {
      setError(e?.message || "发表失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const normalizeRemoteUri = useCallback(
    (raw: string | null | undefined) => raw || "",
    [],
  );

  const renderHeader = () => {
    const nickname = user?.nickname || "我";
    return (
      <View style={styles.headerContainer}>
        <View style={styles.headerTop} />
        <View style={styles.headerBottom}>
          <Text style={styles.headerNickname}>{nickname}</Text>
          <View style={styles.headerAvatarWrapper}>
            {user?.avatarUri ? (
              <PreviewableImage
                source={{ uri: user.avatarUri }}
                style={styles.headerAvatarImage}
                accessibilityLabel="我的头像"
              />
            ) : (
              <View style={styles.headerAvatarPlaceholder}>
                <Text style={styles.headerAvatarText}>{nickname[0]}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderItem = ({ item }: { item: MomentApiItem }) => (
    <View style={styles.momentRow}>
      {item.avatar ? (
        <PreviewableImage
          source={{ uri: normalizeRemoteUri(item.avatar) }}
          style={styles.momentAvatarImage}
          accessibilityLabel="头像"
        />
      ) : (
        <View
          style={[styles.momentAvatar, { backgroundColor: theme.pinkBgTag }]}
        >
          <Text style={styles.momentAvatarText}>
            {item.nickname?.[0] ?? "?"}
          </Text>
        </View>
      )}
      <View style={styles.momentContent}>
        <Text style={styles.momentAuthor}>{item.nickname}</Text>
        {item.content ? (
          <Text style={styles.momentText}>{item.content}</Text>
        ) : null}
        {item.images && item.images.length > 0 && (
          <View style={styles.momentImages}>
            {item.images.slice(0, 9).map((uri, idx) => (
              <PreviewableImage
                key={`${item.id}-${idx}`}
                source={{ uri: normalizeRemoteUri(uri) }}
                style={styles.momentThumb}
                accessibilityLabel="动态图片"
              />
            ))}
          </View>
        )}
        <View style={styles.momentMetaRow}>
          <Text style={styles.momentTime}>
            {formatMomentTime(item.created_at)}
          </Text>
          <View style={styles.momentMetaActions}>
            <Ionicons
              name="heart-outline"
              size={16}
              color={theme.textMuted}
              style={styles.momentMetaIcon}
            />
            <Text style={styles.momentMetaText}>{item.likes_count}</Text>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={16}
              color={theme.textMuted}
              style={[styles.momentMetaIcon, { marginLeft: 12 }]}
            />
            <Text style={styles.momentMetaText}>{item.comments_count}</Text>
          </View>
        </View>
      </View>
    </View>
  );

  if (MOMENTS_FEATURE_DISABLED) {
    return (
      <View style={[styles.container, styles.placeholderContainer]}>
        <View style={styles.placeholderInner} />
        <ComingSoonModal
          visible={comingSoonVisible}
          onClose={() => setComingSoonVisible(false)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 8 }]}>
      {error ? (
        <View style={styles.stateWrap}>
          <Text style={styles.stateText}>{error}</Text>
        </View>
      ) : null}
      {loading ? (
        <View style={styles.stateWrap}>
          <Text style={styles.stateText}>加载中...</Text>
        </View>
      ) : (
        <FlatList
          data={moments}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.stateWrap}>
              <Text style={styles.stateText}>暂无动态，发一条吧～</Text>
            </View>
          }
        />
      )}

      {/* 发布方式选择（仿微信底部操作栏） */}
      <Modal
        visible={actionSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setActionSheetVisible(false)}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => setActionSheetVisible(false)}
        >
          <Pressable style={styles.sheetContainer} onPress={() => {}}>
            <TouchableOpacity
              style={styles.sheetItem}
              activeOpacity={0.8}
              onPress={() => {
                // TODO: 接入拍照
                setActionSheetVisible(false);
              }}
            >
              <Ionicons
                name="camera-outline"
                size={22}
                color={theme.wechatGreen}
                style={styles.sheetIcon}
              />
              <Text style={styles.sheetText}>拍照发布（敬请期待）</Text>
            </TouchableOpacity>
            <View style={styles.sheetDivider} />
            <TouchableOpacity
              style={styles.sheetItem}
              activeOpacity={0.8}
              onPress={() => {
                handlePublishPhotos();
              }}
            >
              <Ionicons
                name="images-outline"
                size={22}
                color={theme.wechatGreen}
                style={styles.sheetIcon}
              />
              <Text style={styles.sheetText}>从相册选择</Text>
            </TouchableOpacity>
            <View style={styles.sheetDivider} />
            <TouchableOpacity
              style={styles.sheetItem}
              activeOpacity={0.8}
              onPress={handlePublishText}
            >
              <Ionicons
                name="create-outline"
                size={22}
                color={theme.wechatGreen}
                style={styles.sheetIcon}
              />
              <Text style={styles.sheetText}>发表文字</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetCancel}
              activeOpacity={0.8}
              onPress={() => setActionSheetVisible(false)}
            >
              <Text style={styles.sheetCancelText}>取消</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 文字发表框 */}
      <Modal
        visible={composerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setComposerVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.composerOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <TouchableOpacity
            style={styles.composerBackdrop}
            activeOpacity={1}
            onPress={() => setComposerVisible(false)}
          />
          <View style={styles.composerBox}>
            <Text style={styles.composerTitle}>发表文字</Text>
            <TextInput
              style={styles.composerInput}
              multiline
              placeholder="这一刻的想法..."
              placeholderTextColor={theme.pinkPlaceholder}
              value={composerText}
              onChangeText={setComposerText}
              maxLength={280}
            />
            <View style={styles.composerActions}>
              <TouchableOpacity
                style={styles.composerBtnCancel}
                onPress={() => setComposerVisible(false)}
              >
                <Text style={styles.composerBtnCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.composerBtnOk}
                onPress={handleSubmitText}
                disabled={submitting}
              >
                <Text style={styles.composerBtnOkText}>
                  {submitting ? "发送中..." : "发送"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 图片发表框 */}
      <Modal
        visible={photoComposerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoComposerVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.composerOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <TouchableOpacity
            style={styles.composerBackdrop}
            activeOpacity={1}
            onPress={() => setPhotoComposerVisible(false)}
          />
          <View style={styles.photoComposerBox}>
            <Text style={styles.composerTitle}>发表图片</Text>
            <View style={styles.photoGrid}>
              {selectedPhotos.slice(0, 9).map((p) => (
                <View key={p.uri} style={styles.photoCell}>
                  <PreviewableImage
                    source={{ uri: p.uri }}
                    style={styles.photoCellImage}
                    accessibilityLabel="待发布图片"
                  />
                  <TouchableOpacity
                    style={styles.photoRemove}
                    onPress={() =>
                      setSelectedPhotos((prev) =>
                        prev.filter((x) => x.uri !== p.uri),
                      )
                    }
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close-circle" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
              {selectedPhotos.length < 9 ? (
                <TouchableOpacity
                  style={[styles.photoCell, styles.photoAddCell]}
                  onPress={handlePublishPhotos}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add" size={24} color={theme.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>
            <TextInput
              style={styles.photoComposerInput}
              multiline
              placeholder="配一句话（可选）..."
              placeholderTextColor={theme.pinkPlaceholder}
              value={photoComposerText}
              onChangeText={setPhotoComposerText}
              maxLength={280}
            />
            <View style={styles.composerActions}>
              <TouchableOpacity
                style={styles.composerBtnCancel}
                onPress={() => setPhotoComposerVisible(false)}
              >
                <Text style={styles.composerBtnCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.composerBtnOk}
                onPress={submitPhotos}
                disabled={submitting}
              >
                <Text style={styles.composerBtnOkText}>
                  {submitting ? "发送中..." : "发送"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const HEADER_HEIGHT = 220;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.pageBg,
  },
  placeholderContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderInner: {
    flex: 1,
    alignSelf: "stretch",
  },
  headerRightBtn: {
    padding: 8,
    marginRight: 4,
  },
  listContent: {
    paddingBottom: 16,
  },
  headerContainer: {
    height: HEADER_HEIGHT,
    backgroundColor: "#ffe0f1",
  },
  headerTop: {
    flex: 1,
  },
  headerBottom: {
    height: 90,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerNickname: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginRight: 12,
  },
  headerAvatarWrapper: {
    width: 64,
    height: 64,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#ffd6ec",
    backgroundColor: theme.cardBg,
  },
  headerAvatarImage: {
    width: "100%",
    height: "100%",
  },
  headerAvatarPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.pinkBgTag,
  },
  headerAvatarText: {
    fontSize: 24,
    fontWeight: "700",
    color: theme.navTitlePink,
  },
  momentRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    backgroundColor: theme.pageBg,
  },
  stateWrap: {
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  stateText: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  momentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  momentAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 8,
    marginRight: 10,
  },
  momentAvatarText: {
    fontSize: 18,
    color: "#fff",
    fontWeight: "600",
  },
  momentContent: {
    flex: 1,
  },
  momentAuthor: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.navTitlePink,
    marginBottom: 4,
  },
  momentText: {
    fontSize: 15,
    color: theme.textPrimary,
    lineHeight: 20,
  },
  momentImages: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  momentThumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: theme.border,
  },
  momentMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  momentTime: {
    fontSize: 12,
    color: theme.textMuted,
  },
  momentMetaActions: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: "auto",
  },
  momentMetaIcon: {
    marginRight: 4,
  },
  momentMetaText: {
    fontSize: 12,
    color: theme.textMuted,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  sheetIcon: {
    marginRight: 10,
  },
  sheetText: {
    fontSize: 16,
    color: theme.textPrimary,
  },
  sheetDivider: {
    height: 1,
    backgroundColor: "#f1f5f9",
  },
  sheetCancel: {
    backgroundColor: "#fff",
    marginTop: 8,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 12,
  },
  sheetCancelText: {
    fontSize: 17,
    color: theme.textPrimary,
  },
  composerOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  composerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  composerBox: {
    width: "90%",
    maxWidth: 360,
    backgroundColor: theme.cardBg,
    borderRadius: theme.radiusLg,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.border,
  },
  photoComposerBox: {
    width: "92%",
    maxWidth: 420,
    backgroundColor: theme.cardBg,
    borderRadius: theme.radiusLg,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.border,
  },
  composerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.textPrimary,
    marginBottom: 10,
  },
  composerInput: {
    minHeight: 120,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radiusMd,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: theme.textPrimary,
    textAlignVertical: "top",
  },
  photoComposerInput: {
    minHeight: 72,
    maxHeight: 140,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radiusMd,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: theme.textPrimary,
    textAlignVertical: "top",
    marginTop: 12,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  photoCell: {
    width: 86,
    height: 86,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: theme.border,
  },
  photoCellImage: {
    width: "100%",
    height: "100%",
  },
  photoAddCell: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: theme.border,
  },
  photoRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  composerActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 12,
    gap: 12,
  },
  composerBtnCancel: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: theme.pinkBgTag,
  },
  composerBtnCancelText: {
    fontSize: 15,
    color: theme.navTitlePink,
  },
  composerBtnOk: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: theme.btnPrimaryBg,
  },
  composerBtnOkText: {
    fontSize: 15,
    color: "#fff",
    fontWeight: "600",
  },
});
