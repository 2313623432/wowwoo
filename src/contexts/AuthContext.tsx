import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { router } from "expo-router";
import {
  secureGetItem,
  secureSetItem,
  secureDeleteItem,
} from "@/utils/secureStorage";
import {
  authStorageKeys,
  loginWithCode as apiLoginWithCode,
  loginWithEmailCode as apiLoginWithEmailCode,
  loginWithPassword as apiLoginWithPassword,
  sendVerificationCode as apiSendCode,
  sendVerificationCodeByEmail as apiSendEmailCode,
  registerWithPassword as apiRegisterWithPassword,
  registerWithAvatar as apiRegisterWithAvatar,
  type RegisterParams,
  type RegisterWithAvatarParams,
} from "@/services/auth";
import {
  getMe,
  updateMe,
  uploadAvatarFile,
  type AvatarFile,
} from "@/services/users";
import {
  BASE_URL,
  buildImageUrlFromKey,
  fetchImageUrlPrefix,
  setUnauthorizedHandler,
} from "@/services/api";

export type AuthUser = {
  id?: string;
  phone: string;
  token: string;
  nickname?: string;
  avatarUri?: string;
} | null;

type AuthContextValue = {
  user: AuthUser;
  isLoading: boolean;
  /** 验证码登录/注册 */
  login: (
    phone: string,
    code: string,
  ) => Promise<{ success: boolean; message?: string }>;
  /** 邮箱验证码登录 */
  loginWithEmailCode: (
    email: string,
    code: string,
  ) => Promise<{ success: boolean; message?: string }>;
  /** 密码登录 */
  loginWithPassword: (
    phone: string,
    password: string,
  ) => Promise<{ success: boolean; message?: string }>;
  /** 发送验证码 */
  sendCode: (
    phone: string,
    purpose?: "login" | "register",
  ) => Promise<{
    success: boolean;
    message?: string;
    queueUntilText?: string;
    isQueueHint?: boolean;
    registerUsers?: number;
    queueTotal?: number;
    queuePosition?: number;
  }>;
  /** 发送邮箱验证码 */
  sendEmailCode: (
    email: string,
    purpose?: "login" | "register",
  ) => Promise<{
    success: boolean;
    message?: string;
    queueUntilText?: string;
    isQueueHint?: boolean;
    registerUsers?: number;
    queueTotal?: number;
    queuePosition?: number;
  }>;
  /** 密码注册（可选昵称、头像 URL） */
  register: (
    params: RegisterParams,
  ) => Promise<{ success: boolean; message?: string }>;
  /** 上传头像注册（可选昵称、本地头像文件） */
  registerWithAvatar: (
    params: RegisterWithAvatarParams,
  ) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  /** 更新个人信息（同步到后端 PUT /api/v1/users/me） */
  updateProfile: (data: { nickname?: string }) => Promise<void>;
  /** 上传头像（使用文件对象，同步到后端并更新本地头像） */
  uploadAvatar: (file: AvatarFile) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser>(null);
  const [isLoading, setIsLoading] = useState(true);

  const resolveAvatarUri = useCallback(
    async (token: string, avatar: string | null | undefined): Promise<string | undefined> => {
      if (!avatar) return undefined;
      if (avatar.startsWith("http") || avatar.startsWith("/")) {
        return avatar.startsWith("http")
          ? avatar
          : `${BASE_URL.replace(/\/$/, "")}${avatar}`;
      }
      const url = buildImageUrlFromKey(avatar);
      return url || undefined;
    },
    [],
  );

  const loadStoredAuth = useCallback(async () => {
    try {
      const [token, phone] = await Promise.all([
        secureGetItem(authStorageKeys.token),
        secureGetItem(authStorageKeys.phone),
      ]);
      if (!token || !phone) {
        setUser(null);
        return;
      }
      try {
        const me = await getMe(token);
        if (!me) {
          setUser(null);
          return;
        }
        const avatarUri = await resolveAvatarUri(token, me.avatar);
        setUser({
          id: me.id,
          token,
          phone: me.phone,
          nickname: me.nickname ?? undefined,
          avatarUri: avatarUri ?? undefined,
        });
      } catch {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [resolveAvatarUri]);

  useEffect(() => {
    // 页面初始化时优先拉取图片前缀
    fetchImageUrlPrefix().catch(() => {});
    loadStoredAuth();
  }, [loadStoredAuth]);

  const sendCode = useCallback(
    async (phone: string, purpose: "login" | "register" = "login") => {
      return apiSendCode(phone, purpose);
    },
    [],
  );

  const sendEmailCode = useCallback(
    async (email: string, purpose: "login" | "register" = "login") => {
      return apiSendEmailCode(email, purpose);
    },
    [],
  );

  const login = useCallback(
    async (phone: string, code: string) => {
      const result = await apiLoginWithCode(phone, code);
      if (!result.success) return result;
      if (!result.token) return { success: false, message: "登录失败" };
      const normalized = phone.replace(/\D/g, "");
      await secureSetItem(authStorageKeys.token, result.token);
      await secureSetItem(authStorageKeys.phone, normalized);
      try {
        const me = await getMe(result.token);
        if (!me) throw new Error("getMe failed");
        const avatarUri = await resolveAvatarUri(result.token, me.avatar);
        setUser({
          id: me.id,
          token: result.token,
          phone: me.phone,
          nickname: me.nickname ?? undefined,
          avatarUri: avatarUri ?? undefined,
        });
      } catch {
        setUser({
          token: result.token,
          phone: normalized,
          nickname: undefined,
          avatarUri: undefined,
        });
      }
      return { success: true };
    },
    [resolveAvatarUri],
  );

  const loginWithEmailCode = useCallback(
    async (email: string, code: string) => {
      const result = await apiLoginWithEmailCode(email, code);
      if (!result.success) return result;
      if (!result.token) return { success: false, message: "登录失败" };

      const token = result.token;
      const normalizedEmail = email.trim().toLowerCase();

      try {
        const me = await getMe(token);
        if (!me) throw new Error("getMe failed");
        const avatarUri = await resolveAvatarUri(token, me.avatar);

        const normalizedPhone = me.phone.replace(/\D/g, "");
        await Promise.all([
          secureSetItem(authStorageKeys.token, token),
          secureSetItem(authStorageKeys.phone, normalizedPhone),
        ]);

        setUser({
          id: me.id,
          token,
          phone: me.phone,
          nickname: me.nickname ?? undefined,
          avatarUri: avatarUri ?? undefined,
        });
      } catch {
        // 如果 getMe 失败，则至少保存 token + 某个可用的字符串到 phone key，避免下次启动直接登出
        await Promise.all([
          secureSetItem(authStorageKeys.token, token),
          secureSetItem(authStorageKeys.phone, normalizedEmail),
        ]);
        setUser({
          token,
          phone: normalizedEmail,
          nickname: undefined,
          avatarUri: undefined,
        });
      }

      return { success: true };
    },
    [resolveAvatarUri],
  );

  const loginWithPassword = useCallback(
    async (phone: string, password: string) => {
      const result = await apiLoginWithPassword(phone, password);
      if (!result.success) return result;
      if (!result.token) return { success: false, message: "登录失败" };
      const normalized = phone.replace(/\D/g, "");
      await secureSetItem(authStorageKeys.token, result.token);
      await secureSetItem(authStorageKeys.phone, normalized);
      try {
        const me = await getMe(result.token);
        if (!me) throw new Error("getMe failed");
        const avatarUri = await resolveAvatarUri(result.token, me.avatar);
        setUser({
          id: me.id,
          token: result.token,
          phone: me.phone,
          nickname: me.nickname ?? undefined,
          avatarUri: avatarUri ?? undefined,
        });
      } catch {
        setUser({
          token: result.token,
          phone: normalized,
          nickname: undefined,
          avatarUri: undefined,
        });
      }
      return { success: true };
    },
    [resolveAvatarUri],
  );

  const setUserFromToken = useCallback(
    async (token: string, phone: string) => {
      await secureSetItem(authStorageKeys.token, token);
      await secureSetItem(authStorageKeys.phone, phone);
      try {
        const me = await getMe(token);
        if (!me) throw new Error("getMe failed");
        const avatarUri = await resolveAvatarUri(token, me.avatar);
        setUser({
          id: me.id,
          token,
          phone: me.phone,
          nickname: me.nickname ?? undefined,
          avatarUri: avatarUri ?? undefined,
        });
      } catch {
        setUser({ token, phone, nickname: undefined, avatarUri: undefined });
      }
    },
    [resolveAvatarUri],
  );

  const register = useCallback(
    async (params: RegisterParams) => {
      const result = await apiRegisterWithPassword(params);
      if (!result.success) return result;
      if (!result.token) return { success: false, message: "注册失败" };
      const normalized = params.phone.replace(/\D/g, "");
      await setUserFromToken(result.token, normalized);
      return { success: true };
    },
    [setUserFromToken],
  );

  const registerWithAvatar = useCallback(
    async (params: RegisterWithAvatarParams) => {
      const result = await apiRegisterWithAvatar(params);
      if (!result.success) return result;
      if (!result.token) return { success: false, message: "注册失败" };
      const normalized = params.phone.replace(/\D/g, "");
      await setUserFromToken(result.token, normalized);
      return { success: true };
    },
    [setUserFromToken],
  );

  const logout = useCallback(async () => {
    await Promise.all([
      secureDeleteItem(authStorageKeys.token),
      secureDeleteItem(authStorageKeys.phone),
      secureDeleteItem(authStorageKeys.nickname),
      secureDeleteItem(authStorageKeys.avatarUri),
    ]);
    setUser(null);
  }, []);

  const updateProfile = useCallback(
    async (data: { nickname?: string }) => {
      if (!user) return;
      try {
        const me = await updateMe(user.token, { nickname: data.nickname });
        if (data.nickname !== undefined) {
          await secureSetItem(authStorageKeys.nickname, data.nickname);
          setUser((prev) =>
            prev
              ? { ...prev, nickname: me?.nickname ?? data.nickname }
              : null,
          );
        }
      } catch {
        if (data.nickname !== undefined) {
          await secureSetItem(authStorageKeys.nickname, data.nickname);
          setUser((prev) =>
            prev ? { ...prev, nickname: data.nickname } : null,
          );
        }
      }
    },
    [user],
  );

  const uploadAvatar = useCallback(
    async (file: AvatarFile) => {
      if (!user) return;

      const result = await uploadAvatarFile(user.token, file, {
        compress: true,
      });
      if (!result?.imageId) {
        const fallbackUri =
          (file as { uri?: string }).uri ??
          (file as any)?.uri ??
          (file as any)?.localUri ??
          "";
        if (fallbackUri) {
          await secureSetItem(authStorageKeys.avatarUri, fallbackUri);
          setUser((prev) =>
            prev ? { ...prev, avatarUri: fallbackUri } : null,
          );
        }
        return;
      }

      await updateMe(user.token, { avatar: result.imageId });
      const resolved = buildImageUrlFromKey(result.imageId);
      if (resolved) {
        await secureSetItem(authStorageKeys.avatarUri, resolved);
        setUser((prev) =>
          prev
            ? { ...prev, avatarUri: result.localUri ?? resolved }
            : null,
        );
        return;
      }
      // 已更新 me.avatar 为 imageId，下次拉取用户信息时会通过 resolveAvatarUri 解析
      const me = await getMe(user.token).catch(() => null);
      if (me?.avatar) {
        const fallback = await resolveAvatarUri(user.token, me.avatar);
        if (fallback) {
          await secureSetItem(authStorageKeys.avatarUri, fallback);
          setUser((prev) => (prev ? { ...prev, avatarUri: fallback } : null));
        }
      }
    },
    [user, resolveAvatarUri],
  );

  // 全局 401/403 处理：清理登录态并跳转登录页
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void logout().catch(() => {});
      try {
        router.replace("/(auth)/login");
      } catch {
        // ignore
      }
    });
    return () => {
      setUnauthorizedHandler(null);
    };
  }, [logout]);

  const value: AuthContextValue = {
    user,
    isLoading,
    sendCode,
    sendEmailCode,
    login,
    loginWithEmailCode,
    loginWithPassword,
    register,
    registerWithAvatar,
    logout,
    updateProfile,
    uploadAvatar,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
