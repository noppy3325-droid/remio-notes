export type CardStatus = "active" | "done" | "archived";
export type Card = {
  id: string;
  title?: string;
  content: string;
  tags: string[];
  dueAt?: string;
  status: CardStatus;
  completedAt?: string;
  remindAt?: string;
  reminderEnabled: boolean;
  contexts: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  sample?: boolean;
  previousStatus?: "active" | "done";
};
export type View =
  | "home"
  | "all"
  | "today"
  | "upcoming"
  | "tasks"
  | "reminders"
  | "knowledge"
  | "memos"
  | "recent"
  | "pinned"
  | "done"
  | "archive"
  | "random"
  | "collections"
  | "stats";
export const dateKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const dayOffset = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return dateKey(d);
};
export function isTask(c: Card) {
  return !!c.dueAt || c.status === "done" || !!c.completedAt;
}
export function matchesView(c: Card, v: View, today = dateKey()) {
  if (v === "archive") return c.status === "archived";
  if (c.status === "archived") return false;
  if (v === "done") return c.status === "done";
  if (v === "today")
    return (
      c.status === "active" &&
      ((!!c.dueAt && c.dueAt.slice(0, 10) <= today) ||
        (c.reminderEnabled && !!c.remindAt && c.remindAt.slice(0, 10) <= today))
    );
  if (v === "upcoming")
    return (
      c.status === "active" &&
      ((!!c.dueAt && c.dueAt.slice(0, 10) > today) ||
        (c.reminderEnabled && !!c.remindAt && c.remindAt.slice(0, 10) > today))
    );
  if (v === "tasks") return isTask(c) && c.status === "active";
  if (v === "reminders")
    return c.reminderEnabled && !!c.remindAt && c.status === "active";
  if (v === "knowledge") return c.tags.length > 0 || c.contexts.length > 0;
  if (v === "memos")
    return !isTask(c) && !c.remindAt && !c.tags.length && !c.contexts.length;
  if (v === "pinned") return c.pinned;
  return true;
}
export function complete(c: Card): Card {
  const done = c.status !== "done";
  return {
    ...c,
    status: done ? "done" : "active",
    completedAt: done ? new Date().toISOString() : undefined,
    reminderEnabled: false,
    updatedAt: new Date().toISOString(),
  };
}
export function archive(c: Card): Card {
  return {
    ...c,
    previousStatus: c.status === "done" ? "done" : "active",
    status: "archived",
    reminderEnabled: false,
    updatedAt: new Date().toISOString(),
  };
}
export function restore(c: Card): Card {
  return {
    ...c,
    status: c.previousStatus ?? (c.completedAt ? "done" : "active"),
    updatedAt: new Date().toISOString(),
  };
}
export function dateLabel(value?: string) {
  if (!value) return "";
  const key = value.slice(0, 10);
  if (key === dateKey()) return "今日";
  if (key === dayOffset(1)) return "明日";
  const d = new Date(value);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
export function relativeDate(value: string) {
  const n = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 86400000),
  );
  return n === 0 ? "今日追加" : n === 1 ? "昨日追加" : `${n}日前に追加`;
}
export function splitTags(value: string) {
  return [
    ...new Set(
      value
        .split(/[\s,、#]+/)
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ].slice(0, 30);
}
const associations = [
  [
    "開発",
    "コード",
    "デプロイ",
    "サーバー",
    "Xserver",
    "Git",
    "React",
    "Vercel",
  ],
  ["写真", "撮影", "カメラ", "逆光", "露出", "航空機", "飛行機"],
  ["ガジェット", "USB", "iPad", "充電", "バッテリー", "PC", "Thunderbolt"],
  ["旅行", "持ち物", "空港", "海外", "パスポート"],
  ["暮らし", "掃除", "生活", "コーヒー", "料理"],
];
export function suggest(content: string) {
  const tags = associations
    .filter((a) =>
      a.slice(1).some((k) => content.toLowerCase().includes(k.toLowerCase())),
    )
    .map((a) => a[0]);
  let dueAt: string | undefined, remindAt: string | undefined;
  if (content.includes("明日")) dueAt = dayOffset(1);
  else if (content.includes("今日")) dueAt = dateKey();
  else if (content.includes("来週")) dueAt = dayOffset(7);
  const weekday = content.match(/(日|月|火|水|木|金|土)曜/);
  if (!dueAt && weekday) {
    const target = "日月火水木金土".indexOf(weekday[1]);
    dueAt = dayOffset((target - new Date().getDay() + 7) % 7);
  }
  const clock = content.match(/(?<!\d)([01]?\d|2[0-3])時(?:([0-5]?\d)分)?/);
  if (dueAt && clock)
    remindAt = `${dueAt}T${clock[1].padStart(2, "0")}:${(clock[2] ?? "00").padStart(2, "0")}`;
  const context = content.match(
    /([^。\n]{2,30}(?:する時|するとき|を買うとき|に行く時))/,
  )?.[1];
  return { tags, dueAt, remindAt, context };
}
export function searchScore(c: Card, query: string) {
  const q = query.toLocaleLowerCase().normalize("NFKC").trim();
  if (!q) return 1;
  const fields = [
    c.title ?? "",
    c.content,
    c.tags.join(" "),
    c.contexts.join(" "),
    c.dueAt ?? "",
    c.remindAt ?? "",
    c.createdAt,
    c.updatedAt,
    c.completedAt ?? "",
  ].map((x) => x.toLocaleLowerCase().normalize("NFKC"));
  let score = 0;
  const words = q.split(/\s+/);
  for (const w of words) {
    fields.forEach((f, i) => {
      if (f.includes(w)) score += [9, 4, 7, 8, 3, 3, 1, 1, 1][i];
    });
  }
  const relevant = associations.filter((a) =>
    a.some((w) => q.includes(w.toLowerCase())),
  );
  for (const a of relevant) {
    if (a.some((w) => fields.some((f) => f.includes(w.toLowerCase()))))
      score += 2;
  }
  if (q.includes("今週") || q.includes("やること") || q.includes("未完了")) {
    if (c.status !== "active" || !isTask(c)) return 0;
    if (q.includes("今週")) {
      const end = new Date();
      end.setDate(end.getDate() + ((7 - end.getDay()) % 7));
      if (!c.dueAt || c.dueAt.slice(0, 10) > dateKey(end)) return 0;
    }
    score += 3;
  }
  if (q.includes("完了済み") && c.status !== "done") return 0;
  return score;
}
export function parseBackup(text: string): Card[] {
  const raw = JSON.parse(text);
  const data = Array.isArray(raw) ? raw : raw.cards;
  if (!Array.isArray(data) || data.length > 50000)
    throw Error("正しい Knowledge Notes のバックアップを選んでください。");
  const ids = new Set<string>();
  return data.map((c: Card) => {
    if (
      !c ||
      typeof c.id !== "string" ||
      !c.id ||
      ids.has(c.id) ||
      typeof c.content !== "string" ||
      !c.content.trim() ||
      !["active", "done", "archived"].includes(c.status) ||
      !Array.isArray(c.tags) ||
      !Array.isArray(c.contexts) ||
      ![...c.tags, ...c.contexts].every((x) => typeof x === "string") ||
      typeof c.pinned !== "boolean" ||
      typeof c.reminderEnabled !== "boolean" ||
      typeof c.createdAt !== "string" ||
      typeof c.updatedAt !== "string" ||
      Number.isNaN(Date.parse(c.createdAt)) ||
      Number.isNaN(Date.parse(c.updatedAt)) ||
      (c.title !== undefined && typeof c.title !== "string") ||
      [c.dueAt, c.remindAt, c.completedAt].some(
        (x) =>
          x !== undefined &&
          (typeof x !== "string" || Number.isNaN(Date.parse(x))),
      )
    )
      throw Error("バックアップのカード形式が正しくありません。");
    ids.add(c.id);
    return {
      id: c.id,
      title: c.title,
      content: c.content,
      tags: c.tags,
      contexts: c.contexts,
      status: c.status,
      pinned: c.pinned,
      reminderEnabled: c.status === "active" && c.reminderEnabled,
      dueAt: c.dueAt,
      remindAt: c.remindAt,
      completedAt: c.completedAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      previousStatus: c.previousStatus === "done" ? "done" : "active",
    };
  });
}
