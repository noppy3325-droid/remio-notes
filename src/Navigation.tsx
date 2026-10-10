import {
  Home,
  Layers,
  Sun,
  CalendarDays,
  Pin,
  CheckCheck,
  Lightbulb,
  FileText,
  Bell,
  CheckCircle2,
  Shuffle,
  BarChart3,
  FolderOpen,
  Settings,
  Archive,
  ChevronRight,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import type { Card, View } from "./model";
import { viewCount, viewTitles } from "./view-navigation";
import { SyncIndicator } from "./SyncIndicator";

const mainItems = [
  { id: "home", icon: Home },
  { id: "all", icon: Layers },
  { id: "today", icon: Sun },
  { id: "upcoming", icon: CalendarDays },
  { id: "pinned", icon: Pin },
] as const;
const moreItems = [
  { id: "tasks", icon: CheckCheck },
  { id: "knowledge", icon: Lightbulb },
  { id: "memos", icon: FileText },
  { id: "reminders", icon: Bell },
  { id: "done", icon: CheckCircle2 },
  { id: "random", icon: Shuffle },
  { id: "stats", icon: BarChart3 },
] as const;

export function Navigation({
  cards,
  user,
  view,
  tag,
  tags,
  onNavigate,
  onTag,
  onSettings,
}: {
  cards: Card[];
  user: User | null;
  view: View;
  tag: string;
  tags: string[];
  onNavigate: (view: View) => void;
  onTag: (tag: string) => void;
  onSettings: () => void;
}) {
  const renderItem = ({
    id,
    icon: Icon,
  }: (typeof mainItems)[number] | (typeof moreItems)[number]) => (
    <button
      key={id}
      className={view === id && !tag ? "active" : ""}
      aria-current={view === id && !tag ? "page" : undefined}
      onClick={() => onNavigate(id)}
    >
      <Icon size={18} />
      <span>{viewTitles[id]}</span>
      {!["home", "random", "stats"].includes(id) && (
        <small>{viewCount(cards, id)}</small>
      )}
    </button>
  );
  return (
    <>
      <div className="workspace-label">
        <span className="brand-symbol" aria-hidden="true">
          r<span>.</span>
        </span>{" "}
        remio-notes
      </div>
      <p className="workspace-subtitle">記録して、あとで思い出す。</p>
      <div className="navigation-content">
        <nav
          aria-label="カードのナビゲーション"
          className="sidebar-list primary-navigation"
        >
          {mainItems.map(renderItem)}
        </nav>
        <details
          className="navigation-group"
          open={moreItems.some((item) => item.id === view)}
        >
          <summary>
            整理・見返す <ChevronRight size={15} />
          </summary>
          <nav className="sidebar-list" aria-label="カードの種類と振り返り">
            {moreItems.map(renderItem)}
          </nav>
        </details>
        <div className="sidebar-section-title">タグ</div>
        <nav className="sidebar-list collections" aria-label="タグで探す">
          {tags.slice(0, 5).map((t) => (
            <button
              key={t}
              className={tag === t ? "active" : ""}
              aria-current={tag === t ? "page" : undefined}
              onClick={() => onTag(t)}
            >
              <span className="tag-hash">#</span>
              <span>{t}</span>
              <small>
                {
                  cards.filter(
                    (c) => c.status !== "archived" && c.tags.includes(t),
                  ).length
                }
              </small>
            </button>
          ))}
          <button
            className={view === "collections" ? "active" : ""}
            onClick={() => onNavigate("collections")}
            aria-current={view === "collections" ? "page" : undefined}
          >
            <FolderOpen size={18} />
            <span>タグ一覧</span>
          </button>
        </nav>
      </div>
      <div className="sidebar-footer">
        <button
          onClick={() => onNavigate("archive")}
          aria-current={view === "archive" ? "page" : undefined}
        >
          <Archive size={17} />
          <span>アーカイブ</span>
          <small>{viewCount(cards, "archive")}</small>
        </button>
        <button onClick={onSettings}>
          <Settings size={17} />
          <span>設定</span>
        </button>
        <SyncIndicator user={user} onOpen={onSettings} />
      </div>
    </>
  );
}
