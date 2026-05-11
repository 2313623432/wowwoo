/**
 * 认证服务：发送验证码、手机号+验证码登录/注册
 * 对接 WowWoo 后端 API
 */

import { apiRequest } from "./api";

const STORAGE_KEY_TOKEN = "auth_token";
const STORAGE_KEY_PHONE = "auth_phone";

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** 校验手机号格式（大陆 11 位） */
export function isValidPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  return /^1\d{10}$/.test(normalized);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** 校验邮箱格式（简单规则） */
export function isValidEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

/** 发送验证码 - POST /api/v1/auth/send-code */
export async function sendVerificationCode(
  phone: string,
  purpose: "login" | "register" = "login",
): Promise<{
  success: boolean;
  message?: string;
  /** 命中限额注册/排队提示时，用于替换文案中的 xxx */
  queueUntilText?: string;
  /** 是否为“限额注册/排队”相关的提示 */
  isQueueHint?: boolean;
  /** 后端返回的当前注册任务/人数等信息 */
  registerUsers?: number;
  /** 排队总人数 */
  queueTotal?: number;
  /** 当前用户的排队位置 */
  queuePosition?: number;
}> {
  const normalized = normalizePhone(phone);
  if (!/^1\d{10}$/.test(normalized)) {
    return { success: false, message: "请输入正确的手机号" };
  }
  const data = await apiRequest<any>("/api/v1/auth/send-code", {
    method: "POST",
    body: { phone: normalized, purpose },
  });
  if (!data) {
    return { success: false, message: "发送验证码失败，请稍后重试" };
  }

  // 兼容后端“限额注册”以 200 返回的场景
  if (data && typeof data === "object") {
    const status = typeof data.status === "string" ? data.status : undefined;
    if (status === "FULL") {
      const registerUsers =
        typeof data.register_users === "number" ? data.register_users : undefined;
      const queueTotal =
        typeof data.queue_total === "number" ? data.queue_total : undefined;
      const queuePosition =
        typeof data.queue_position === "number" ? data.queue_position : undefined;
      return {
        success: false,
        isQueueHint: true,
        message:
          typeof data.msg === "string" ? data.msg : "当前注册已满，请稍后再试",
        queueUntilText:
          registerUsers !== undefined
            ? `当前排队人数（${registerUsers}）`
            : "当前排队人数过多",
        ...(registerUsers !== undefined ? { registerUsers } : {}),
        ...(queueTotal !== undefined ? { queueTotal } : {}),
        ...(queuePosition !== undefined ? { queuePosition } : {}),
      };
    }
  }
  return { success: true };
}

/** 发送邮箱验证码 - POST /api/v1/auth/send-code */
export async function sendVerificationCodeByEmail(
  email: string,
  purpose: "login" | "register" = "login",
): Promise<{
  success: boolean;
  message?: string;
  /** 命中限额注册/排队提示时，用于替换文案中的 xxx */
  queueUntilText?: string;
  /** 是否为“限额注册/排队”相关的提示 */
  isQueueHint?: boolean;
  /** 后端返回的当前注册任务/人数等信息 */
  registerUsers?: number;
  /** 排队总人数 */
  queueTotal?: number;
  /** 当前用户的排队位置 */
  queuePosition?: number;
}> {
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return { success: false, message: "请输入正确的邮箱" };
  }

  const data = await apiRequest<any>("/api/v1/auth/send-code", {
    method: "POST",
    body: { email: normalizedEmail, purpose },
  });
  if (!data) {
    return { success: false, message: "发送验证码失败，请稍后重试" };
  }

  // 兼容后端“限额注册”以 200 返回的场景
  if (data && typeof data === "object") {
    const status = typeof data.status === "string" ? data.status : undefined;
    if (status === "FULL") {
      const registerUsers =
        typeof data.register_users === "number" ? data.register_users : undefined;
      const queueTotal =
        typeof data.queue_total === "number" ? data.queue_total : undefined;
      const queuePosition =
        typeof data.queue_position === "number" ? data.queue_position : undefined;
      return {
        success: false,
        isQueueHint: true,
        message:
          typeof data.msg === "string" ? data.msg : "当前注册已满，请稍后再试",
        queueUntilText:
          registerUsers !== undefined
            ? `当前排队人数（${registerUsers}）`
            : "当前排队人数过多",
        ...(registerUsers !== undefined ? { registerUsers } : {}),
        ...(queueTotal !== undefined ? { queueTotal } : {}),
        ...(queuePosition !== undefined ? { queuePosition } : {}),
      };
    }
  }
  return { success: true };
}

/** 验证码登录/注册 - POST /api/v1/auth/login */
export async function loginWithCode(
  phone: string,
  code: string,
): Promise<{ success: boolean; token?: string; message?: string }> {
  const normalized = normalizePhone(phone);
  if (!/^1\d{10}$/.test(normalized)) {
    return { success: false, message: "请输入正确的手机号" };
  }
  if (!/^\d{6}$/.test(code)) {
    return { success: false, message: "请输入 6 位验证码" };
  }
  try {
    const res = await apiRequest<{
      access_token: string;
      token_type: string;
    }>("/api/v1/auth/login", {
      method: "POST",
      body: { phone: normalized, code },
    });
    if (!res?.access_token) {
      return { success: false, message: "验证码错误或已过期，请重新获取" };
    }
    return { success: true, token: res.access_token };
  } catch {
    return { success: false, message: "验证码错误或已过期，请重新获取" };
  }
}

/** 邮箱验证码登录 - POST /api/v1/auth/login */
export async function loginWithEmailCode(
  email: string,
  code: string,
): Promise<{ success: boolean; token?: string; message?: string }> {
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return { success: false, message: "请输入正确的邮箱" };
  }
  if (!/^\d{6}$/.test(code)) {
    return { success: false, message: "请输入 6 位验证码" };
  }

  try {
    const res = await apiRequest<{
      access_token: string;
      token_type: string;
    }>("/api/v1/auth/login", {
      method: "POST",
      body: { email: normalizedEmail, code },
    });
    if (!res?.access_token) {
      return { success: false, message: "验证码错误或已过期，请重新获取" };
    }
    return { success: true, token: res.access_token };
  } catch {
    return { success: false, message: "验证码错误或已过期，请重新获取" };
  }
}

/** 密码登录 - POST /api/v1/auth/login/access-token (application/x-www-form-urlencoded) */
export async function loginWithPassword(
  phone: string,
  password: string,
): Promise<{ success: boolean; token?: string; message?: string }> {
  const normalized = normalizePhone(phone);
  if (!/^1\d{10}$/.test(normalized)) {
    return { success: false, message: "请输入正确的手机号" };
  }
  if (!password?.trim()) {
    return { success: false, message: "请输入密码" };
  }
  try {
    const body = new URLSearchParams({
      username: normalized,
      password: password.trim(),
    }).toString();
    const res = await apiRequest<{
      access_token: string;
      token_type: string;
    }>("/api/v1/auth/login/access-token", {
      method: "POST",
      body,
    });
    if (!res?.access_token) {
      return { success: false, message: "手机号或密码错误" };
    }
    return { success: true, token: res.access_token };
  } catch {
    return { success: false, message: "手机号或密码错误" };
  }
}

/** 密码注册 - POST /api/v1/auth/register */
export type RegisterParams = {
  phone: string;
  password: string;
  code: string;
  nickname?: string;
  avatar?: string;
};

export async function registerWithPassword(
  params: RegisterParams,
): Promise<{ success: boolean; token?: string; message?: string }> {
  const normalized = normalizePhone(params.phone);
  if (!/^1\d{10}$/.test(normalized)) {
    return { success: false, message: "请输入正确的手机号" };
  }
  if (!params.password?.trim()) {
    return { success: false, message: "请输入密码" };
  }
  if (!/^\d{6}$/.test(params.code)) {
    return { success: false, message: "请输入 6 位验证码" };
  }
  try {
    const res = await apiRequest<{
      access_token: string;
      token_type: string;
    }>("/api/v1/auth/register", {
      method: "POST",
      body: {
        phone: normalized,
        password: params.password.trim(),
        code: params.code,
        ...(params.nickname?.trim() && { nickname: params.nickname.trim() }),
        ...(params.avatar?.trim() && { avatar: params.avatar.trim() }),
      },
    });
    if (!res?.access_token) {
      return {
        success: false,
        message: "注册失败，请检查验证码或该手机号是否已注册",
      };
    }
    return { success: true, token: res.access_token };
  } catch {
    return {
      success: false,
      message: "注册失败，请检查验证码或该手机号是否已注册",
    };
  }
}

/** 上传头像注册 - POST /api/v1/auth/register-with-avatar (multipart/form-data) */
export type RegisterWithAvatarParams = {
  phone: string;
  password: string;
  code: string;
  nickname?: string;
  /** 本地文件 URI（如 ImagePicker 返回的 uri） */
  avatarUri?: string;
  /** 文件名，用于 multipart */
  avatarFileName?: string;
  avatarType?: string;
};

export async function registerWithAvatar(
  params: RegisterWithAvatarParams,
): Promise<{ success: boolean; token?: string; message?: string }> {
  const normalized = normalizePhone(params.phone);
  if (!/^1\d{10}$/.test(normalized)) {
    return { success: false, message: "请输入正确的手机号" };
  }
  if (!params.password?.trim()) {
    return { success: false, message: "请输入密码" };
  }
  if (!/^\d{6}$/.test(params.code)) {
    return { success: false, message: "请输入 6 位验证码" };
  }
  const form = new FormData();
  form.append("phone", normalized);
  form.append("password", params.password.trim());
  form.append("code", params.code);
  if (params.nickname?.trim()) {
    form.append("nickname", params.nickname.trim());
  }
  if (params.avatarUri) {
    const name = params.avatarFileName ?? "avatar.jpg";
    const type = params.avatarType ?? "image/jpeg";
    form.append("avatar", {
      uri: params.avatarUri,
      name,
      type,
    } as any);
  }
  try {
    const res = await apiRequest<{
      access_token: string;
      token_type: string;
    }>("/api/v1/auth/register-with-avatar", {
      method: "POST",
      body: form,
    });
    if (!res?.access_token) {
      return {
        success: false,
        message: "注册失败，请检查验证码或该手机号是否已注册",
      };
    }
    return { success: true, token: res.access_token };
  } catch {
    return {
      success: false,
      message: "注册失败，请检查验证码或该手机号是否已注册",
    };
  }
}

const STORAGE_KEY_NICKNAME = "auth_nickname";
const STORAGE_KEY_AVATAR_URI = "auth_avatar_uri";

export const authStorageKeys = {
  token: STORAGE_KEY_TOKEN,
  phone: STORAGE_KEY_PHONE,
  nickname: STORAGE_KEY_NICKNAME,
  avatarUri: STORAGE_KEY_AVATAR_URI,
} as const;
