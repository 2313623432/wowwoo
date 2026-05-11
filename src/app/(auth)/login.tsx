import { RegistrationQueueModal } from "@/components/RegistrationQueueModal";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useKeyboardHeightWeb } from "@/hooks/useKeyboardHeightWeb";
import { analyticsEvent } from "@/utils/analytics";
import { isValidEmail, isValidPhone } from "@/services/auth";
import { apiRequest } from "@/services/api";
import { Alert } from "@/utils/alert";
import {
  extractQueueUntilText,
  isRegistrationQueueHint,
} from "@/utils/registrationQueue";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const COUNTDOWN_SECONDS = 60;

type LoginMode = "code" | "password";
type CodeContactMethod = "phone" | "email";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const keyboardHeightWeb = useKeyboardHeightWeb();
  const router = useRouter();
  const { login, loginWithEmailCode, loginWithPassword, sendCode, sendEmailCode } = useAuth();
  const [mode] = useState<LoginMode>("code");
  const [contactMethod, setContactMethod] = useState<CodeContactMethod>("phone");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
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
  const [androidDownloading, setAndroidDownloading] = useState(false);

  const phoneValid = isValidPhone(phone);
  const emailValid = isValidEmail(email);
  const contactValid = contactMethod === "phone" ? phoneValid : emailValid;
  const canSendCode =
    mode === "code" && contactValid && countdown === 0 && !sending;
  const canSubmitCode =
    mode === "code" && contactValid && code.length >= 4 && !submitting;
  const canSubmitPassword =
    mode === "password" && phoneValid && password.length >= 6 && !submitting;

  const startCountdown = useCallback(() => {
    setCountdown(COUNTDOWN_SECONDS);
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  useEffect(() => {
    // 切换手机号/邮箱后，禁用上次的倒计时，允许重新获取验证码
    setCountdown(0);
    setCode("");
  }, [contactMethod]);

  const onSendCode = async () => {
    if (!canSendCode) return;
    setSending(true);
    try {
      const res =
        contactMethod === "phone"
          ? await sendCode(phone, "login")
          : await sendEmailCode(email, "login");
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

  const onSubmit = async () => {
    if (mode === "code") {
      if (!canSubmitCode) return;
      setSubmitting(true);
      try {
        const res =
          contactMethod === "phone"
            ? await login(phone, code)
            : await loginWithEmailCode(email, code);
        if (res.success) {
          if (contactMethod === "phone") {
            analyticsEvent("login_success", { phone });
            console.log("login_success", { phone });
          } else {
            analyticsEvent("login_success", { email });
          }
          router.replace("/(tabs)/chat");
        } else {
          Alert.alert("提示", res.message ?? "登录失败");
        }
      } catch (error){
        console.error(error);
        Alert.alert("提示", "登录失败，请稍后重试");
      } finally {
        setSubmitting(false);
      }
    } else {
      if (!canSubmitPassword) return;
      setSubmitting(true);
      try {
        const res = await loginWithPassword(phone, password);
        if (res.success) {
          router.replace("/(tabs)/chat");
        } else {
          Alert.alert("提示", res.message ?? "登录失败");
        }
      } catch {
        Alert.alert("提示", "登录失败，请稍后重试");
      } finally {
        setSubmitting(false);
      }
    }
  };

  const onDownloadAndroid = async () => {
    if (androidDownloading) return;
    setAndroidDownloading(true);
    try {
      const data = await apiRequest<{ url?: string }>(
        "/api/v1/external/download_url",
        { method: "GET" },
      );
      if (data.url && typeof data.url === "string") {
        Linking.openURL(data.url);
      } else {
        Alert.alert("提示", "获取下载链接失败，请稍后重试");
      }
    } catch {
      Alert.alert("提示", "获取下载链接失败，请稍后重试");
    } finally {
      setAndroidDownloading(false);
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
          <Image
            source={require("../../../assets/logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>登录</Text>
          <Text style={styles.subtitle}>
            {mode === "code"
              ? contactMethod === "phone"
                ? "未注册的手机号将自动创建账号"
                : "未注册的邮箱将自动创建账号"
              : "使用已注册的手机号与密码登录"}
          </Text>

          <View style={styles.inputWrap}>
            <Text style={styles.label}>
              {mode === "password" || contactMethod === "phone" ? "手机号" : "邮箱"}
            </Text>
            {mode === "password" || contactMethod === "phone" ? (
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
            ) : (
              <TextInput
                style={styles.input}
                placeholder="请输入邮箱"
                placeholderTextColor={theme.pinkPlaceholder}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!submitting}
              />
            )}
          </View>

          {mode === "code" ? (
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
                  style={[
                    styles.sendBtn,
                    !canSendCode && styles.sendBtnDisabled,
                  ]}
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
          ) : (
            <View style={styles.inputWrap}>
              <Text style={styles.label}>密码</Text>
              <TextInput
                style={styles.input}
                placeholder="请输入密码（至少 6 位）"
                placeholderTextColor={theme.pinkPlaceholder}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!submitting}
                autoCapitalize="none"
              />
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.submitBtn,
              (mode === "code" ? !canSubmitCode : !canSubmitPassword) &&
                styles.submitBtnDisabled,
            ]}
            onPress={onSubmit}
            disabled={mode === "code" ? !canSubmitCode : !canSubmitPassword}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>
                {mode === "code" ? "登录 / 注册" : "登录"}
              </Text>
            )}
          </TouchableOpacity>

          {Platform.OS === "web" && (
            <TouchableOpacity
              style={styles.androidDownloadBtn}
            onPress={onDownloadAndroid}
              activeOpacity={0.8}
            >
            {androidDownloading ? (
              <ActivityIndicator size="small" color={theme.wechatGreen} />
            ) : (
              <Text style={styles.androidDownloadText}>
                下载 Android 客户端
              </Text>
            )}
            </TouchableOpacity>
          )}

          {mode === "code" && (
            <TouchableOpacity
              style={styles.linkSwitchBtn}
              onPress={() => {
                const next = contactMethod === "phone" ? "email" : "phone";
                setContactMethod(next);
                setSending(false);
                setCode("");
                setCountdown(0);
              }}
              disabled={submitting || sending}
              activeOpacity={0.8}
            >
              <Text style={styles.linkSwitchText}>
                {contactMethod === "phone" ? "切换邮箱登录" : "切换手机登录"}
              </Text>
            </TouchableOpacity>
          )}

          {/* <TouchableOpacity
            style={styles.registerLink}
            onPress={() => router.push("/(auth)/register")}
            disabled={submitting}
          >
            <Text style={styles.registerLinkText}>没有账号？去注册</Text>
          </TouchableOpacity> */}

          {/* {mode === "code" && (
            <Text style={styles.tip}>开发环境可使用验证码 123456</Text>
          )} */}
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
  logo: {
    width: "100%",
    height: 80,
    alignSelf: "center",
    marginBottom: 60,
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
  tabRow: {
    flexDirection: "row",
    marginBottom: 20,
    backgroundColor: theme.cardBg,
    borderRadius: theme.radiusMd,
    padding: 4,
    borderWidth: 1,
    borderColor: theme.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: theme.radiusSm,
  },
  tabActive: {
    backgroundColor: theme.wechatGreen,
  },
  tabText: {
    fontSize: 15,
    color: theme.textSecondary,
    fontWeight: "500",
  },
  tabTextActive: {
    color: "#fff",
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
  androidDownloadBtn: {
    height: 48,
    borderRadius: theme.radiusMd,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 12,
    borderWidth: 1,
    borderColor: theme.wechatGreen,
    backgroundColor: theme.cardBg,
  },
  androidDownloadText: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.wechatGreen,
  },
  registerLink: {
    marginTop: 20,
    alignItems: "center",
  },
  registerLinkText: {
    fontSize: 15,
    color: theme.wechatGreen,
    fontWeight: "500",
  },
  linkSwitchBtn: {
    marginTop: 10,
    alignItems: "center",
  },
  linkSwitchText: {
    fontSize: 13,
    color: theme.wechatGreen,
    fontWeight: "500",
    textDecorationLine: "underline",
  },
  tip: {
    marginTop: 20,
    fontSize: 12,
    color: theme.textMuted,
    textAlign: "center",
  },
});
