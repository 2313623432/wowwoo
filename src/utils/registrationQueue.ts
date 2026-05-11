export function isRegistrationQueueHint(input?: string | null): boolean {
  const msg = (input ?? "").trim();
  if (!msg) return false;
  // 后端约定：触发限额/排队时的提示文案（中英文兜底）
  return (
    msg.includes("当前注册任务") ||
    msg.includes("限额") ||
    msg.includes("排队") ||
    msg.includes("队列") ||
    msg.includes("注册任务已满") ||
    msg.includes("注册人数过多") ||
    msg.toLowerCase().includes("registration is full") ||
    (msg.toLowerCase().includes("max") && msg.toLowerCase().includes("users"))
  );
}

export function extractQueueUntilText(input?: string | null): string | null {
  const msg = (input ?? "").trim();
  if (!msg) return null;

  // 1) 优先取 “等 xxx 之后”
  const between = msg.match(/等\s*([^\n。！？.!?，,]+?)\s*(?:之后|后)\b/);
  if (between?.[1]) return between[1].trim();

  // 2) 日期时间：2026-03-06 12:00(:00) / 2026/03/06 12:00
  const dt =
    msg.match(
      /\b\d{4}[-\/]\d{1,2}[-\/]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?\b/,
    )?.[0] ?? msg.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/)?.[0];
  if (dt) return dt.trim();

  // 3) 纯时长：10分钟/60秒/2小时
  const dur = msg.match(/\b\d+\s*(?:秒|分钟|小时|天)\b/)?.[0];
  if (dur) return dur.replace(/\s+/g, "");

  return null;
}

export function buildRegistrationQueueCopy(
  untilText: string,
  queueTotal?: number | null,
  queuePosition?: number | null,
): string {
  const x = untilText?.trim() || "稍后";
  return [
    "呜哇～真的没想到大家这么喜欢我家小产品🥺",
    "一下子来这么多宝贝，直接超出我所有预期啦",
    "我买的小服务器有点扛不住这么大热情，压力好大呜呜",
    "我真的真的超想把最舒服、最流畅的体验带给每一个人",
    "为了不让大家卡顿、影响心情，现在需要稍微排一下队",
    `您前面还有${queuePosition !== null && queuePosition !== undefined && queuePosition >= 2 ? queuePosition - 1 : queuePosition}个人 麻烦耐心等待一下下！`,
    "真的真的对不起大家，让你们等久了我好愧疚",
    "我会拼命优化，好好爱你们每一个人💔",
  ].join("\n");
}
