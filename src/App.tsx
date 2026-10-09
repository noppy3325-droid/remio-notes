import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Home,
  Layers,
  FolderOpen,
  Search,
  Shuffle,
  BarChart3,
  Settings,
  Plus,
  ArrowUpRight,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Check,
  CheckCheck,
  X,
  MoreHorizontal,
  Pin,
  Copy,
  Archive,
  Trash2,
  PenLine,
  CalendarDays,
  Bell,
  Lightbulb,
  FileText,
  LayoutGrid,
  List,
  SlidersHorizontal,
  ArrowDownUp,
  Download,
  Upload,
  ShieldCheck,
  Command,
  Sparkles,
  Sun,
  Clock,
  Link2,
  CheckCircle2,
  HardDrive,
  RotateCcw,
  BookOpen,
  WifiOff,
} from "lucide-react";
import {
  type Card,
  type View,
  matchesView,
  dateKey,
  dayOffset,
  dateLabel,
  relativeDate,
  isTask,
  complete,
  archive,
  restore,
  splitTags,
  suggest,
  parseBackup,
} from "./model";
import {
  initStorage,
  saveCards,
  searchCards,
  storageMode,
  readGuestCards,
} from "./storage";
import type { User } from "@supabase/supabase-js";
import { preferenceKey } from "./cloud";
import { AccountControls } from "./AccountControls";
import { preserveStaleEditor } from "./sync-model";

const titles: Record<View, string> = {
  home: "My cards",
  all: "All cards",
  today: "Today",
  upcoming: "Upcoming",
  tasks: "Tasks",
  reminders: "Reminders",
  knowledge: "Knowledge",
  memos: "Memos",
  recent: "Recently added",
  pinned: "Pinned",
  done: "Completed",
  archive: "Archive",
  random: "Random gems",
  collections: "Collections",
  stats: "Your knowledge",
};
const hints: Partial<Record<View, string>> = {
  home: "思いついたことも、これからのことも。ひとつの場所に。",
  today: "今日の自分に、渡しておきたいこと。",
  upcoming: "少し先の予定を、ゆっくり見渡す。",
  knowledge: "経験から生まれた、小さな知識の引き出し。",
  random: "忘れていた知識と、もう一度出会う。",
  pinned: "いつでも取り出したい、大切なカード。",
  archive: "必要になったら、いつでも戻せます。",
};
const navItems = [
  { id: "home" as View, icon: Home, label: "ホーム" },
  { id: "all" as View, icon: Layers, label: "すべてのカード" },
  { id: "collections" as View, icon: FolderOpen, label: "コレクション" },
  { id: "search", icon: Search, label: "検索" },
  { id: "random" as View, icon: Shuffle, label: "ランダム" },
  { id: "stats" as View, icon: BarChart3, label: "統計" },
];
const sidebarItems = [
  { id: "all" as View, label: "All cards", icon: Layers },
  { id: "today" as View, label: "Today", icon: Sun },
  { id: "upcoming" as View, label: "Upcoming", icon: CalendarDays },
  { id: "reminders" as View, label: "Reminders", icon: Bell },
  { id: "pinned" as View, label: "Pinned", icon: Pin },
  { id: "recent" as View, label: "Recently added", icon: Clock },
];
const collectionColors: Record<string, string> = {
  開発: "blue",
  ガジェット: "yellow",
  写真: "lavender",
  旅行: "green",
  暮らし: "pink",
  Tips: "yellow",
};
function color(c: Card) {
  return collectionColors[c.tags[0]] ?? "gray";
}
function safeRead(key: string, fallback: string) {
  try {
    return localStorage.getItem(preferenceKey(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function safeWrite(key: string, value: string) {
  try {
    localStorage.setItem(preferenceKey(key), value);
  } catch {
    /* Preferences are optional. */
  }
}
function useDialogKeys(
  onClose: () => void,
  ref: React.RefObject<HTMLDivElement | null>,
) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>(
      "input,textarea,button,select",
    );
    first?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
      }
      if (e.key === "Tab" && el) {
        const focusable = Array.from(
          el.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled),textarea,select,a[href]",
          ),
        ).filter((n) => n.offsetParent !== null);
        const first = focusable[0],
          last = focusable.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [ref]);
}
function Dialog({
  children,
  onClose,
  label,
  drawer = false,
}: {
  children: ReactNode;
  onClose: () => void;
  label: string;
  drawer?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogKeys(onClose, ref);
  return (
    <div
      className={"overlay " + (drawer ? "drawer-overlay" : "")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={drawer ? "drawer" : "dialog"}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
      </div>
    </div>
  );
}

export default function App({
  user,
  authError,
}: {
  user: User | null;
  authError: string;
}) {
  const [cards, setCards] = useState<Card[]>([]),
    [loading, setLoading] = useState(true),
    [fatal, setFatal] = useState(""),
    [view, setView] = useState<View>("home"),
    [tag, setTag] = useState(""),
    [query, setQuery] = useState(""),
    [searchOpen, setSearchOpen] = useState(false),
    [editor, setEditor] = useState<Card | "new" | null>(null),
    [draft, setDraft] = useState(""),
    [detailId, setDetailId] = useState<string | null>(null),
    [settings, setSettings] = useState(false),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [layout, setLayout] = useState<"board" | "list">(() =>
      safeRead("kn-layout", "board") === "list" ? "list" : "board",
    ),
    [status, setStatus] = useState("active"),
    [sort, setSort] = useState("newest"),
    [filters, setFilters] = useState(false),
    [menuId, setMenuId] = useState<string | null>(null),
    [viewOptions, setViewOptions] = useState(false),
    [randomSeed, setRandomSeed] = useState(0),
    [mobileSidebar, setMobileSidebar] = useState(false),
    [deleteCard, setDeleteCard] = useState<Card | null>(null),
    [notificationPermission, setNotificationPermission] = useState(
      typeof Notification !== "undefined"
        ? Notification.permission
        : "unsupported",
    ),
    [now, setNow] = useState(Date.now()),
    [history, setHistory] = useState<string[]>(() => {
      try {
        return JSON.parse(safeRead("kn-history", "[]"));
      } catch {
        return [];
      }
    }),
    [columns, setColumns] = useState<View[]>(() => {
      try {
        const c = JSON.parse(
          safeRead("kn-columns", '["today","upcoming","knowledge","random"]'),
        );
        return Array.isArray(c) &&
          c.length === 4 &&
          c.every((v) =>
            [
              "today",
              "upcoming",
              "knowledge",
              "random",
              "pinned",
              "recent",
              "tasks",
              "memos",
              "reminders",
            ].includes(v),
          )
          ? c
          : ["today", "upcoming", "knowledge", "random"];
      } catch {
        return ["today", "upcoming", "knowledge", "random"];
      }
    });
  const state = useRef(cards);
  state.current = cards;
  const writing = useRef(false);
  useEffect(() => {
    let alive = true;
    const onChanged = (event: Event) => {
      if (alive) {
        const next = (event as CustomEvent<Card[]>).detail;
        state.current = next;
        setCards(next);
      }
    };
    window.addEventListener("notes-changed", onChanged);
    initStorage()
      .then((c) => {
        if (alive) {
          setCards(c);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (alive) {
          setFatal(String(e.message ?? e));
          setLoading(false);
        }
      });
    return () => {
      alive = false;
      window.removeEventListener("notes-changed", onChanged);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    safeWrite("kn-layout", layout);
  }, [layout]);
  useEffect(() => {
    safeWrite("kn-columns", JSON.stringify(columns));
  }, [columns]);
  const notify = (message: string) => setToast(message);
  const commit = async (next: Card[]) => {
    if (writing.current) return false;
    writing.current = true;
    setBusy(true);
    try {
      const saved = await saveCards(next, state.current);
      setCards(saved);
      state.current = saved;
      return true;
    } catch (e) {
      notify(
        "保存できませんでした。端末の空き容量とブラウザー設定を確認してください。",
      );
      console.error(e);
      return false;
    } finally {
      writing.current = false;
      setBusy(false);
    }
  };
  const change = async (c: Card, message?: string) => {
    const ok = await commit(state.current.map((x) => (x.id === c.id ? c : x)));
    if (ok && message) notify(message);
    return ok;
  };
  const go = (v: View) => {
    setView(v);
    setTag("");
    setQuery("");
    setStatus(
      v === "done"
        ? "done"
        : v === "all" || v === "knowledge" || v === "pinned" || v === "recent"
          ? "all"
          : "active",
    );
    setMenuId(null);
    setMobileSidebar(false);
    setViewOptions(false);
  };
  const openAdd = (content = "") => {
    setDraft(content);
    setEditor("new");
    setSearchOpen(false);
    setDetailId(null);
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const input = (e.target as HTMLElement).closest(
        'input,textarea,select,[contenteditable="true"]',
      );
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!editor && !settings && !detailId) setSearchOpen((s) => !s);
        return;
      }
      if (
        !input &&
        !editor &&
        !settings &&
        !detailId &&
        !searchOpen &&
        e.key.toLowerCase() === "n" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        openAdd();
      }
      if (e.key === "Escape") {
        setMenuId(null);
        setViewOptions(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editor, settings, detailId, searchOpen]);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".card-menu-wrap"))
        setMenuId(null);
      if (!(e.target as HTMLElement).closest(".view-options-wrap"))
        setViewOptions(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  useEffect(() => {
    const fired = new Set<string>();
    const tick = () => {
      setNow(Date.now());
      const due = state.current.filter(
        (c) =>
          !c.sample &&
          c.status === "active" &&
          c.reminderEnabled &&
          c.remindAt &&
          new Date(c.remindAt).getTime() <= Date.now() &&
          !fired.has(c.id + ":" + c.remindAt),
      );
      for (const c of due) {
        fired.add(c.id + ":" + c.remindAt);
        notify("リマインダー：" + (c.title ?? c.content.slice(0, 30)));
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          const n = new Notification(c.title ?? "Knowledge Notes", {
            body: c.content.slice(0, 160),
            icon: "/icon.svg",
            tag: c.id,
          });
          n.onclick = () => {
            window.focus();
            setDetailId(c.id);
            n.close();
          };
        }
      }
    };
    tick();
    const t = setInterval(tick, 15000);
    return () => clearInterval(t);
  }, []);
  const active = cards.filter((c) => c.status !== "archived");
  const tags = useMemo(
    () =>
      [...new Set(active.flatMap((c) => c.tags))].sort((a, b) => {
        const aa = Object.keys(collectionColors).indexOf(a),
          bb = Object.keys(collectionColors).indexOf(b);
        return (aa < 0 ? 99 : aa) - (bb < 0 ? 99 : bb) || a.localeCompare(b);
      }),
    [cards],
  );
  const filtered = useMemo(() => {
    let list = cards.filter(
      (c) =>
        matchesView(c, view) &&
        (!tag || c.tags.includes(tag)) &&
        (view === "archive" ||
          view === "done" ||
          status === "all" ||
          c.status === status),
    );
    if (query) list = searchCards(list, query);
    if (!query)
      list.sort((a, b) =>
        sort === "oldest"
          ? a.createdAt.localeCompare(b.createdAt)
          : sort === "due"
            ? (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999")
            : sort === "title"
              ? (a.title ?? a.content).localeCompare(b.title ?? b.content)
              : b.createdAt.localeCompare(a.createdAt),
      );
    return list;
  }, [cards, view, tag, query, status, sort, now]);
  const randomCards = useMemo(
    () =>
      active
        .filter((c) => !isTask(c))
        .map((c) => ({ c, n: Math.random() }))
        .sort((a, b) => a.n - b.n)
        .slice(0, 3)
        .map((x) => x.c),
    [cards, randomSeed],
  );
  const columnCards = (v: View) => {
    if (v === "random")
      return randomCards.filter((c) => filtered.some((f) => f.id === c.id));
    let a = filtered.filter((c) => matchesView(c, v));
    if (v === "knowledge") a = a.filter((c) => !isTask(c));
    if (v === "recent") a = a.slice(0, 6);
    return a;
  };
  const detail = cards.find((c) => c.id === detailId);
  const addHistory = (q: string) => {
    if (!q.trim()) return;
    const next = [q, ...history.filter((x) => x !== q)].slice(0, 6);
    setHistory(next);
    safeWrite("kn-history", JSON.stringify(next));
  };
  const remove = async () => {
    if (!deleteCard) return;
    const ok = await commit(
      state.current.filter((c) => c.id !== deleteCard.id),
    );
    if (ok) {
      setDeleteCard(null);
      setDetailId(null);
      notify("カードを削除しました");
    }
  };
  const edit = (c: Card) => {
    setDetailId(null);
    setEditor(c);
  };
  const cardAction = async (c: Card, action: string) => {
    setMenuId(null);
    if (action === "open") setDetailId(c.id);
    if (action === "edit") edit(c);
    if (action === "pin")
      await change(
        { ...c, pinned: !c.pinned, updatedAt: new Date().toISOString() },
        c.pinned ? "ピン留めを解除しました" : "ピン留めしました",
      );
    if (action === "archive")
      await change(
        c.status === "archived" ? restore(c) : archive(c),
        c.status === "archived" ? "カードを戻しました" : "アーカイブしました",
      );
    if (action === "delete") {
      setDetailId(null);
      setDeleteCard(c);
    }
    if (action === "duplicate") {
      const time = new Date().toISOString();
      const copy = {
        ...c,
        id: crypto.randomUUID(),
        title: (c.title ?? "カード") + " のコピー",
        status: "active" as const,
        completedAt: undefined,
        reminderEnabled: false,
        sample: false,
        createdAt: time,
        updatedAt: time,
      };
      if (await commit([...state.current, copy]))
        notify("カードを複製しました");
    }
  };
  const renderCard = (c: Card, compact = false) => (
    <article
      key={c.id}
      className={`note-card ${color(c)} ${c.status === "done" ? "completed" : ""} ${compact ? "compact" : ""}`}
    >
      <div className="card-top">
        <div className="card-kind">
          {isTask(c) ? (
            <button
              className={"task-check " + (c.status === "done" ? "checked" : "")}
              aria-label={c.status === "done" ? "未完了に戻す" : "完了にする"}
              disabled={busy || c.status === "archived"}
              onClick={() =>
                change(
                  complete(c),
                  c.status === "done"
                    ? "未完了に戻しました"
                    : "完了しました。知識は残ります。",
                )
              }
            >
              {c.status === "done" && <Check size={11} />}
            </button>
          ) : (
            <span className="category-dot" />
          )}
          <span>
            {isTask(c)
              ? c.status === "done"
                ? "Completed"
                : "Task"
              : (c.tags[0] ?? "Memo")}
          </span>
        </div>
        <div className="card-top-right">
          {c.pinned && <Pin size={12} className="pin-mark" />}
          <div className="card-menu-wrap">
            <button
              className="icon-button more"
              aria-label={`${c.title ?? "カード"}のメニュー`}
              aria-expanded={menuId === c.id}
              onClick={() => setMenuId(menuId === c.id ? null : c.id)}
            >
              <MoreHorizontal size={18} />
            </button>
            {menuId === c.id && (
              <div className="popover card-menu">
                {[
                  [ArrowUpRight, "開く", "open"],
                  [PenLine, "編集", "edit"],
                  [Pin, c.pinned ? "ピン留めを解除" : "ピン留め", "pin"],
                  [Copy, "複製", "duplicate"],
                  [
                    Archive,
                    c.status === "archived" ? "元に戻す" : "アーカイブ",
                    "archive",
                  ],
                  [Trash2, "削除", "delete"],
                ].map(([Icon, label, action]) => {
                  const I = Icon as typeof Search;
                  return (
                    <button
                      key={String(action)}
                      disabled={busy}
                      className={action === "delete" ? "danger" : ""}
                      onClick={() => cardAction(c, String(action))}
                    >
                      <I size={14} />
                      {String(label)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      <button className="card-body" onClick={() => setDetailId(c.id)}>
        <h3>{c.title ?? c.content.split("\n")[0].slice(0, 50)}</h3>
        <p>{c.content}</p>
      </button>
      <div className="card-tags">
        {c.tags.slice(0, 3).map((t) => (
          <button
            key={t}
            onClick={() => {
              go("all");
              setTag(t);
            }}
          >
            #{t}
          </button>
        ))}
      </div>
      {c.contexts.length > 0 && (
        <div className="card-context">
          <Link2 size={12} />
          {c.contexts[0]}
        </div>
      )}
      <div className="card-bottom">
        {c.dueAt ? (
          <span
            className={
              "due " +
              (c.status === "active" && c.dueAt.slice(0, 10) < dateKey()
                ? "overdue"
                : "")
            }
          >
            <CalendarDays size={12} />
            {c.status === "done"
              ? "完了"
              : c.dueAt.slice(0, 10) < dateKey()
                ? "期限超過 · " + dateLabel(c.dueAt)
                : dateLabel(c.dueAt)}
          </span>
        ) : (
          <span>{relativeDate(c.createdAt)}</span>
        )}
        {c.reminderEnabled && c.remindAt ? (
          <span
            className="reminder-mini"
            title={`通知 ${new Date(c.remindAt).toLocaleString("ja-JP")}`}
          >
            <Bell size={12} />
            {new Date(c.remindAt).toLocaleTimeString("ja-JP", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        ) : (
          <span className="open-arrow">
            <ArrowUpRight size={13} />
          </span>
        )}
      </div>
    </article>
  );
  if (loading)
    return (
      <div className="boot">
        <div className="brand-symbol">k.</div>
        <p>引き出しを開いています…</p>
      </div>
    );
  if (fatal)
    return (
      <div className="boot">
        <HardDrive size={32} />
        <h2>データを開けませんでした</h2>
        <p>{fatal}</p>
        <button className="primary" onClick={() => location.reload()}>
          再読み込み
        </button>
      </div>
    );
  return (
    <div className="app-shell">
      <nav className="global-nav" aria-label="メインナビゲーション">
        <button
          className="brand-symbol"
          title="Knowledge Notes"
          onClick={() => go("home")}
        >
          k<span>.</span>
        </button>
        <div className="global-links">
          {navItems.map((n) => (
            <button
              key={n.id}
              className={
                "nav-icon " + (view === n.id && !tag ? "selected" : "")
              }
              title={n.label}
              aria-label={n.label}
              onClick={() =>
                n.id === "search" ? setSearchOpen(true) : go(n.id as View)
              }
            >
              <n.icon size={21} strokeWidth={1.65} />
            </button>
          ))}
        </div>
        <div className="nav-bottom">
          <button
            className="nav-icon"
            aria-label="設定"
            title="設定"
            onClick={() => setSettings(true)}
          >
            <Settings size={21} strokeWidth={1.65} />
          </button>
          <button
            className="avatar"
            title={user?.email || "アカウントと同期"}
            aria-label="アカウントと同期"
            onClick={() => setSettings(true)}
          >
            {user?.email?.[0]?.toUpperCase() || "N"}
          </button>
        </div>
      </nav>
      <aside className={"sidebar " + (mobileSidebar ? "mobile-open" : "")}>
        <div className="workspace-label">
          Knowledge <ChevronDown size={14} />
        </div>
        <div className="workspace-subtitle">Your personal space</div>
        <button className="add-sidebar" onClick={() => openAdd()}>
          <Plus size={17} />
          カードを追加<kbd>N</kbd>
        </button>
        <button className="sidebar-search" onClick={() => setSearchOpen(true)}>
          <Search size={15} />
          カードを探す<kbd>⌘ K</kbd>
        </button>
        <div className="sidebar-list">
          {sidebarItems.map((n) => (
            <button
              key={n.id}
              className={view === n.id && !tag ? "active" : ""}
              onClick={() => go(n.id)}
            >
              <n.icon size={16} />
              <span>{n.label}</span>
              <small>
                {n.id === "recent"
                  ? active.length
                  : cards.filter((c) => matchesView(c, n.id)).length}
              </small>
            </button>
          ))}
        </div>
        <div className="sidebar-section-title">VIEWS</div>
        <div className="sidebar-list">
          {[
            { id: "tasks" as View, label: "Tasks", icon: CheckCheck },
            { id: "knowledge" as View, label: "Knowledge", icon: Lightbulb },
            { id: "memos" as View, label: "Memos", icon: FileText },
          ].map((n) => (
            <button
              key={n.id}
              className={view === n.id && !tag ? "active" : ""}
              onClick={() => go(n.id)}
            >
              <n.icon size={16} />
              <span>{n.label}</span>
              <small>{cards.filter((c) => matchesView(c, n.id)).length}</small>
            </button>
          ))}
        </div>
        <div className="sidebar-section-title">
          COLLECTIONS
          <button
            className="icon-button"
            aria-label="コレクション一覧"
            onClick={() => go("collections")}
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="sidebar-list collections">
          {tags.slice(0, 7).map((t) => (
            <button
              key={t}
              className={tag === t ? "active" : ""}
              onClick={() => {
                go("all");
                setTag(t);
              }}
            >
              <span className={"tag-dot " + (collectionColors[t] ?? "gray")} />
              <span>{t}</span>
              <small>{active.filter((c) => c.tags.includes(t)).length}</small>
            </button>
          ))}
          {tags.length > 7 && (
            <button className="see-all" onClick={() => go("collections")}>
              すべてのタグを見る
              <ChevronRight size={13} />
            </button>
          )}
        </div>
        <div className="sidebar-footer">
          <button onClick={() => go("archive")}>
            <Archive size={15} />
            アーカイブ
            <span>{cards.filter((c) => c.status === "archived").length}</span>
          </button>
          <div className="local-status">
            <span className="status-dot" />
            この端末に保存
            <ShieldCheck size={13} />
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label="サイドバー切り替え"
              onClick={() => setMobileSidebar(!mobileSidebar)}
            >
              <Layers size={18} />
            </button>
            <span>Personal workspace</span>
            <ChevronRight size={12} />
            <strong>{tag || titles[view]}</strong>
          </div>
          <div className="topbar-end">
            <span className="local-top">
              <span className="status-dot" />
              Local first
            </span>
            <button
              className="icon-button"
              title="リマインダー"
              aria-label="リマインダー"
              onClick={() => go("reminders")}
            >
              <Bell size={17} />
            </button>
          </div>
        </header>
        <div className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR PERSONAL DRAWER</div>
              <h1>
                {tag || titles[view]}
                <span className="title-dot">.</span>
              </h1>
              <p>
                {tag
                  ? `「${tag}」にまつわる知識とメモ。`
                  : (hints[view] ??
                    "あとで思い出したいことを、すぐに取り出す。")}
              </p>
            </div>
            <div className="heading-actions">
              <button
                className="secondary search-action"
                onClick={() => setSearchOpen(true)}
              >
                <Search size={16} />
                <span>検索</span>
                <kbd>⌘ K</kbd>
              </button>
              <button className="primary" onClick={() => openAdd()}>
                <Plus size={17} />
                Add card
              </button>
            </div>
          </div>
          {view === "home" && !tag && !query && (
            <section className="welcome-banner">
              <div className="banner-icon">
                <Lightbulb size={25} strokeWidth={1.45} />
              </div>
              <div>
                <h2>A little less to remember.</h2>
                <p>覚えておきたいことは、ここへ。頭の中には、余白を。</p>
              </div>
              <button onClick={() => openAdd()}>
                ひとつ、残してみる
                <ArrowUpRight size={15} />
              </button>
              <div className="paper-stack" aria-hidden="true">
                <i />
                <i />
                <i>
                  <span />
                  <span />
                  <span />
                </i>
              </div>
            </section>
          )}
          {view === "stats" ? (
            <Stats cards={cards} />
          ) : view === "collections" ? (
            <>
              <div className="section-heading">
                <h2>あなたの引き出し</h2>
                <span>{tags.length} collections</span>
              </div>
              <div className="collection-grid">
                {tags.map((t) => (
                  <button
                    key={t}
                    className="collection-tile"
                    onClick={() => {
                      go("all");
                      setTag(t);
                    }}
                  >
                    <span
                      className={
                        "collection-icon " + (collectionColors[t] ?? "gray")
                      }
                    >
                      <FolderOpen size={22} />
                    </span>
                    <h3>{t}</h3>
                    <p>
                      {active.filter((c) => c.tags.includes(t)).length} cards
                    </p>
                    <ArrowUpRight size={17} />
                  </button>
                ))}
              </div>
              {!tags.length && (
                <Empty
                  onAdd={() => openAdd()}
                  title="タグを付けると、引き出しができる"
                  text="カードのタグが、そのままコレクションになります。"
                />
              )}
            </>
          ) : (
            <>
              <div className="toolbar">
                <div className="view-tabs">
                  {[
                    { id: "home" as View, label: "Overview" },
                    { id: "all" as View, label: "All cards" },
                    { id: "tasks" as View, label: "Tasks" },
                    { id: "knowledge" as View, label: "Knowledge" },
                  ].map((n) => (
                    <button
                      key={n.id}
                      className={view === n.id && !tag ? "current" : ""}
                      onClick={() => go(n.id)}
                    >
                      {n.label}
                      {n.id === "all" && <span>{active.length}</span>}
                    </button>
                  ))}
                </div>
                <div className="toolbar-right">
                  <button
                    className={"text-button " + (filters ? "chosen" : "")}
                    onClick={() => setFilters(!filters)}
                  >
                    <SlidersHorizontal size={14} />
                    Filter
                    {(tag || status === "done") && (
                      <span className="filter-dot" />
                    )}
                  </button>
                  <label className="sort-control">
                    <ArrowDownUp size={14} />
                    <select
                      aria-label="並べ替え"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="newest">追加順</option>
                      <option value="oldest">古い順</option>
                      <option value="due">期限順</option>
                      <option value="title">タイトル順</option>
                    </select>
                  </label>
                  <div className="view-options-wrap">
                    <button
                      className="text-button"
                      onClick={() => setViewOptions(!viewOptions)}
                    >
                      <LayoutGrid size={14} />
                      View
                      <ChevronDown size={12} />
                    </button>
                    {viewOptions && (
                      <div className="popover view-options">
                        <p>表示方法</p>
                        <button
                          className={layout === "board" ? "chosen" : ""}
                          onClick={() => setLayout("board")}
                        >
                          <LayoutGrid size={15} />
                          カードボード
                          {layout === "board" && <Check size={14} />}
                        </button>
                        <button
                          className={layout === "list" ? "chosen" : ""}
                          onClick={() => setLayout("list")}
                        >
                          <List size={15} />
                          リスト{layout === "list" && <Check size={14} />}
                        </button>
                        {view === "home" && (
                          <>
                            <p>ホームの列</p>
                            {columns.map((v, i) => (
                              <label key={i}>
                                列 {i + 1}
                                <select
                                  value={v}
                                  onChange={(e) =>
                                    setColumns(
                                      columns.map((x, j) =>
                                        j === i ? (e.target.value as View) : x,
                                      ),
                                    )
                                  }
                                >
                                  {[
                                    "today",
                                    "upcoming",
                                    "knowledge",
                                    "random",
                                    "pinned",
                                    "recent",
                                    "tasks",
                                    "memos",
                                    "reminders",
                                  ].map((x) => (
                                    <option key={x} value={x}>
                                      {titles[x as View]}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {filters && (
                <div className="filter-bar">
                  <label>
                    タグ
                    <select
                      aria-label="タグで絞り込み"
                      value={tag}
                      onChange={(e) => setTag(e.target.value)}
                    >
                      <option value="">すべて</option>
                      {tags.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    状態
                    <select
                      aria-label="状態で絞り込み"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      disabled={view === "archive" || view === "done"}
                    >
                      <option value="all">すべて</option>
                      <option value="active">未完了</option>
                      <option value="done">完了済み</option>
                    </select>
                  </label>
                  <label className="inline-query">
                    <Search size={14} />
                    <input
                      aria-label="このビューを検索"
                      placeholder="このビューを検索…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <button
                    className="text-button"
                    onClick={() => {
                      setTag("");
                      setQuery("");
                      setStatus("all");
                    }}
                  >
                    クリア
                    <X size={13} />
                  </button>
                </div>
              )}
              {view === "home" && layout === "board" ? (
                <div className="board">
                  {columns.map((v, i) => {
                    const group = columnCards(v);
                    return (
                      <section className="board-column" key={i}>
                        <div className="column-heading">
                          <span
                            className={
                              "column-dot " +
                              (v === "today"
                                ? "green"
                                : v === "upcoming"
                                  ? "yellow"
                                  : v === "knowledge"
                                    ? "blue"
                                    : "lavender")
                            }
                          />
                          <h2>{titles[v]}</h2>
                          <span className="count">{group.length}</span>
                          {v === "random" ? (
                            <button
                              className="icon-button"
                              aria-label="知識をシャッフル"
                              onClick={() => setRandomSeed(randomSeed + 1)}
                            >
                              <Shuffle size={14} />
                            </button>
                          ) : (
                            <button
                              className="icon-button"
                              aria-label={`${titles[v]}に追加`}
                              onClick={() => openAdd()}
                            >
                              <Plus size={16} />
                            </button>
                          )}
                        </div>
                        <div className="column-description">
                          {v === "today"
                            ? "今日、やっておきたいこと"
                            : v === "upcoming"
                              ? "少し先の、自分のために"
                              : v === "knowledge"
                                ? "いつか役立つ、小さな発見"
                                : "もう一度、出会う知識"}
                        </div>
                        <div className="column-cards">
                          {group.map((c) => renderCard(c))}
                          {!group.length && (
                            <button
                              className="column-empty"
                              onClick={() => openAdd()}
                            >
                              <Plus size={18} />
                              まだカードがありません
                            </button>
                          )}
                        </div>
                        <button
                          className="add-column"
                          onClick={() => openAdd()}
                        >
                          <Plus size={14} />
                          Add a card
                        </button>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <>
                  <div className="result-heading">
                    <span>
                      {filtered.length} cards{tag && ` · #${tag}`}
                      {query && ` · “${query}”`}
                    </span>
                    {view === "random" && (
                      <button
                        className="secondary"
                        onClick={() => setRandomSeed(randomSeed + 1)}
                      >
                        <Shuffle size={14} />
                        シャッフル
                      </button>
                    )}
                  </div>
                  <div
                    className={layout === "list" ? "card-list" : "card-grid"}
                  >
                    {(view === "random"
                      ? randomCards.filter((c) =>
                          filtered.some((x) => x.id === c.id),
                        )
                      : filtered
                    ).map((c) => renderCard(c, layout === "list"))}
                  </div>
                  {!filtered.length && (
                    <Empty
                      title={
                        query
                          ? "見つかりませんでした"
                          : "まだカードがありません"
                      }
                      text={
                        query
                          ? "別の言葉で探すか、新しい知識として残してみましょう。"
                          : "あとで思い出したいことを、ひとつだけ書いてみよう。"
                      }
                      onAdd={() => openAdd(query)}
                    />
                  )}
                </>
              )}
              <footer className="content-footer">
                <span>
                  <HardDrive size={12} />
                  {storageMode}
                </span>
                <span>
                  <kbd>N</kbd> 新しいカード
                  <span className="footer-divider" /> <kbd>⌘ K</kbd> 検索
                </span>
              </footer>
            </>
          )}
        </div>
      </main>
      {searchOpen && (
        <SearchDialog
          cards={cards}
          history={history}
          onClose={() => setSearchOpen(false)}
          onOpen={(c) => {
            addHistory(query);
            setSearchOpen(false);
            setDetailId(c.id);
          }}
          onAdd={openAdd}
          onHistory={addHistory}
        />
      )}
      {editor && (
        <Editor
          card={editor === "new" ? undefined : editor}
          initial={draft}
          cards={cards}
          busy={busy}
          onClose={() => setEditor(null)}
          onOpenSimilar={(c) => {
            setEditor(null);
            setDetailId(c.id);
          }}
          onSave={async (c, another) => {
            if (editor !== "new")
              c = preserveStaleEditor(
                editor,
                state.current.find((x) => x.id === c.id),
                c,
                () => crypto.randomUUID(),
              );
            const exists = state.current.some((x) => x.id === c.id);
            if (
              await commit(
                exists
                  ? state.current.map((x) => (x.id === c.id ? c : x))
                  : [c, ...state.current],
              )
            ) {
              notify(exists ? "変更を保存しました" : "カードを保存しました");
              if (another) {
                setDraft("");
                setEditor(null);
                setTimeout(() => setEditor("new"), 0);
              } else setEditor(null);
            }
          }}
        />
      )}
      {detail && (
        <Dialog drawer label="カードの詳細" onClose={() => setDetailId(null)}>
          <div className="drawer-header">
            <span>
              <BookOpen size={17} />
              Card detail
            </span>
            <button
              className="icon-button"
              aria-label="閉じる"
              onClick={() => setDetailId(null)}
            >
              <X size={19} />
            </button>
          </div>
          <div className="detail-body">
            <div className="detail-kind">
              <span className={"tag-dot " + color(detail)} />
              {detail.tags[0] ?? "Memo"}
              {detail.sample && <span className="sample-badge">サンプル</span>}
            </div>
            <h2>{detail.title ?? detail.content.split("\n")[0]}</h2>
            <div className="detail-content">{detail.content}</div>
            <div className="detail-tags">
              {detail.tags.map((t) => (
                <span key={t}>#{t}</span>
              ))}
            </div>
            {detail.contexts.map((c) => (
              <div key={c} className="detail-property">
                <Link2 size={16} />
                <span>こんな時に</span>
                <strong>{c}</strong>
              </div>
            ))}
            {detail.dueAt && (
              <div className="detail-property">
                <CalendarDays size={16} />
                <span>期限</span>
                <strong>
                  {new Date(detail.dueAt).toLocaleDateString("ja-JP")}
                </strong>
              </div>
            )}
            {detail.remindAt && (
              <div className="detail-property">
                <Bell size={16} />
                <span>通知</span>
                <strong>
                  {new Date(detail.remindAt).toLocaleString("ja-JP", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {!detail.reminderEnabled && "（停止中）"}
                </strong>
              </div>
            )}
            {isTask(detail) && (
              <button
                disabled={busy || detail.status === "archived"}
                className={
                  "complete-button " +
                  (detail.status === "done" ? "is-done" : "")
                }
                onClick={() =>
                  change(
                    complete(detail),
                    detail.status === "done"
                      ? "未完了に戻しました"
                      : "完了しました",
                  )
                }
              >
                <CheckCircle2 size={18} />
                {detail.status === "done"
                  ? "完了済み · 未完了に戻す"
                  : "このタスクを完了する"}
              </button>
            )}
            {detail.reminderEnabled &&
              detail.remindAt &&
              new Date(detail.remindAt).getTime() <= now && (
                <div className="reminder-actions">
                  <button
                    disabled={busy}
                    className="secondary"
                    onClick={() =>
                      change(
                        {
                          ...detail,
                          remindAt: new Date(Date.now() + 600000).toISOString(),
                          sample: false,
                        },
                        "10分後に通知します",
                      )
                    }
                  >
                    10分後に通知
                  </button>
                  <button
                    disabled={busy}
                    className="secondary"
                    onClick={() =>
                      change(
                        { ...detail, reminderEnabled: false },
                        "通知を解除しました",
                      )
                    }
                  >
                    通知を解除
                  </button>
                </div>
              )}
            <div className="detail-dates">
              作成 {new Date(detail.createdAt).toLocaleString("ja-JP")}
              <br />
              更新 {new Date(detail.updatedAt).toLocaleString("ja-JP")}
            </div>
            <div className="related">
              <h3>
                <Layers size={15} />
                関連するカード
              </h3>
              {cards
                .filter(
                  (c) =>
                    c.id !== detail.id &&
                    c.status !== "archived" &&
                    (c.tags.some((t) => detail.tags.includes(t)) ||
                      c.contexts.some((x) => detail.contexts.includes(x))),
                )
                .slice(0, 3)
                .map((c) => (
                  <button key={c.id} onClick={() => setDetailId(c.id)}>
                    {c.title ?? c.content.slice(0, 40)}
                    <ChevronRight size={14} />
                  </button>
                ))}
            </div>
          </div>
          <div className="drawer-footer">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => cardAction(detail, "pin")}
            >
              <Pin size={15} />
              {detail.pinned ? "解除" : "ピン留め"}
            </button>
            <button
              className="icon-button"
              disabled={busy}
              aria-label="アーカイブまたは復元"
              onClick={() => cardAction(detail, "archive")}
            >
              <Archive size={17} />
            </button>
            <button
              className="icon-button danger"
              disabled={busy}
              aria-label="削除"
              onClick={() => cardAction(detail, "delete")}
            >
              <Trash2 size={17} />
            </button>
            <button className="primary" onClick={() => edit(detail)}>
              <PenLine size={15} />
              編集する
            </button>
          </div>
        </Dialog>
      )}
      {settings && (
        <Dialog drawer label="設定" onClose={() => setSettings(false)}>
          <div className="drawer-header">
            <span>
              <Settings size={18} />
              Settings
            </span>
            <button
              className="icon-button"
              aria-label="閉じる"
              onClick={() => setSettings(false)}
            >
              <X size={19} />
            </button>
          </div>
          <div className="settings-body">
            <h2>自分のペースで。</h2>
            <p className="muted">データも、使い方も、あなたのもの。</p>
            <AccountControls
              user={user}
              authError={authError}
              onImport={async () => {
                const guest = await readGuestCards();
                const existing = new Set(state.current.map((c) => c.id));
                const imported = guest.map((c) => ({
                  ...c,
                  id: existing.has(c.id) ? crypto.randomUUID() : c.id,
                  sample: false,
                }));
                if (await commit([...state.current, ...imported]))
                  notify(`${imported.length}件を同期へ取り込みました。`);
                else throw Error("取り込みに失敗しました");
              }}
            />
            <section>
              <h3>
                <ShieldCheck size={17} />
                ローカルファースト
              </h3>
              <p>
                カードはこのブラウザーのSQLiteに保存します。ログイン中は本人専用のクラウドにも同期します。ログイン前のカードは端末内だけに保存します。
              </p>
              <div className="info-strip">
                <HardDrive size={15} />
                {cards.length} cards · SQLite + FTS5
              </div>
              <p>
                ブラウザーのデータ削除に備えて、定期的にバックアップを保存してください。
              </p>
            </section>
            <section>
              <h3>
                <Bell size={17} />
                リマインダー
              </h3>
              <p>
                アプリを開いている間、期限を過ぎた通知を表示します。閉じている間の定刻通知には対応していません。
              </p>
              <button
                className="secondary"
                disabled={
                  notificationPermission === "granted" ||
                  notificationPermission === "unsupported"
                }
                onClick={async () => {
                  try {
                    const p = await Notification.requestPermission();
                    setNotificationPermission(p);
                    notify(
                      p === "granted"
                        ? "ブラウザー通知を有効にしました"
                        : "アプリ内の通知は引き続き使えます",
                    );
                  } catch {
                    notify("このブラウザーでは通知を許可できません");
                  }
                }}
              >
                <Bell size={15} />
                {notificationPermission === "granted"
                  ? "ブラウザー通知は有効"
                  : notificationPermission === "unsupported"
                    ? "アプリ内通知を使用"
                    : notificationPermission === "denied"
                      ? "通知がブロックされています"
                      : "ブラウザー通知を有効にする"}
              </button>
              {notificationPermission === "denied" && (
                <p>ブラウザーのサイト設定から通知を許可できます。</p>
              )}
            </section>
            <section>
              <h3>
                <Download size={17} />
                バックアップ
              </h3>
              <p>
                JSONファイルとして保存し、別の端末にも持ち出せます。読み込み時は既存カードを残し、同じIDのカードを更新します。
              </p>
              <div className="backup-buttons">
                <button
                  className="secondary"
                  onClick={() => {
                    const url = URL.createObjectURL(
                      new Blob(
                        [
                          JSON.stringify(
                            {
                              version: 1,
                              exportedAt: new Date().toISOString(),
                              cards,
                            },
                            null,
                            2,
                          ),
                        ],
                        { type: "application/json" },
                      ),
                    );
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `knowledge-notes-${dateKey()}.json`;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                    notify("バックアップを書き出しました");
                  }}
                >
                  <Download size={15} />
                  書き出す
                </button>
                <label
                  className={
                    "secondary file-upload " + (busy ? "disabled" : "")
                  }
                >
                  <Upload size={15} />
                  読み込む
                  <input
                    type="file"
                    accept=".json,application/json"
                    disabled={busy}
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      try {
                        if (f.size > 30000000)
                          throw Error("ファイルは30MB以下にしてください。");
                        const incoming = parseBackup(await f.text());
                        const merged = new Map(
                          state.current.map((c) => [c.id, c]),
                        );
                        incoming.forEach((c) => merged.set(c.id, c));
                        if (await commit([...merged.values()]))
                          notify(`${incoming.length}件を読み込みました`);
                      } catch (err) {
                        notify((err as Error).message);
                      }
                    }}
                  />
                </label>
              </div>
            </section>
            <section>
              <h3>
                <Command size={17} />
                ショートカット
              </h3>
              <div className="shortcut-row">
                <span>カードを検索</span>
                <kbd>Ctrl / ⌘ K</kbd>
              </div>
              <div className="shortcut-row">
                <span>新しいカード</span>
                <kbd>N</kbd>
              </div>
              <div className="shortcut-row">
                <span>カードを保存</span>
                <kbd>Ctrl / ⌘ Enter</kbd>
              </div>
              <div className="shortcut-row">
                <span>閉じる</span>
                <kbd>Esc</kbd>
              </div>
            </section>
            <section>
              <h3>
                <Sparkles size={17} />
                入力の提案
              </h3>
              <p>
                タグ・日時・文脈を端末内のルールで提案します。候補をクリックすると採用できます。LLMとEmbeddingによる意味検索は今後の拡張です。
              </p>
            </section>
            {cards.some((c) => c.sample) && (
              <section>
                <h3>サンプルカード</h3>
                <p>
                  最初のカードは使い方を試せるサンプルです。編集したカードは残ります。
                </p>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={async () => {
                    if (await commit(state.current.filter((c) => !c.sample)))
                      notify("サンプルカードを取り除きました");
                  }}
                >
                  <Trash2 size={15} />
                  サンプルだけを取り除く
                </button>
              </section>
            )}
            <div className="settings-signature">
              Knowledge Notes <span>v1.0 · Web edition</span>
            </div>
          </div>
        </Dialog>
      )}
      {deleteCard && (
        <Dialog label="カードの削除" onClose={() => setDeleteCard(null)}>
          <div className="confirm-body">
            <Trash2 size={26} />
            <h2>このカードを削除しますか？</h2>
            <p>
              「{deleteCard.title ?? deleteCard.content.slice(0, 40)}
              」は削除後に戻せません。
            </p>
            <div>
              <button className="secondary" onClick={() => setDeleteCard(null)}>
                キャンセル
              </button>
              <button
                className="primary danger-fill"
                disabled={busy}
                onClick={remove}
              >
                削除する
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={16} />
          {toast}
          <button
            className="icon-button"
            aria-label="通知を閉じる"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function Empty({
  title,
  text,
  onAdd,
}: {
  title: string;
  text: string;
  onAdd: () => void;
}) {
  return (
    <div className="empty-state">
      <div>
        <Layers size={29} strokeWidth={1.3} />
      </div>
      <h2>{title}</h2>
      <p>{text}</p>
      <button className="primary" onClick={onAdd}>
        <Plus size={16} />
        カードを追加
      </button>
    </div>
  );
}
function Stats({ cards }: { cards: Card[] }) {
  const active = cards.filter((c) => c.status !== "archived");
  const tags = [...new Set(active.flatMap((c) => c.tags))];
  return (
    <>
      <div className="stats-grid">
        {[
          ["残したカード", active.length, Layers],
          ["知識の引き出し", tags.length, FolderOpen],
          [
            "完了したタスク",
            cards.filter((c) => c.status === "done").length,
            CheckCircle2,
          ],
          ["ピン留め", active.filter((c) => c.pinned).length, Pin],
        ].map(([label, value, Icon]) => {
          const I = Icon as typeof Search;
          return (
            <div className="stat" key={String(label)}>
              <I size={20} />
              <p>{String(label)}</p>
              <strong>{String(value)}</strong>
            </div>
          );
        })}
      </div>
      <section className="stats-panel">
        <h2>どんな知識を集めている？</h2>
        <p className="muted">
          タグ別のカード数。同じカードに複数のタグを付けられます。
        </p>
        {tags.map((t) => {
          const count = active.filter((c) => c.tags.includes(t)).length;
          return (
            <div className="stat-bar" key={t}>
              <span>{t}</span>
              <div>
                <i
                  className={collectionColors[t] ?? "gray"}
                  style={{
                    width: `${Math.max(3, (count / Math.max(1, active.length)) * 100)}%`,
                  }}
                />
              </div>
              <strong>{count}</strong>
            </div>
          );
        })}
      </section>
    </>
  );
}

function Editor({
  card,
  initial,
  cards,
  busy,
  onClose,
  onSave,
  onOpenSimilar,
}: {
  card?: Card;
  initial: string;
  cards: Card[];
  busy: boolean;
  onClose: () => void;
  onSave: (c: Card, another: boolean) => Promise<void>;
  onOpenSimilar: (c: Card) => void;
}) {
  const [content, setContent] = useState(card?.content ?? initial),
    [title, setTitle] = useState(card?.title ?? ""),
    [tags, setTags] = useState(card?.tags.join(" ") ?? ""),
    [due, setDue] = useState(card?.dueAt ?? ""),
    [remind, setRemind] = useState(() => {
      if (!card?.remindAt) return "";
      const d = new Date(card.remindAt);
      return (
        dateKey(d) +
        "T" +
        String(d.getHours()).padStart(2, "0") +
        ":" +
        String(d.getMinutes()).padStart(2, "0")
      );
    }),
    [context, setContext] = useState(card?.contexts.join("\n") ?? ""),
    [showTitle, setShowTitle] = useState(!!card?.title),
    [dueOpen, setDueOpen] = useState(!!card?.dueAt),
    [remindOpen, setRemindOpen] = useState(!!card?.remindAt),
    [contextOpen, setContextOpen] = useState(!!card?.contexts.length),
    [another, setAnother] = useState(false),
    [error, setError] = useState("");
  const form = useRef<HTMLFormElement>(null),
    contentRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    contentRef.current?.focus();
  }, []);
  const s = suggest(content);
  const chosenTags = splitTags(tags);
  const similar =
    content.length > 12
      ? cards
          .filter(
            (c) =>
              c.id !== card?.id &&
              c.status !== "archived" &&
              (c.content.includes(content.slice(0, 18)) ||
                (splitTags(tags).length > 0 &&
                  c.tags.some((t) => chosenTags.includes(t)))),
          )
          .slice(0, 2)
      : [];
  const save = async () => {
    if (!content.trim()) {
      setError("本文をひとつ書いてみてください。");
      contentRef.current?.focus();
      return;
    }
    if (remind && Number.isNaN(new Date(remind).getTime())) {
      setError("通知日時を確認してください。");
      return;
    }
    const time = new Date().toISOString();
    await onSave(
      {
        ...card,
        id: card?.id ?? crypto.randomUUID(),
        title: title.trim() || undefined,
        content: content.trim(),
        tags: chosenTags,
        contexts: context
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean),
        dueAt: due || undefined,
        remindAt: remind ? new Date(remind).toISOString() : undefined,
        reminderEnabled: !!remind && (card?.status ?? "active") === "active",
        status: card?.status ?? "active",
        pinned: card?.pinned ?? false,
        sample: false,
        createdAt: card?.createdAt ?? time,
        updatedAt: time,
      },
      another,
    );
  };
  return (
    <Dialog label={card ? "カードを編集" : "カードを追加"} onClose={onClose}>
      <form
        ref={form}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            if (!busy) save();
          }
        }}
      >
        <div className="editor-header">
          <div>
            <span className="eyebrow">A NOTE TO YOUR FUTURE SELF</span>
            <h2>
              {card ? "Edit card" : "Add a card"}
              <span className="title-dot">.</span>
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="閉じる"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div className="editor-body">
          {showTitle ? (
            <input
              className="title-input"
              aria-label="タイトル（任意）"
              placeholder="タイトル（任意）"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          ) : (
            <button
              type="button"
              className="text-button title-add"
              onClick={() => setShowTitle(true)}
            >
              <Plus size={13} />
              タイトルを付ける（任意）
            </button>
          )}
          <label className="content-label" htmlFor="card-content">
            思いついたことを書く
          </label>
          <textarea
            ref={contentRef}
            id="card-content"
            placeholder={
              "あとで思い出したいこと、あとでやること。\nひとまず、ここに。"
            }
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setError("");
            }}
            rows={6}
            maxLength={100000}
          />
          <label className="field-label" htmlFor="card-tags">
            タグ <span>任意 · スペースで区切る</span>
          </label>
          <input
            id="card-tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="例：開発 USB-C"
          />
          {content.trim() && (s.tags.length || s.dueAt || s.context) && (
            <div className="suggestions">
              <span>
                <Sparkles size={13} />
                入力からの候補
              </span>
              <div>
                {s.tags.map((t) => (
                  <button
                    type="button"
                    key={t}
                    className={chosenTags.includes(t) ? "adopted" : ""}
                    onClick={() =>
                      setTags(
                        chosenTags.includes(t)
                          ? chosenTags.filter((x) => x !== t).join(" ")
                          : [...chosenTags, t].join(" "),
                      )
                    }
                  >
                    {chosenTags.includes(t) && <Check size={11} />}#{t}
                  </button>
                ))}
                {s.dueAt && (
                  <button
                    type="button"
                    className={due === s.dueAt ? "adopted" : ""}
                    onClick={() => {
                      setDue(due === s.dueAt ? "" : s.dueAt!);
                      setDueOpen(true);
                    }}
                  >
                    <CalendarDays size={12} />
                    {dateLabel(s.dueAt)}
                  </button>
                )}
                {s.remindAt && (
                  <button
                    type="button"
                    className={remind === s.remindAt ? "adopted" : ""}
                    onClick={() => {
                      setRemind(remind === s.remindAt ? "" : s.remindAt!);
                      setRemindOpen(true);
                    }}
                  >
                    <Bell size={12} />
                    {s.remindAt.slice(11)}
                  </button>
                )}
                {s.context && (
                  <button
                    type="button"
                    className={context === s.context ? "adopted" : ""}
                    onClick={() => {
                      setContext(context === s.context ? "" : s.context!);
                      setContextOpen(true);
                    }}
                  >
                    <Link2 size={12} />
                    {s.context}
                  </button>
                )}
              </div>
              <small>候補をクリックして採用。自動で設定されません。</small>
            </div>
          )}
          <div className="attribute-buttons">
            <button
              type="button"
              className={dueOpen ? "selected" : ""}
              onClick={() => setDueOpen(!dueOpen)}
            >
              <Plus size={12} />
              期限
            </button>
            <button
              type="button"
              className={remindOpen ? "selected" : ""}
              onClick={() => setRemindOpen(!remindOpen)}
            >
              <Plus size={12} />
              リマインダー
            </button>
            <button
              type="button"
              className={contextOpen ? "selected" : ""}
              onClick={() => setContextOpen(!contextOpen)}
            >
              <Plus size={12} />
              Context
            </button>
          </div>
          {dueOpen && (
            <div className="attribute-field">
              <label htmlFor="card-due">
                <CalendarDays size={15} />
                期限
              </label>
              <input
                id="card-due"
                type="date"
                value={due.slice(0, 10)}
                onChange={(e) => setDue(e.target.value)}
              />
              <button
                type="button"
                className="icon-button"
                aria-label="期限を解除"
                onClick={() => {
                  setDue("");
                  setDueOpen(false);
                }}
              >
                <X size={14} />
              </button>
            </div>
          )}
          {remindOpen && (
            <>
              <div className="attribute-field">
                <label htmlFor="card-remind">
                  <Bell size={15} />
                  通知日時
                </label>
                <input
                  id="card-remind"
                  type="datetime-local"
                  value={remind}
                  onChange={(e) => setRemind(e.target.value)}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label="リマインダーを解除"
                  onClick={() => {
                    setRemind("");
                    setRemindOpen(false);
                  }}
                >
                  <X size={14} />
                </button>
              </div>
              <p className="field-note">アプリを開いている間に通知します。</p>
            </>
          )}
          {contextOpen && (
            <div className="context-field">
              <label className="field-label" htmlFor="card-context">
                <Link2 size={14} />
                どんな時に見たい？
              </label>
              <textarea
                id="card-context"
                rows={2}
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="例：旅行の準備をする時（1行に1つ）"
              />
            </div>
          )}
          {similar.length > 0 && (
            <div className="similar">
              <span>似たカードがあります</span>
              {similar.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onOpenSimilar(c)}
                >
                  {c.title ?? c.content.slice(0, 35)}
                  <ArrowUpRight size={13} />
                </button>
              ))}
              <small>このまま新しいカードとして保存できます。</small>
            </div>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="editor-footer">
          {!card ? (
            <label className="another-check">
              <input
                type="checkbox"
                checked={another}
                onChange={(e) => setAnother(e.target.checked)}
              />
              続けて追加する
            </label>
          ) : (
            <span className="muted">Ctrl / ⌘ Enter で保存</span>
          )}
          <button
            type="submit"
            className="primary"
            disabled={busy || !content.trim()}
          >
            {busy ? "保存中…" : "Save card"}
            <ArrowUpRight size={15} />
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function SearchDialog({
  cards,
  history,
  onClose,
  onOpen,
  onAdd,
  onHistory,
}: {
  cards: Card[];
  history: string[];
  onClose: () => void;
  onOpen: (c: Card) => void;
  onAdd: (q: string) => void;
  onHistory: (q: string) => void;
}) {
  const [q, setQ] = useState(""),
    [kind, setKind] = useState<View>("all"),
    [date, setDate] = useState("any"),
    [idx, setIdx] = useState(0);
  const result = useMemo(
    () =>
      searchCards(
        cards.filter(
          (c) =>
            matchesView(c, kind) &&
            (date === "any" ||
              (date === "today" &&
                !!c.dueAt &&
                c.dueAt.slice(0, 10) === dateKey()) ||
              (date === "week" &&
                !!c.dueAt &&
                c.dueAt.slice(0, 10) >= dateKey() &&
                c.dueAt.slice(0, 10) <= dayOffset(7))),
        ),
        q,
      ).slice(0, 30),
    [cards, q, kind, date],
  );
  useEffect(() => setIdx(0), [q, kind, date]);
  const open = (c: Card) => {
    onHistory(q);
    onOpen(c);
  };
  return (
    <Dialog label="カードを検索" onClose={onClose}>
      <div
        className="search-dialog"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIdx((x) => Math.min(x + 1, result.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setIdx((x) => Math.max(0, x - 1));
          }
          if (
            e.key === "Enter" &&
            (e.target as HTMLElement).tagName === "INPUT"
          ) {
            e.preventDefault();
            if (result[idx]) open(result[idx]);
          }
        }}
      >
        <div className="search-input-wrap">
          <Search size={21} />
          <input
            aria-label="検索キーワード"
            placeholder="何を探していますか？"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            className="icon-button"
            aria-label="検索を閉じる"
            onClick={onClose}
          >
            <kbd>Esc</kbd>
          </button>
        </div>
        <div className="search-filter">
          {[
            ["all", "すべて"],
            ["tasks", "タスク"],
            ["knowledge", "ナレッジ"],
            ["memos", "メモ"],
            ["reminders", "通知"],
            ["done", "完了済み"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={kind === id ? "active" : ""}
              onClick={() => setKind(id as View)}
            >
              {label}
            </button>
          ))}
          <select
            aria-label="期限で絞り込み"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          >
            <option value="any">期限：すべて</option>
            <option value="today">今日</option>
            <option value="week">7日以内</option>
          </select>
        </div>
        {!q && kind === "all" && date === "any" && (
          <div className="search-start">
            {history.length > 0 && (
              <>
                <h3>最近の検索</h3>
                <div className="recent-searches">
                  {history.map((h) => (
                    <button key={h} onClick={() => setQ(h)}>
                      <Clock size={13} />
                      {h}
                    </button>
                  ))}
                </div>
              </>
            )}
            <h3>こんな言葉から、探してみる</h3>
            <div className="recent-searches">
              {["USB-C", "写真 逆光", "今週やること", "旅行"].map((h) => (
                <button key={h} onClick={() => setQ(h)}>
                  {h}
                  <ArrowUpRight size={12} />
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="search-result-count">
          {q ? `“${q}” の検索結果` : "最近のカード"}
          <span>{result.length} results</span>
        </div>
        <div className="search-results">
          {result.map((c, i) => (
            <button
              className={"search-result " + (i === idx ? "focused" : "")}
              key={c.id}
              onMouseEnter={() => setIdx(i)}
              onClick={() => open(c)}
            >
              <span className={"search-result-icon " + color(c)}>
                {isTask(c) ? <CheckCheck size={19} /> : <FileText size={19} />}
              </span>
              <div>
                <h3>{c.title ?? c.content.slice(0, 45)}</h3>
                <p>{c.content.slice(0, 100)}</p>
                <small>
                  {c.tags.map((t) => "#" + t).join("  ")}
                  {c.contexts.length > 0 && ` · ${c.contexts[0]}`}
                  {c.dueAt && ` · 期限 ${dateLabel(c.dueAt)}`}
                </small>
              </div>
              <ArrowUpRight size={15} />
            </button>
          ))}
          {!result.length && (
            <Empty
              title="見つかりませんでした"
              text="別の言葉で探すか、新しい知識として残せます。"
              onAdd={() => onAdd(q)}
            />
          )}
        </div>
        <div className="search-help">
          <span>
            ↑ ↓ 選択 <span>↵ 開く</span>
          </span>
          <span>全文・タグ・Contextを端末内で検索</span>
        </div>
      </div>
    </Dialog>
  );
}
