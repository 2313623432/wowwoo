/**
 * 图片压缩：上传前按最大宽高与质量压缩，减少体积与上传时间。
 * 原生使用 expo-image-manipulator；Web 暂不压缩（可后续用 canvas 实现）。
 */

import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { Platform } from "react-native";

const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1920;
const COMPRESS_QUALITY = 0.82;

export type CompressResult = {
  uri: string;
  name: string;
  type: string;
};

/**
 * 压缩图片：仅原生端执行；Web 或非本地 uri 时返回原 file 信息。
 */
export async function compressImageForUpload(file: {
  uri: string;
  name?: string;
  type?: string;
}): Promise<CompressResult> {
  const uri = file.uri ?? "";
  const name = file.name ?? `image_${Date.now()}.jpg`;
  const type = file.type ?? "image/jpeg";

  if (Platform.OS === "web") {
    return { uri, name, type };
  }

  if (!uri || (!uri.startsWith("file://") && !uri.startsWith("content://") && !uri.startsWith("data:"))) {
    return { uri, name, type };
  }

  try {
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: MAX_WIDTH } }],
      { format: SaveFormat.JPEG, compress: COMPRESS_QUALITY },
    );
    const outUri = result?.uri;
    if (!outUri) return { uri, name, type };
    const baseName = name.replace(/\.[^.]+$/, "") || "image";
    return {
      uri: outUri,
      name: `${baseName}.jpg`,
      type: "image/jpeg",
    };
  } catch {
    return { uri, name, type };
  }
}
