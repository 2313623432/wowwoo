/** 后端 Base URL，需包含 /api/v1 前缀由各接口自行拼接，此处仅域名 */
export const BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  process.env.EXPO_PUBLIC_BASE_URL ||
  // 'https://arpatest.zycx.info/api/wowwoo' ||
  'https://wowwoo.zycx.info' ||
  'http://8.216.34.9:8004';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type ApiError = {
  message: string;
  status?: number;
  /** 后端原始返回体（若为 JSON） */
  payload?: any;
  /** 服务器建议的重试时间（来自 Retry-After header） */
  retryAfter?: string | null;
};

type RequestOptions = {
  method?: HttpMethod;
  token?: string | null;
  // JSON body，若传入 FormData 则直接使用 body
  body?: any;
  headers?: Record<string, string>;
};

let unauthorizedHandler: ((error: ApiError) => void) | null = null;
let apiErrorToastEnabled = true;

/** 注册全局未授权（401/403）处理函数，便于统一跳转登录等 */
export function setUnauthorizedHandler(
  handler: ((error: ApiError) => void) | null
) {
  unauthorizedHandler = handler;
}

/** 控制请求失败时是否统一弹 Toast（默认开启） */
export function setApiErrorToastEnabled(enabled: boolean) {
  apiErrorToastEnabled = enabled;
}

/** 图片访问链接前缀，来自 GET /api/v1/external/image_url_prefix */
let imageUrlPrefix: string | null = null;

/** 获取当前缓存的图片链接前缀（可能为 null/空字符串） */
export function getImageUrlPrefixCached(): string | null {
  return imageUrlPrefix;
}

/** 设置（或清空）图片链接前缀，会自动去掉末尾多余的 `/` */
export function setImageUrlPrefixCached(prefix: string | null | undefined) {
  if (!prefix) {
    imageUrlPrefix = null;
    return;
  }
  imageUrlPrefix = String(prefix).replace(/\/$/, '');
}

/** 主动从后端拉取图片链接前缀，并写入缓存 */
export async function fetchImageUrlPrefix(): Promise<string> {
  if (imageUrlPrefix) return imageUrlPrefix;
  const res = await apiRequest<{ url?: string }>(
    '/api/v1/external/image_url_prefix',
    { method: 'GET' }
  );
  const url = res?.url ?? '';
  setImageUrlPrefixCached(url || null);
  return imageUrlPrefix || '';
}

/** 使用缓存的前缀，把 object_key 转成完整图片地址 */
export function buildImageUrlFromKey(
  objectKey: string | null | undefined
): string {
  if (!objectKey) return '';
  const key = String(objectKey).replace(/^\/+/, '');
  // 后端有时直接返回完整 URL 或相对路径，这里原样透传
  if (/^https?:\/\//i.test(key)) return key;
  if (key.startsWith('/')) return key;
  const prefix = imageUrlPrefix;
  if (!prefix) return key;
  return `${prefix.replace(/\/$/, '')}/${key}`;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T | null> {
  try {
    if (!BASE_URL) {
      if (apiErrorToastEnabled) {
        try {
          const { showToastThrottled } = await import("@/utils/toast");
          showToastThrottled("api-no-base-url", "未配置后端地址，请稍后重试", 8000);
        } catch {
          // ignore
        }
      }
      return null;
    }

    const { method = 'GET', token, body, headers } = options;

    const finalHeaders: Record<string, string> = {
      Accept: 'application/json',
      ...(headers || {}),
    };

    let finalBody: BodyInit | undefined;

    if (body instanceof FormData) {
      finalBody = body;
      // 让 fetch 自动设置 multipart/form-data 边界
    } else if (typeof body === 'string') {
      finalBody = body;
      if (!finalHeaders['Content-Type']) {
        finalHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    } else if (body !== undefined) {
      finalHeaders['Content-Type'] = 'application/json';
      finalBody = JSON.stringify(body);
    }

    if (token) {
      finalHeaders.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: finalHeaders,
      body: finalBody,
    });

    let text = '';
    try {
      text = await res.text();
    } catch {
      text = '';
    }

    const isJson = res.headers
      .get('content-type')
      ?.toLowerCase()
      .includes('application/json');

    let data: any = text as any;
    if (isJson && text) {
      try {
        data = JSON.parse(text);
      } catch {
        // JSON 解析失败时回退到原始文本
        data = text as any;
      }
    }

    if (!res.ok) {
      let message = `请求失败：${res.status}`;
      if (typeof data === 'object' && data) {
        if (Array.isArray((data as any).detail)) {
          // 422 等校验错误：detail 为 [{ loc, msg, type }, ...]
          message =
            ((data as any).detail as { msg?: string }[])
              .map((d) => d.msg ?? '')
              .filter(Boolean)
              .join('；') || message;
        } else if (typeof (data as any).detail === 'string') {
          message = (data as any).detail;
        } else if (typeof (data as any).detail === 'object' && (data as any).detail) {
          // 兼容后端 detail 为对象的情况
          if (typeof ((data as any).detail as any).message === 'string') {
            message = ((data as any).detail as any).message;
          } else if (typeof ((data as any).detail as any).msg === 'string') {
            message = ((data as any).detail as any).msg;
          }
        } else if (typeof (data as any).message === 'string') {
          message = (data as any).message;
        }
      }
      const error = {
        message,
        status: res.status,
        payload: data,
        retryAfter: res.headers.get('retry-after'),
      } satisfies ApiError;
      if (error.status === 401 || error.status === 403) {
        try {
          unauthorizedHandler?.(error);
        } catch {
          // 忽略全局处理中的异常，避免影响后续逻辑
        }
      }
      if (apiErrorToastEnabled) {
        try {
          const { showToastThrottled } = await import("@/utils/toast");
          const key = `api-${error.status ?? "x"}-${path}`;
          showToastThrottled(key, error.message || "请求失败，请稍后重试", 2500);
        } catch {
          // ignore
        }
      }
      if (__DEV__) {
        console.warn('[apiRequest] 请求失败', path, error);
      }
      return null;
    }

    return data as T;
  } catch (e) {
    if (apiErrorToastEnabled) {
      try {
        const { showToastThrottled } = await import("@/utils/toast");
        showToastThrottled(
          `api-exception-${path}`,
          "网络异常，请稍后重试",
          2500,
        );
      } catch {
        // ignore
      }
    }
    if (__DEV__) {
      console.warn('[apiRequest] 请求异常', path, e);
    }
    return null;
  }
}
