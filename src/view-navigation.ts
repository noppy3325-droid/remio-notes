import { matchesView, type Card, type View } from "./model";

export const viewTitles: Record<View, string> = {
  home: "ホーム",
  all: "すべてのカード",
  today: "今日の予定",
  upcoming: "これからの予定",
  tasks: "未完了のタスク",
  reminders: "リマインダー",
  knowledge: "知識",
  memos: "メモ",
  recent: "最近追加したカード",
  pinned: "ピン留め",
  done: "完了したタスク",
  archive: "アーカイブ",
  random: "知識を再発見",
  collections: "タグ一覧",
  stats: "記録の振り返り",
};

export function defaultStatus(view: View) {
  return view === "done"
    ? "done"
    : ["today", "upcoming", "tasks", "reminders"].includes(view)
      ? "active"
      : "all";
}

export function viewCount(cards: Card[], view: View) {
  return cards.filter((card) => matchesView(card, view)).length;
}
