import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/utils/alert";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { theme } from "@/constants/theme";
import { isValidPhone } from "@/services/auth";
import { RegistrationQueueModal } from "@/components/RegistrationQueueModal";
import { PreviewableImage } from "@/components/PreviewableImage";
import { useKeyboardHeightWeb } from "@/hooks/useKeyboardHeightWeb";
import {
  extractQueueUntilText,
  isRegistrationQueueHint,
} from "@/utils/registrationQueue";

const COUNTDOWN_SECONDS = 60;

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const keyboardHeightWeb = useKeyboardHeightWeb();
  const router = useRouter();
  const { register, registerWithAvatar, sendCode } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarFileName, setAvatarFileName] = useState<string>("avatar.jpg");
  const [avatarType, setAvatarType] = useState<string>("image/jpeg");
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [queueModalVisible, setQueueModalVisible] = useState(false);
  const [queueUntilText, setQueueUntilText] = useState<string | null>(null);
  const [queueRegisterUsers, setQueueRegisterUsers] = useState<number | null>(
    null,
  );
  const [queueTotal, setQueueTotal] = useState<number | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);

  const phoneValid = isValidPhone(phone);
  const passwordValid = password.length >= 6;
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const canSendCode = phoneValid && countdown === 0 && !sending;
  const canSubmit =
    phoneValid &&
    passwordValid &&
    passwordsMatch &&
    code.length >= 4 &&
    !submitting;

  const startCountdown = useCallback(() => {
    setCountdown(COUNTDOWN_SECONDS);
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  const onSendCode = async () => {
    if (!canSendCode) return;
    setSending(true);
    try {
      const res = await sendCode(phone, "register");
      if (res.success) {
        startCountdown();
      } else {
        const hint =
          res.isQueueHint || isRegistrationQueueHint(res.message ?? "");
        if (hint) {
          setQueueUntilText(
            res.queueUntilText ?? extractQueueUntilText(res.message ?? ""),
          );
          setQueueRegisterUsers(
            typeof res.registerUsers === "number" ? res.registerUsers : null,
          );
          setQueueTotal(
            typeof res.queueTotal === "number" ? res.queueTotal : null,
          );
          setQueuePosition(
            typeof res.queuePosition === "number" ? res.queuePosition : null,
          );
          setQueueModalVisible(true);
        } else {
          Alert.alert("提示", res.message ?? "发送失败");
        }
      }
    } catch {
      Alert.alert("提示", "发送失败，请稍后重试");
    } finally {
      setSending(false);
    }
  };

  const pickAvatar = useCallback(async () => {
    const { status } =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("提示", "需要相册权限才能选择头像");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setAvatarUri(asset.uri);
    const fileName = asset.fileName ?? `avatar_${Date.now()}.jpg`;
    setAvatarFileName(fileName);
    setAvatarType(asset.mimeType ?? "image/jpeg");
  }, []);

  const removeAvatar = useCallback(() => {
    setAvatarUri(null);
  }, []);

  const onSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      if (avatarUri) {
        const res = await registerWithAvatar({
          phone,
          password,
          code,
          nickname: nickname.trim() || undefined,
          avatarUri,
          avatarFileName,
          avatarType,
        });
        if (res.success) {
          router.replace("/(tabs)/chat");
        } else {
          Alert.alert("提示", res.message ?? "注册失败");
        }
      } else {
        const res = await register({
          phone,
          password,
          code,
          nickname: nickname.trim() || undefined,
        });
        if (res.success) {
          router.replace("/(tabs)/chat");
        } else {
          Alert.alert("提示", res.message ?? "注册失败");
        }
      }
    } catch {
      Alert.alert("提示", "注册失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        {
          paddingTop: insets.top + 24,
          paddingBottom:
            insets.bottom +
            24 +
            (Platform.OS === "web" ? keyboardHeightWeb : 0),
        },
      ]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <RegistrationQueueModal
        visible={queueModalVisible}
        untilText={queueUntilText}
        registerUsers={queueRegisterUsers}
        queueTotal={queueTotal}
        queuePosition={queuePosition}
        onClose={() => setQueueModalVisible(false)}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <Text style={styles.title}>注册账号</Text>
          <Text style={styles.subtitle}>
            支持密码注册，可选上传头像
          </Text>

          <View style={styles.inputWrap}>
            <Text style={styles.label}>手机号</Text>
            <TextInput
              style={styles.input}
              placeholder="请输入手机号"
              placeholderTextColor={theme.pinkPlaceholder}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              maxLength={11}
              editable={!submitting}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputWrap}>
            <Text style={styles.label}>密码</Text>
            <TextInput
              style={styles.input}
              placeholder="至少 6 位"
              placeholderTextColor={theme.pinkPlaceholder}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!submitting}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputWrap}>
            <Text style={styles.label}>确认密码</Text>
            <TextInput
              style={[
                styles.input,
                confirmPassword.length > 0 && !passwordsMatch && styles.inputError,
              ]}
              placeholder="再次输入密码"
              placeholderTextColor={theme.pinkPlaceholder}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              editable={!submitting}
              autoCapitalize="none"
            />
            {confirmPassword.length > 0 && !passwordsMatch && (
              <Text style={styles.errorText}>两次密码不一致</Text>
            )}
          </View>

          <View style={styles.inputWrap}>
            <Text style={styles.label}>验证码</Text>
            <View style={styles.codeRow}>
              <TextInput
                style={[styles.input, styles.codeInput]}
                placeholder="请输入验证码"
                placeholderTextColor={theme.pinkPlaceholder}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                maxLength={6}
                editable={!submitting}
              />
              <TouchableOpacity
                style={[styles.sendBtn, !canSendCode && styles.sendBtnDisabled]}
                onPress={onSendCode}
                disabled={!canSendCode}
                activeOpacity={0.8}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : countdown > 0 ? (
                  <Text style={styles.sendBtnText}>{countdown}s 后重发</Text>
                ) : (
                  <Text style={styles.sendBtnText}>获取验证码</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputWrap}>
            <Text style={styles.label}>昵称（选填）</Text>
            <TextInput
              style={styles.input}
              placeholder="请输入昵称"
              placeholderTextColor={theme.pinkPlaceholder}
              value={nickname}
              onChangeText={setNickname}
              editable={!submitting}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputWrap}>
            <Text style={styles.label}>头像（选填）</Text>
            <View style={styles.avatarRow}>
              {avatarUri ? (
                <>
                  <PreviewableImage
                    source={{ uri: avatarUri }}
                    style={styles.avatarPreview}
                    accessibilityLabel="注册头像预览"
                  />
                  <TouchableOpacity
                    style={styles.removeAvatarBtn}
                    onPress={removeAvatar}
                  >
                    <Text style={styles.removeAvatarText}>移除头像</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={styles.pickAvatarBtn}
                  onPress={pickAvatar}
                  disabled={submitting}
                >
                  <Text style={styles.pickAvatarText}>选择头像</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.hint}>
              选择头像将使用「上传头像注册」接口，否则使用「密码注册」
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            onPress={onSubmit}
            disabled={!canSubmit}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>注册</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backLink}
            onPress={() => router.back()}
            disabled={submitting}
          >
            <Text style={styles.backLinkText}>已有账号？去登录</Text>
          </TouchableOpacity>

          <Text style={styles.tip}>开发环境可使用验证码 123456</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.pageBg,
    paddingHorizontal: 24,
  },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: {
    flex: 1,
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: theme.navTitlePink,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: theme.textSecondary,
    marginBottom: 24,
  },
  inputWrap: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    color: theme.textSecondary,
    marginBottom: 8,
  },
  input: {
    height: 52,
    backgroundColor: theme.cardBg,
    borderRadius: theme.radiusMd,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 16,
    fontSize: 16,
    color: theme.textPrimary,
  },
  inputError: {
    borderColor: theme.badgeRed,
  },
  errorText: {
    fontSize: 12,
    color: theme.badgeRed,
    marginTop: 4,
  },
  codeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "center",
  },
  codeInput: {
    flex: 1,
    minWidth: 80,
  },
  sendBtn: {
    backgroundColor: theme.wechatGreen,
    paddingHorizontal: 12,
    height: 52,
    justifyContent: "center",
    borderRadius: theme.radiusMd,
    flexShrink: 0,
  },
  sendBtnDisabled: {
    backgroundColor: theme.textMuted,
    opacity: 0.8,
  },
  sendBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarPreview: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.border,
  },
  pickAvatarBtn: {
    height: 52,
    backgroundColor: theme.cardBg,
    borderRadius: theme.radiusMd,
    borderWidth: 1,
    borderColor: theme.border,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    minWidth: 140,
  },
  pickAvatarText: {
    fontSize: 15,
    color: theme.wechatGreen,
    fontWeight: "500",
  },
  removeAvatarBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  removeAvatarText: {
    fontSize: 14,
    color: theme.textMuted,
  },
  hint: {
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 8,
  },
  submitBtn: {
    backgroundColor: theme.wechatGreen,
    height: 52,
    borderRadius: theme.radiusMd,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 12,
  },
  submitBtnDisabled: {
    backgroundColor: theme.textMuted,
    opacity: 0.8,
  },
  submitBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  backLink: {
    marginTop: 20,
    alignItems: "center",
  },
  backLinkText: {
    fontSize: 15,
    color: theme.wechatGreen,
    fontWeight: "500",
  },
  tip: {
    marginTop: 20,
    fontSize: 12,
    color: theme.textMuted,
    textAlign: "center",
  },
});
