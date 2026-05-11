import { apiRequest, buildImageUrlFromKey } from "./api";

export type SocialHallTag =
  | "热门"
  | "年下"
  | "年上"
  | "冷脸猛猛"
  | "校草"
  | "学霸"
  | "胃痛";

export type ActorGender = "男" | "女" | "未知";

export type SocialHallActorSummary = {
  id: string;
  name: string;
  gender: ActorGender;
  avatar: string;
  bio: string;
  tags: SocialHallTag[];
  /** 是否已是好友（已在聊天列表中） */
  isFriend?: boolean;
};

export type SocialHallActorDetail = SocialHallActorSummary & {
  /** 角色设定（用于详情页长文） */
  profileText: string;
  /** 基本设置（昵称/性别等可直接复用 summary） */
};

const AVATAR = {
  yanheng: "https://api.dicebear.com/7.x/avataaars/svg?seed=yanheng",
  shenguiwan: "https://api.dicebear.com/7.x/avataaars/svg?seed=shenguiwan",
  linshenyuan: "https://api.dicebear.com/7.x/avataaars/svg?seed=linshenyuan",
  zhouyan: "https://api.dicebear.com/7.x/avataaars/svg?seed=zhouyan",
};

const ACTORS: SocialHallActorDetail[] = [
  {
    id: "yanheng",
    name: "彦舟",
    gender: "男",
    avatar: AVATAR.yanheng,
    bio: "一位27岁就成为博导的海洋生物学天才，你的素未谋面的邻居。",
    tags: ["热门", "年上", "冷脸猛猛"],
    profileText:
      "姓名：彦舟\n年龄：27岁\n身高：183cm\n身材：小麦色皮肤，肌肉紧实，肩宽腰窄，有明显疤痕\n头发：黑色硬质短发\n五官：斯文败类感的黑框眼镜，温和眉眼，高鼻梁\n职业：海洋生物学博导\n背景：你隔壁刚搬来的新邻居，在海外独自生活多年，为了保证高强度的科研效率，养成了如同精密仪器般规律的作息。",
  },
  {
    id: "shenguiwan",
    name: "沈归晚",
    gender: "男",
    avatar: AVATAR.shenguiwan,
    bio: "镇北大将军，不懂权谋，只知忠君报国，皇帝赐婚也要...",
    tags: ["年下", "校草", "胃痛"],
    profileText:
      "姓名：沈归晚\n身份：镇北大将军\n性格：寡言克制，护短\n背景：你在边关偶遇他，他把你当成唯一的“变数”。",
  },
  {
    id: "linshenyuan",
    name: "林深渊",
    gender: "男",
    avatar: AVATAR.linshenyuan,
    bio: "全校公认的学神和班草，年级第一的常驻选手，理科竞赛...",
    tags: ["热门", "学霸", "校草"],
    profileText:
      "姓名：林深渊\n身份：学神/竞赛生\n性格：清冷、理性但很会照顾人\n背景：你和他被分到同一组实验，从此你总能在他身边找到安全感。",
  },
  {
    id: "zhouyan",
    name: "周延",
    gender: "男",
    avatar: AVATAR.zhouyan,
    bio: "地下顶级拳手，他沉默寡言，行动至上，习惯用拳头解决...",
    tags: ["冷脸猛猛", "热门", "年上"],
    profileText:
      "姓名：周延\n身份：地下拳手\n性格：沉默、强势、占有欲强\n背景：你救过他一次，他从那天起就把你写进了自己的人生规则。",
  },
];

// --------- 后端类型与映射 ---------

type BackendActor = {
  id: string;
  name: string;
  gender?: string | null;
  avatar?: string | null;
  bio?: string | null;
  tags?: string[] | null;
  profileText?: string | null;
  profile_text?: string | null;
  isFriend?: boolean | number | null;
  is_friend?: boolean | number | null;
};

type BackendListResponse = {
  data?: BackendActor[];
  items?: BackendActor[];
};

type BackendDetailResponse = {
  data?: BackendActor;
} & BackendActor;

type BackendTagsResponse = {
  data?: string[];
  tags?: string[];
};

function normalizeGender(g: string | null | undefined): ActorGender {
  if (g === "男" || g === "女" || g === "未知") return g;
  if (!g) return "未知";
  const v = g.toLowerCase();
  if (v.includes("男")) return "男";
  if (v.includes("女")) return "女";
  return "未知";
}

function mapBackendActor(a: BackendActor): SocialHallActorDetail {
  const tags = (a.tags ??
    []) as SocialHallTag[]; /* 由后端保证取值在约定枚举内 */
  const profileText = a.profileText ?? a.profile_text ?? "";
  const avatar = buildImageUrlFromKey(a.avatar ?? null);
  const isFriendRaw = (a.isFriend ?? a.is_friend ?? null) as
    | boolean
    | number
    | string
    | null;
  let isFriend = false;
  if (typeof isFriendRaw === "boolean") {
    isFriend = isFriendRaw;
  } else if (typeof isFriendRaw === "number") {
    isFriend = isFriendRaw === 1;
  } else if (typeof isFriendRaw === "string") {
    const v = isFriendRaw.toLowerCase();
    isFriend = v === "1" || v === "true";
  }
  return {
    id: String(a.id),
    name: a.name,
    gender: normalizeGender(a.gender),
    avatar:
      avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=wowwoo-actor",
    bio: a.bio ?? "",
    tags,
    profileText,
    isFriend,
  };
}

export async function fetchSocialHallTags(
  token: string,
): Promise<SocialHallTag[]> {
  try {
    const res = await apiRequest<BackendTagsResponse>(
      "/api/v1/entertainment/social-hall/tags",
      { method: "GET", token },
    );
    const list = res.data ?? res.tags ?? [];
    if (!Array.isArray(list) || list.length === 0)
      throw new Error("empty tags");
    return list as SocialHallTag[];
  } catch {
    // 回退到本地 mock，避免页面挂掉
    return ["热门", "年下", "年上", "冷脸猛猛", "校草", "学霸", "胃痛"];
  }
}

export type FetchSocialHallActorsParams = {
  tag?: SocialHallTag;
  keyword?: string;
};

export async function fetchSocialHallActors(
  token: string,
  params?: FetchSocialHallActorsParams,
): Promise<SocialHallActorSummary[]> {
  const qs = new URLSearchParams();
  if (params?.tag) qs.set("tag", params.tag);
  if (params?.keyword) qs.set("keyword", params.keyword.trim());
  const query = qs.toString();
  const path = query
    ? `/api/v1/entertainment/social-hall/actors?${query}`
    : "/api/v1/entertainment/social-hall/actors";

  try {
    const res = await apiRequest<BackendListResponse>(path, {
      method: "GET",
      token,
    });
    const list = res.data ?? res.items ?? [];
    if (!Array.isArray(list) || list.length === 0) return [];
    return list.map((a) => {
      const mapped = mapBackendActor(a);
      const { profileText: _profile, ...summary } = mapped;
      return summary;
    });
  } catch {
    // 回退到本地 mock
    const tag = params?.tag;
    const keyword = (params?.keyword ?? "").trim().toLowerCase();
    return ACTORS.filter((a) => {
      const matchTag = !tag || a.tags.includes(tag);
      const matchKeyword =
        !keyword ||
        a.name.toLowerCase().includes(keyword) ||
        a.bio.toLowerCase().includes(keyword) ||
        a.tags.some((t) => String(t).toLowerCase().includes(keyword));
      return matchTag && matchKeyword;
    }).map(({ profileText: _profile, ...rest }) => rest);
  }
}

export async function fetchSocialHallActorDetail(
  token: string,
  id: string,
): Promise<SocialHallActorDetail | null> {
  try {
    const res = await apiRequest<BackendDetailResponse>(
      `/api/v1/entertainment/actors/${encodeURIComponent(id)}`,
      { method: "GET", token },
    );
    const raw = res.data ?? res;
    if (!raw) return null;
    return mapBackendActor(raw);
  } catch {
    // 回退到本地 mock
    return ACTORS.find((a) => a.id === id) ?? null;
  }
}

// --------- 添加角色到聊天（社交大厅 -> 个聊） ---------

type AddFriendBackendResponse = {
  id?: string | number;
  session_id?: string | number;
  name?: string | null;
  avatar?: string | null;
  avatar_uri?: string | null;
  avatarUri?: string | null;
};

export type AddActorToChatResult = {
  chatId: string;
  name: string;
  avatar: string;
};

/**
 * 调用后端接口：POST /api/v1/entertainment/add_friend/{bot_id}
 * - 请求成功返回会话 id 及基础信息
 * - 这里做一次轻度归一化，供前端跳转个聊页使用
 */
export async function addActorToChat(
  token: string,
  botId: string,
): Promise<AddActorToChatResult> {
  const raw = await apiRequest<AddFriendBackendResponse>(
    `/api/v1/entertainment/add_friend/${encodeURIComponent(botId)}`,
    { method: "POST", token },
  );
  const chatId = String(raw?.session_id ?? raw?.id ?? "").trim();
  if (!chatId) {
    throw new Error("创建会话失败：返回缺少会话 ID");
  }

  const avatarKey =
    (raw?.avatarUri ?? raw?.avatar_uri ?? raw?.avatar ?? null) ?? null;
  const avatar =
    (avatarKey && buildImageUrlFromKey(avatarKey)) ||
    "https://api.dicebear.com/7.x/avataaars/svg?seed=wowwoo-actor";

  const name = (raw?.name ?? "").toString();

  return { chatId, name, avatar };
}
