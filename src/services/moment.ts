import { apiRequest } from "./api";

/** 后端朋友圈单条结构 */
export type MomentApiItem = {
  id: string;
  user_id: string;
  nickname: string;
  avatar: string | null;
  content: string;
  images: string[];
  likes_count: number;
  comments_count: number;
  created_at: string;
};

/** 获取朋友圈列表 - GET /api/v1/moment/ */
export async function fetchMomentList(token: string): Promise<MomentApiItem[]> {
  const list = await apiRequest<MomentApiItem[]>("/api/v1/moments/", {
    method: "GET",
    token,
  });
  return Array.isArray(list) ? list : [];
}

/** 发表朋友圈 - POST /api/v1/moment/ */
export async function createMoment(
  token: string,
  payload: { content: string; images?: string[] },
): Promise<MomentApiItem> {
  const res = await apiRequest<MomentApiItem>("/api/v1/moments/", {
    method: "POST",
    token,
    body: {
      content: payload.content,
      images: payload.images ?? [],
    },
  });
  return (res ?? ({} as any)) as MomentApiItem;
}
