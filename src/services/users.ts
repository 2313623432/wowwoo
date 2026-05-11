/**
 * 用户模块 - 对接 GET/PUT /api/v1/users/me、头像上传与可访问链接
 */

import * as FileSystem from 'expo-file-system/legacy';
import { apiRequest, buildImageUrlFromKey } from './api';
import { compressImageForUpload } from './imageCompress';

export type UserApiConfig = {
  base_url?: string | null;
  model?: string | null;
  token?: string | null;
};

export type UserMe = {
  id: string;
  phone: string;
  nickname: string | null;
  avatar: string | null;
  is_active: boolean;
  is_ai: boolean;
  profile?: Record<string, unknown>;
  api_config?: UserApiConfig | null;
};

export type AvatarFile =
  | {
      uri: string;
      name?: string;
      type?: string;
    }
  | File;

/** 获取图片上传链接的返回体 - POST /api/v1/users/me/image_upload_url */
export type ImageUploadUrlResponse = {
  object_key: string;
  method: string;
  url: string;
  signed_headers: Record<string, string>;
  content_type: string;
  expires_at: string;
  expires_in_seconds: number;
};

/** 根据 object_key 获取图片访问链接的返回体 - GET /api/v1/users/me/{object_key}/image_url/ */
export type ImageUrlResponse = {
  object_key: string;
  method: string;
  url: string;
  signed_headers: Record<string, string>;
  response_content_disposition?: string;
  expires_at: string;
  expires_in_seconds: number;
};

/** 分享链接续费返回体 - POST /api/v1/users/me/share-link-freecall */
export type ShareLinkFreecallResponse = {
  phone: string;
  nickname: string | null;
  avatar: string | null;
  is_active: boolean;
  vocant: string | null;
  profile?: Record<string, unknown>;
  freecall: number;
  balance: number;
  api_config?: UserApiConfig | null;
  has_claimed_share_freecall: boolean;
  id: string;
};

/** 获取当前用户信息 - GET /api/v1/users/me */
export async function getMe(token: string): Promise<UserMe | null> {
  return apiRequest<UserMe>('/api/v1/users/me', {
    method: 'GET',
    token,
  });
}

/** 更新当前用户信息 - PUT /api/v1/users/me */
export async function updateMe(
  token: string,
  data: {
    nickname?: string;
    avatar?: string;
    profile?: Record<string, unknown>;
    api_config?: UserApiConfig | null;
  }
): Promise<UserMe | null> {
  return apiRequest<UserMe>('/api/v1/users/me', {
    method: 'PUT',
    token,
    body: data,
  });
}

/**
 * 获取图片上传链接 - POST /api/v1/users/me/image_upload_url
 * 请求体需包含 file_name、file_type；返回的 url 作为文件上传链接使用。
 */
export async function getAvatarUploadUrl(
  token: string,
  params: { file_name: string; file_type: string }
): Promise<ImageUploadUrlResponse | null> {
  return apiRequest<ImageUploadUrlResponse>(
    '/api/v1/users/me/image_upload_url',
    {
      method: 'POST',
      token,
      body: {
        file_name: params.file_name,
        file_type: params.file_type,
      },
    }
  );
}

/**
 * 根据 object_key 获取图片访问链接
 * 现在不再逐个远程请求，仅使用页面初始化时缓存的图片前缀拼接 object_key。
 */
export async function getAvatarUrl(
  _token: string,
  object_key: string,
  _params?: { expires_in_seconds?: number }
): Promise<string> {
  return buildImageUrlFromKey(object_key);
}

/**
 * 提交作品分享链接以领取免费通话额度 - POST /api/v1/users/me/share-link-freecall
 */
export async function claimShareLinkFreecall(
  token: string,
  share_link: string
): Promise<ShareLinkFreecallResponse | null> {
  return apiRequest<ShareLinkFreecallResponse>(
    '/api/v1/users/me/share-link-freecall',
    {
      method: 'POST',
      token,
      body: { share_link },
    }
  );
}

export type UploadAvatarOptions = {
  /** 上传前压缩图片（仅对原生端 uri 生效） */
  compress?: boolean;
};

export type UploadAvatarResult = {
  imageId: string;
  /** 上传所用本地文件 uri，展示时优先用此避免远端首次加载慢导致白屏 */
  localUri?: string;
};

/**
 * 上传头像：先调用 getAvatarUploadUrl 获取上传链接（需传 file_name、file_type），
 * 再向返回的 url 按 method/content_type 上传文件。
 * 上传完成后返回 object_key 与可选的 localUri（优先读本地避免白屏）。
 */
export async function uploadAvatarFile(
  token: string,
  file: AvatarFile,
  options?: UploadAvatarOptions
): Promise<UploadAvatarResult | null> {
  let file_name: string;
  let file_type: string;
  let blob: Blob | null = null;
  let uri: string | null = null;
  let localUri: string | undefined;

  if (file instanceof File) {
    file_name = file.name || 'avatar.jpg';
    file_type = file.type || 'image/jpeg';
    blob = file;
  } else {
    let input = file as { uri: string; name?: string; type?: string };
    if (!input.uri) return null;
    if (options?.compress) {
      const compressed = await compressImageForUpload(input);
      input = compressed;
    }
    uri = input.uri;
    file_name = input.name ?? 'avatar.jpg';
    file_type = input.type ?? 'image/jpeg';
    localUri = uri;
  }

  const uploadMeta = await getAvatarUploadUrl(token, { file_name, file_type });
  if (!uploadMeta) return null;
  const { url, method, content_type, signed_headers, object_key } = uploadMeta;

  const headers: Record<string, string> = {
    'Content-Type': content_type,
    ...(signed_headers || {}),
  };
  const httpMethod = (method || 'PUT').toUpperCase();

  try {
    if (blob) {
      const uploadRes = await fetch(url, {
        method: httpMethod,
        headers,
        body: blob,
      });
      if (!uploadRes.ok) return null;
    } else if (uri) {
      const uploadRes = await FileSystem.uploadAsync(url, uri, {
        httpMethod: httpMethod as any,
        headers,
      });
      if (uploadRes.status < 200 || uploadRes.status >= 300) return null;
    } else {
      return null;
    }
  } catch {
    return null;
  }
  return { imageId: object_key, localUri };
}
