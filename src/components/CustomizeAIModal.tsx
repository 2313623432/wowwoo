import {
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Switch,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { theme } from "@/constants/theme";
import { PreviewableImage } from "@/components/PreviewableImage";
import { useAuth } from "@/contexts/AuthContext";
import { getAvatarUrl, uploadAvatarFile } from "@/services/users";
import { useEffect, useState } from "react";

export type WorldBookKeywordItem = {
  name: string;
  description: string;
};

export type CustomizeAIData = {
  /** 头像：image_id（上传后返回）或 base64 data URI，可选 */
  avatarUri?: string | null;
  name: string;
  worldview: string;
  identity: string;
  hobbies: string;
  personality: string;
  description: string;
  worldBookKeywords: WorldBookKeywordItem[];
  /** 是否开启动作场景描写 */
  enableActionSceneDescription: boolean;
};

/** 人物描述不可编辑的 AI/会话 id 列表 */
const DESCRIPTION_READONLY_IDS = ["1", "2", "3"];

/** 人物描述最大字数 */
const DESCRIPTION_MAX_LENGTH = 5000;
/** 其他短字段（名称、世界观、身份、兴趣、性格、世界书关键词名/描述）最大字数 */
const SHORT_FIELD_MAX_LENGTH = 500;

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit?: (data: CustomizeAIData) => void | Promise<void>;
  /** 提交中状态，用于禁用按钮并显示加载文案 */
  submitting?: boolean;
  /** 编辑模式下的初始数据，传入时会预填表单 */
  initialData?: CustomizeAIData | null;
  /** 当前 AI/会话 id，若在 DESCRIPTION_READONLY_IDS 中则人物描述不可编辑 */
  aiId?: string | null;
  /** 是否为只读展示（如默认角色）：仅展示头像、名称、描述，不可编辑 */
  readOnly?: boolean;
};

export function CustomizeAIModal({
  visible,
  onClose,
  onSubmit,
  submitting = false,
  initialData,
  aiId,
  readOnly = false,
}: Props) {
  const isDescriptionReadonly =
    aiId != null && DESCRIPTION_READONLY_IDS.includes(String(aiId));
  const { user } = useAuth();
  /** 本地预览用的 uri */
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  /** 上传后返回的 image_id，用于提交给后端 */
  const [avatarImageId, setAvatarImageId] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [name, setName] = useState("");
  const [worldview, setWorldview] = useState("");
  const [identity, setIdentity] = useState("");
  const [hobbies, setHobbies] = useState("");
  const [personality, setPersonality] = useState("");
  const [description, setDescription] = useState("");
  const [keywordEntries, setKeywordEntries] = useState<
    { name: string; description: string }[]
  >([]);
  const [expandedKeywords, setExpandedKeywords] = useState<
    Record<number, boolean>
  >({});
  const [enableActionSceneDescription, setEnableActionSceneDescription] =
    useState(false);
  const [error, setError] = useState("");

  /** 编辑模式：打开时用 initialData 预填表单 */
  useEffect(() => {
    if (!visible || !initialData) return;

    setName(initialData.name ?? "");
    setWorldview(initialData.worldview ?? "");
    setIdentity(initialData.identity ?? "");
    setHobbies(initialData.hobbies ?? "");
    setPersonality(initialData.personality ?? "");
    setDescription(initialData.description ?? "");
    console.log("initialData.worldBookKeywords", initialData.worldBookKeywords);
    setKeywordEntries(
      initialData.worldBookKeywords?.length
        ? [...initialData.worldBookKeywords]
        : [],
    );
    setExpandedKeywords({});
    setEnableActionSceneDescription(
      initialData.enableActionSceneDescription ?? false,
    );
    setError("");
    setAvatarImageId(initialData.avatarUri ?? null);
    console.log("initialData.avatarUri", initialData);

    const rawAvatar = initialData.avatarUri ?? null;
    if (!rawAvatar) {
      setAvatarUri(null);
      return;
    }
    // 已是完整 URL 则直接展示
    if (rawAvatar.startsWith("http://") || rawAvatar.startsWith("https://")) {
      setAvatarUri(rawAvatar);
      return;
    }
    // 否则视为 image_id，解析为临时链接再展示
    if (!user?.token) {
      setAvatarUri(null);
      return;
    }
    console.log("rawAvatar", rawAvatar);
    getAvatarUrl(user.token, rawAvatar)
      .then((url) => setAvatarUri(typeof url === "string" && url ? url : null))
      .catch(() => setAvatarUri(null));
  }, [visible, initialData, user?.token]);

  /** 弹窗完全关闭（UI 消失）后再重置表单，避免关闭动画过程中表单闪动 */
  useEffect(() => {
    if (!visible) {
      const timer = setTimeout(() => {
        setAvatarUri(null);
        setAvatarImageId(null);
        setName("");
        setWorldview("");
        setIdentity("");
        setHobbies("");
        setPersonality("");
        setDescription("");
        setKeywordEntries([]);
        setExpandedKeywords({});
        setEnableActionSceneDescription(false);
        setError("");
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  const handlePickAvatar = async () => {
    if (!user?.token) return;

    // 原生端使用 ImagePicker 支持裁剪，Web 端保留 DocumentPicker
    if (Platform.OS !== "web") {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        setError("需要相册权限才能选择头像");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (!asset.uri) return;
      const file = {
        uri: asset.uri,
        name:
          asset.fileName ??
          `ai_avatar_${Date.now()}_${Math.random().toString(16).slice(2)}.jpg`,
        type: asset.mimeType ?? "image/jpeg",
      };
      setUploadingAvatar(true);
      setError("");
      try {
        const uploadResult = await uploadAvatarFile(user.token, file, {
          compress: true,
        });
        if (!uploadResult?.imageId) {
          setError("头像上传失败，请重试");
          return;
        }
        setAvatarImageId(uploadResult.imageId);
        const resolvedUrl = await getAvatarUrl(user.token, uploadResult.imageId)
          .then((u) => (typeof u === "string" ? u : ""))
          .catch(() => "");
        const displayUri = uploadResult.localUri ?? resolvedUrl ?? file.uri;
        if (displayUri) setAvatarUri(displayUri);
        setError("");
      } catch {
        setError("头像上传失败，请重试");
      } finally {
        setUploadingAvatar(false);
      }
      return;
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: "image/*",
      copyToCacheDirectory: true,
    });
    const file = (result as any).output?.[0] ?? (result as any).assets?.[0];
    if (result.canceled || !file) return;
    setUploadingAvatar(true);
    setError("");
    try {
      const uploadResult = await uploadAvatarFile(user.token, file, {
        compress: true,
      });
      if (!uploadResult?.imageId) {
        setError("头像上传失败，请重试");
        return;
      }
      setAvatarImageId(uploadResult.imageId);
      const resolvedUrl = await getAvatarUrl(user.token, uploadResult.imageId)
        .then((u) => (typeof u === "string" ? u : ""))
        .catch(() => "");
      const displayUri =
        uploadResult.localUri ?? resolvedUrl ?? (file as { uri?: string }).uri;
      if (displayUri) setAvatarUri(displayUri);
      setError("");
    } catch {
      setError("头像上传失败，请重试");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const addKeywordEntry = () => {
    const newIndex = keywordEntries.length;
    setKeywordEntries((prev) => [...prev, { name: "", description: "" }]);
    setExpandedKeywords((prev) => ({ ...prev, [newIndex]: true }));
  };

  const updateKeywordEntry = (
    index: number,
    field: "name" | "description",
    value: string,
  ) => {
    setKeywordEntries((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  };

  const toggleKeywordExpanded = (index: number) => {
    setExpandedKeywords((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const removeKeywordEntry = (index: number) => {
    setKeywordEntries((prev) => prev.filter((_, i) => i !== index));
    setExpandedKeywords((prev) => {
      const next: Record<number, boolean> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const i = Number(k);
        if (i < index) next[i] = v;
        if (i > index) next[i - 1] = v;
      });
      return next;
    });
  };

  const handleSubmit = () => {
    const nameTrim = name.trim();
    const descTrim = description.trim();
    if (!nameTrim) {
      setError("请填写名称");
      return;
    }
    if (nameTrim.length > SHORT_FIELD_MAX_LENGTH) {
      setError(`名称最多 ${SHORT_FIELD_MAX_LENGTH} 字`);
      return;
    }
    if (!descTrim) {
      setError("请填写人物描述");
      return;
    }
    if (descTrim.length > DESCRIPTION_MAX_LENGTH) {
      setError(`人物描述最多 ${DESCRIPTION_MAX_LENGTH} 字`);
      return;
    }
    if (worldview.length > SHORT_FIELD_MAX_LENGTH) {
      setError(`世界观最多 ${SHORT_FIELD_MAX_LENGTH} 字`);
      return;
    }
    if (identity.length > SHORT_FIELD_MAX_LENGTH) {
      setError(`身份设定最多 ${SHORT_FIELD_MAX_LENGTH} 字`);
      return;
    }
    if (hobbies.length > SHORT_FIELD_MAX_LENGTH) {
      setError(`兴趣爱好最多 ${SHORT_FIELD_MAX_LENGTH} 字`);
      return;
    }
    if (personality.length > SHORT_FIELD_MAX_LENGTH) {
      setError(`性格最多 ${SHORT_FIELD_MAX_LENGTH} 字`);
      return;
    }
    for (let i = 0; i < keywordEntries.length; i++) {
      const e = keywordEntries[i];
      if (e.name.trim() && e.name.length > SHORT_FIELD_MAX_LENGTH) {
        setError(`世界书关键词 ${i + 1} 的名称最多 ${SHORT_FIELD_MAX_LENGTH} 字`);
        return;
      }
      if (e.description.trim() && e.description.length > SHORT_FIELD_MAX_LENGTH) {
        setError(`世界书关键词 ${i + 1} 的描述最多 ${SHORT_FIELD_MAX_LENGTH} 字`);
        return;
      }
    }
    setError("");
    onSubmit?.({
      avatarUri: avatarImageId ?? undefined,
      name: nameTrim,
      worldview,
      identity,
      hobbies,
      personality,
      description: descTrim,
      worldBookKeywords: keywordEntries.filter(
        (e) => e.name.trim() || e.description.trim(),
      ),
      enableActionSceneDescription,
    });
    handleClose();
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.keyboardWrap}
        >
          <View style={styles.card}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "on-drag" : "none"}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              {readOnly ? (
                <>
                  <View style={styles.avatarSection}>
                    <View style={styles.avatarTouchable}>
                      {avatarUri ? (
                        <PreviewableImage
                          source={{ uri: avatarUri }}
                          style={styles.avatarImage}
                          accessibilityLabel="角色头像"
                        />
                      ) : (
                        <View style={styles.avatarPlaceholder}>
                          <Ionicons
                            name="image-outline"
                            size={28}
                            color={theme.pink}
                          />
                        </View>
                      )}
                    </View>
                  </View>
                  <Text style={styles.label}>名称</Text>
                  <Text style={styles.readOnlyValue}>{name || "—"}</Text>
                  <Text style={styles.label}>人物描述</Text>
                  <Text style={[styles.readOnlyValue, styles.readOnlyDesc]}>
                    {description || "—"}
                  </Text>
                  <TouchableOpacity
                    style={styles.cancelWrap}
                    onPress={handleClose}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.cancelText}>关闭</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  {/* <Text style={styles.title}>✨ 定制你的AI ✨</Text> */}

                  <View style={styles.avatarSection}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={handlePickAvatar}
                      style={styles.avatarTouchable}
                      disabled={uploadingAvatar}
                    >
                      {avatarUri ? (
                        <Image
                          source={{ uri: avatarUri }}
                          style={styles.avatarImage}
                        />
                      ) : (
                        <View style={styles.avatarPlaceholder}>
                          <Ionicons
                            name="image-outline"
                            size={28}
                            color={theme.pink}
                          />
                        </View>
                      )}
                      {uploadingAvatar && (
                        <View style={styles.avatarOverlay}>
                          <ActivityIndicator size="small" color="#fff" />
                        </View>
                      )}
                    </TouchableOpacity>
                    {/* <Text style={styles.avatarHint}>支持上传头像</Text> */}
                  </View>

                  <Text style={styles.label}>
                    名称 <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="例如: 小美"
                    placeholderTextColor={theme.pinkPlaceholder}
                    value={name}
                    onChangeText={(t) => {
                      setName(t);
                      setError("");
                    }}
                  />

                  <Text style={styles.label}>世界观</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="如: 只有你我的末世"
                    placeholderTextColor={theme.pinkPlaceholder}
                    value={worldview}
                    onChangeText={setWorldview}
                  />

                  <Text style={styles.label}>身份设定</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="霸总/富二代/学长..."
                    placeholderTextColor={theme.pinkPlaceholder}
                    value={identity}
                    onChangeText={setIdentity}
                  />

                  <Text style={styles.label}>兴趣爱好</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="骑车/读书/游戏"
                    placeholderTextColor={theme.pinkPlaceholder}
                    value={hobbies}
                    onChangeText={setHobbies}
                  />

                  <Text style={styles.label}>性格</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="毒舌/高冷/温柔/可爱"
                    placeholderTextColor={theme.pinkPlaceholder}
                    value={personality}
                    onChangeText={setPersonality}
                  />

                  <Text style={styles.label}>
                    人物描述 <Text style={styles.required}>*</Text>
                    <Text
                      style={[
                        styles.charCount,
                        description.length > DESCRIPTION_MAX_LENGTH &&
                          styles.charCountOver,
                      ]}
                    >
                      （{description.length}/{DESCRIPTION_MAX_LENGTH}）
                    </Text>
                  </Text>
                  <TextInput
                    style={[styles.input, styles.inputMultiline]}
                    placeholder="简要描述该AI人物的外貌、背景等"
                    placeholderTextColor={theme.pinkPlaceholder}
                    value={description}
                    onChangeText={(t) => {
                      setDescription(t);
                      setError("");
                    }}
                    multiline
                    numberOfLines={5}
                    editable={!isDescriptionReadonly}
                  />

                  <Text style={styles.label}>世界书关键词</Text>
                  {keywordEntries.map((entry, i) => {
                    const isExpanded = expandedKeywords[i];
                    return (
                      <View key={i} style={styles.keywordEntryCard}>
                        <TouchableOpacity
                          style={styles.keywordEntryHeader}
                          onPress={() => toggleKeywordExpanded(i)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.keywordEntryHeaderLeft}>
                            <Text style={styles.keywordEntryTitle}>
                              关键词 {i + 1}
                            </Text>
                            <Text
                              style={styles.keywordEntryName}
                              numberOfLines={1}
                            >
                              {entry.name.trim() || "未填写名称"}
                            </Text>
                          </View>
                          <View style={styles.keywordEntryHeaderRight}>
                            <Ionicons
                              name={isExpanded ? "chevron-up" : "chevron-down"}
                              size={20}
                              color={theme.textSecondary}
                            />
                            <TouchableOpacity
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              onPress={(e) => {
                                e.stopPropagation();
                                removeKeywordEntry(i);
                              }}
                              style={styles.tagRemove}
                            >
                              <Ionicons
                                name="close-circle"
                                size={20}
                                color={theme.pink}
                              />
                            </TouchableOpacity>
                          </View>
                        </TouchableOpacity>
                        {isExpanded && (
                          <View style={styles.keywordEntryBody}>
                            <TextInput
                              style={styles.input}
                              placeholder="名称"
                              placeholderTextColor={theme.pinkPlaceholder}
                              value={entry.name}
                              onChangeText={(t) =>
                                updateKeywordEntry(i, "name", t)
                              }
                            />
                            <TextInput
                              style={styles.input}
                              placeholder="描述"
                              placeholderTextColor={theme.pinkPlaceholder}
                              value={entry.description}
                              onChangeText={(t) =>
                                updateKeywordEntry(i, "description", t)
                              }
                            />
                          </View>
                        )}
                      </View>
                    );
                  })}
                  <TouchableOpacity
                    style={styles.addKeywordBtnWrap}
                    onPress={addKeywordEntry}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="add-circle-outline"
                      size={22}
                      color={theme.wechatGreen}
                    />
                    <Text style={styles.addKeywordBtnText}>添加一条关键词</Text>
                  </TouchableOpacity>

                  <View style={styles.switchBlock}>
                    <View style={styles.switchRow}>
                      <Text style={styles.label}>是否开启动作场景描写</Text>
                      <Switch
                        value={enableActionSceneDescription}
                        onValueChange={setEnableActionSceneDescription}
                        trackColor={{
                          false: theme.border,
                          true: theme.pinkLight,
                        }}
                        thumbColor={
                          enableActionSceneDescription ? theme.pink : "#f4f3f4"
                        }
                      />
                    </View>
                    <Text style={styles.switchNote}>
                      (开启后角色对话会附带括号来说明此刻的状态)
                    </Text>
                  </View>

                  {error ? <Text style={styles.errorText}>{error}</Text> : null}

                  <TouchableOpacity
                    style={[
                      styles.submitBtn,
                      submitting && styles.submitBtnDisabled,
                    ]}
                    onPress={handleSubmit}
                    disabled={submitting}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="heart"
                      size={20}
                      color="#fff"
                      style={styles.submitIcon}
                    />
                    <Text style={styles.submitText}>
                      {submitting ? "创建中..." : "立即创建"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelWrap}
                    onPress={handleClose}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.cancelText}>取消</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  keyboardWrap: {
    width: "100%",
    maxHeight: "90%",
    justifyContent: "center",
  },
  card: {
    backgroundColor: theme.cardBg,
    borderRadius: theme.radiusLg,
    padding: 20,
    width: "100%",
    maxWidth: 340,
    maxHeight: "90%",
    borderWidth: 1,
    borderColor: theme.border,
    ...theme.shadowLight,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.navTitlePink,
    marginBottom: 16,
    textAlign: "center",
  },
  label: {
    fontSize: 14,
    color: theme.textSecondary,
    marginBottom: 6,
  },
  required: {
    color: theme.badgeRed,
  },
  charCount: {
    fontSize: 12,
    color: theme.textMuted,
    fontWeight: "normal",
    marginLeft: 4,
  },
  charCountOver: {
    color: theme.badgeRed,
  },
  errorText: {
    fontSize: 13,
    color: theme.badgeRed,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.pinkLight,
    borderRadius: theme.radiusSm,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: theme.textPrimary,
    marginBottom: 12,
  },
  inputMultiline: {
    minHeight: 5 * 24,
    textAlignVertical: "top",
  },
  keywordEntryCard: {
    backgroundColor: theme.pinkBgTag,
    borderRadius: theme.radiusSm,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.pinkLight,
  },
  keywordEntryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  keywordEntryHeaderLeft: {
    flex: 1,
    marginRight: 8,
  },
  keywordEntryTitle: {
    fontSize: 12,
    color: theme.textSecondary,
    marginBottom: 2,
  },
  keywordEntryName: {
    fontSize: 14,
    color: theme.textPrimary,
    fontWeight: "500",
  },
  keywordEntryHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  keywordEntryBody: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.pinkLight,
  },
  tagRemove: {
    padding: 4,
  },
  addKeywordBtnWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.pinkLight,
    borderRadius: theme.radiusSm,
  },
  addKeywordBtnText: {
    fontSize: 14,
    color: theme.pink,
    fontWeight: "500",
  },
  switchBlock: {
    marginBottom: 16,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  switchNote: {
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 6,
    marginLeft: 0,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.btnPrimaryBg,
    paddingVertical: 14,
    borderRadius: theme.radiusMd,
    width: "100%",
    marginTop: 8,
    marginBottom: 12,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitIcon: {
    marginRight: 6,
  },
  submitText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  cancelWrap: {
    alignItems: "center",
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 14,
    color: theme.pink,
  },
  readOnlyValue: {
    fontSize: 15,
    color: theme.textPrimary,
    marginBottom: 12,
  },
  readOnlyDesc: {
    minHeight: 24,
    lineHeight: 22,
  },
  avatarSection: {
    alignItems: "center",
    marginBottom: 16,
  },
  avatarTouchable: {
    marginBottom: 6,
    position: "relative",
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: theme.pinkLight,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: theme.pinkLight,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.pinkBgTag,
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 40,
  },
  avatarHint: {
    fontSize: 12,
    color: theme.badgeRed,
  },
});
