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
  Menu,
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
import { Navigation } from "./Navigation";
import {
  viewTitles as titles,
  defaultStatus,
  viewCount,
} from "./view-navigation";

const hints: Partial<Record<View, string>> = {
  home: "思いついたことも、これからのことも。ひとつの場所に。",
  today: "今日の自分に、渡しておきたいこと。",
  upcoming: "少し先の予定を、ゆっくり見渡す。",
  knowledge: "経験から生まれた、小さな知識の引き出し。",
  random: "忘れていた知識と、もう一度出会う。",
  pinned: "いつでも取り出したい、大切なカード。",
  archive: "必要になったら、いつでも戻せます。",
};
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
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
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
      document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus();
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
    [status, setStatus] = useState("all"),
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
    });
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [view, tag]);
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
    if (v === "home") setSort("newest");
    setTag("");
    setQuery("");
    setStatus(defaultStatus(v));
    setFilters(false);
    setMenuId(null);
    setMobileSidebar(false);
    setViewOptions(false);
  };
  const openAdd = (content = "") => {
    setDraft(content);
    setMobileSidebar(false);
    setSettings(false);
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
        if (!editor && !settings && !detailId && !mobileSidebar)
          setSearchOpen((s) => !s);
        return;
      }
      if (
        !input &&
        !editor &&
        !settings &&
        !detailId &&
        !mobileSidebar &&
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
  }, [editor, settings, detailId, searchOpen, mobileSidebar]);
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
          const n = new Notification(c.title ?? "remio-notes", {
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
  const displayed =
    view === "random"
      ? randomCards.filter((c) => filtered.some((f) => f.id === c.id))
      : view === "home"
        ? filtered.slice(0, 12)
        : filtered;
  const hasFilters = !!tag || !!query || status !== defaultStatus(view);
  const clearFilters = () => {
    setTag("");
    setQuery("");
    setStatus(defaultStatus(view));
  };
  const modalOpen =
    !!editor ||
    !!detailId ||
    settings ||
    searchOpen ||
    mobileSidebar ||
    !!deleteCard;
  const openSettings = () => {
    setMobileSidebar(false);
    setSettings(true);
  };
  const navigation = (
    <Navigation
      cards={cards}
      user={user}
      view={view}
      tag={tag}
      tags={tags}
      onNavigate={go}
      onTag={(t) => {
        go("all");
        setTag(t);
      }}
      onSettings={openSettings}
    />
  );
  const detail = cards.find((c) => c.id === detailId);
  const relatedCards = detail
    ? cards
        .filter(
          (c) =>
            c.id !== detail.id &&
            c.status !== "archived" &&
            (c.tags.some((t) => detail.tags.includes(t)) ||
              c.contexts.some((context) => detail.contexts.includes(context))),
        )
        .slice(0, 3)
    : [];
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
                ? "完了済み"
                : "タスク"
              : (c.tags[0] ?? "メモ")}
          </span>
        </div>
        <div className="card-top-right">
          {c.sample && <span className="sample-badge">サンプル</span>}
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
        {(c.title || c.content.includes("\n")) && <p>{c.content}</p>}
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
        <div className="brand-symbol">r.</div>
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
      <aside className="sidebar" inert={modalOpen}>
        {navigation}
      </aside>
      <main className="main" inert={modalOpen}>
        <header className="topbar mobile-topbar">
          <span className="mobile-brand">remio-notes</span>
          <button
            className="icon-button"
            aria-label="アカウントと同期"
            onClick={openSettings}
          >
            <Settings size={20} />
          </button>
        </header>
        <div className="main-content">
          <div className="page-heading">
            <div>
              <h1 ref={headingRef} tabIndex={-1}>
                {tag || titles[view]}
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
                <kbd>Ctrl / ⌘ K</kbd>
              </button>
              <button className="primary" onClick={() => openAdd()}>
                <Plus size={17} />
                カードを追加
              </button>
            </div>
          </div>
          {view === "home" && !tag && !query && (
            <>
              {!cards.some((c) => !c.sample) && (
                <section className="welcome-banner">
                  <div className="banner-icon">
                    <PenLine size={23} />
                  </div>
                  <div>
                    <h2>まずは、ひとこと残してみよう。</h2>
                    <p>本文だけで保存できます。タグや期限は、あとからでも。</p>
                  </div>
                </section>
              )}
              {cards.some(
                (c) =>
                  matchesView(c, "today") ||
                  matchesView(c, "upcoming") ||
                  (c.pinned && c.status !== "archived"),
              ) && (
                <div className="home-shortcuts" aria-label="予定と大切なカード">
                  {[
                    {
                      id: "today" as View,
                      icon: Sun,
                      hint: "期限を過ぎた予定もここに",
                    },
                    {
                      id: "upcoming" as View,
                      icon: CalendarDays,
                      hint: "これからやること",
                    },
                    {
                      id: "pinned" as View,
                      icon: Pin,
                      hint: "いつでも取り出したいカード",
                    },
                  ].map(({ id, icon: Icon, hint }) => (
                    <button key={id} onClick={() => go(id)}>
                      <Icon size={20} />
                      <span>
                        <strong>{titles[id]}</strong>
                        <small>{hint}</small>
                      </span>
                      <b>{viewCount(cards, id)}</b>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {cards.some((c) => c.sample) && (
            <div className="sample-notice">
              <span>「サンプル」と付いたカードで使い方を試せます。</span>
              <button onClick={openSettings}>サンプルを管理</button>
            </div>
          )}
          {view === "stats" ? (
            <Stats cards={cards} />
          ) : view === "collections" ? (
            <>
              <div className="section-heading">
                <h2>あなたの引き出し</h2>
                <span>{tags.length}個のタグ</span>
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
                    <p>{active.filter((c) => c.tags.includes(t)).length}枚</p>
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
                <div className="section-heading toolbar-heading">
                  <h2>{view === "home" ? "最近のカード" : "カード一覧"}</h2>
                  <span>
                    {view === "home" ? displayed.length : filtered.length}枚
                  </span>
                  {view === "home" && (
                    <button
                      className="text-button show-all"
                      onClick={() => go("all")}
                    >
                      すべて見る <ChevronRight size={15} />
                    </button>
                  )}
                </div>
                <div className="toolbar-right">
                  {view !== "home" && view !== "random" && (
                    <button
                      aria-expanded={filters}
                      aria-controls="card-filters"
                      className={"text-button " + (filters ? "chosen" : "")}
                      onClick={() => setFilters(!filters)}
                    >
                      <SlidersHorizontal size={14} />
                      絞り込み
                      {hasFilters && <span className="filter-dot" />}
                    </button>
                  )}
                  {view !== "home" && view !== "random" && (
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
                  )}
                  <div className="view-options-wrap">
                    <button
                      className="text-button"
                      aria-expanded={viewOptions}
                      onClick={() => setViewOptions(!viewOptions)}
                    >
                      <LayoutGrid size={14} />
                      表示
                      <ChevronDown size={12} />
                    </button>
                    {viewOptions && (
                      <div className="popover view-options">
                        <p>表示方法</p>
                        <button
                          className={layout === "board" ? "chosen" : ""}
                          onClick={() => {
                            setLayout("board");
                            setViewOptions(false);
                          }}
                        >
                          <LayoutGrid size={15} />
                          カード
                          {layout === "board" && <Check size={14} />}
                        </button>
                        <button
                          className={layout === "list" ? "chosen" : ""}
                          onClick={() => {
                            setLayout("list");
                            setViewOptions(false);
                          }}
                        >
                          <List size={15} />
                          リスト{layout === "list" && <Check size={14} />}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {filters && (
                <div className="filter-bar" id="card-filters">
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
                  {![
                    "tasks",
                    "today",
                    "upcoming",
                    "reminders",
                    "archive",
                    "done",
                  ].includes(view) && (
                    <label>
                      状態
                      <select
                        aria-label="状態で絞り込み"
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        disabled={view === "archive" || view === "done"}
                      >
                        <option value="all">すべて</option>
                        <option value="active">未完了・メモ</option>
                        <option value="done">完了済み</option>
                      </select>
                    </label>
                  )}
                  <label className="inline-query">
                    <Search size={14} />
                    <input
                      aria-label="このビューを検索"
                      placeholder="このビューを検索…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <button className="text-button" onClick={clearFilters}>
                    クリア
                    <X size={13} />
                  </button>
                </div>
              )}
              {hasFilters && (
                <div className="active-filters" role="status">
                  <span>
                    {tag && "#" + tag + " "}
                    {query && "「" + query + "」 "}
                    {status !== defaultStatus(view) &&
                      (status === "done"
                        ? "完了済み"
                        : status === "active"
                          ? "未完了・メモ"
                          : "すべての状態")}
                  </span>
                  <button onClick={clearFilters}>
                    絞り込みを解除 <X size={14} />
                  </button>
                </div>
              )}
              <>
                {view === "random" && (
                  <div className="result-heading">
                    <button
                      className="secondary"
                      onClick={() => setRandomSeed(randomSeed + 1)}
                    >
                      <Shuffle size={14} />
                      シャッフル
                    </button>
                  </div>
                )}
                <div className={layout === "list" ? "card-list" : "card-grid"}>
                  {displayed.map((c) => renderCard(c, layout === "list"))}
                </div>
                {!displayed.length && (
                  <Empty
                    title={
                      hasFilters
                        ? "条件に合うカードがありません"
                        : view === "today"
                          ? "今日の予定はありません"
                          : view === "archive"
                            ? "アーカイブは空です"
                            : view === "done"
                              ? "完了したタスクはありません"
                              : "まだカードがありません"
                    }
                    text={
                      hasFilters
                        ? "条件を解除すると、ほかのカードを表示できます。"
                        : view === "today"
                          ? "期限を設定したカードやリマインダーをここに表示します。"
                          : view === "archive"
                            ? "カードのメニューからアーカイブすると、ここに移動します。"
                            : "本文をひとこと書くだけで保存できます。"
                    }
                    actionLabel={
                      hasFilters
                        ? "絞り込みを解除"
                        : view === "archive"
                          ? "すべてのカードへ"
                          : view === "done"
                            ? "未完了のタスクへ"
                            : "カードを追加"
                    }
                    onAdd={
                      hasFilters
                        ? clearFilters
                        : view === "archive"
                          ? () => go("all")
                          : view === "done"
                            ? () => go("tasks")
                            : () => openAdd(query)
                    }
                  />
                )}
              </>
              <footer className="content-footer">
                <span>
                  <HardDrive size={12} />
                  {user ? "この端末に保存・Googleで同期" : "この端末に保存"}
                </span>
                <span>
                  <kbd>N</kbd> 新しいカード
                  <span className="footer-divider" /> <kbd>Ctrl / ⌘ K</kbd> 検索
                </span>
              </footer>
            </>
          )}
        </div>
      </main>
      <nav
        className="mobile-navigation"
        aria-label="メインナビゲーション"
        inert={modalOpen}
      >
        <button
          aria-current={view === "home" ? "page" : undefined}
          onClick={() => go("home")}
        >
          <Home size={21} />
          <span>ホーム</span>
        </button>
        <button onClick={() => setSearchOpen(true)}>
          <Search size={21} />
          <span>検索</span>
        </button>
        <button className="mobile-add" onClick={() => openAdd()}>
          <Plus size={23} />
          <span>追加</span>
        </button>
        <button
          aria-expanded={mobileSidebar}
          onClick={() => setMobileSidebar(true)}
        >
          <Menu size={21} />
          <span>メニュー</span>
        </button>
      </nav>
      {mobileSidebar && (
        <Dialog
          drawer
          label="ナビゲーション"
          onClose={() => setMobileSidebar(false)}
        >
          <div className="drawer-header">
            <span>メニュー</span>
            <button
              className="icon-button"
              aria-label="メニューを閉じる"
              onClick={() => setMobileSidebar(false)}
            >
              <X size={20} />
            </button>
          </div>
          <div className="navigation-drawer">{navigation}</div>
        </Dialog>
      )}
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
          initialTag={tag}
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
              if (editor === "new") go("home");
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
              カードの詳細
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
              {detail.tags[0] ?? "メモ"}
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
            {relatedCards.length > 0 && (
              <div className="related">
                <h3>
                  <Layers size={15} />
                  関連するカード
                </h3>
                {relatedCards.map((c) => (
                  <button key={c.id} onClick={() => setDetailId(c.id)}>
                    {c.title ?? c.content.slice(0, 40)}
                    <ChevronRight size={14} />
                  </button>
                ))}
              </div>
            )}
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
              設定
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
              cardIds={cards.map((card) => card.id)}
              onImport={async () => {
                const guest = await readGuestCards();
                const existing = new Set(state.current.map((c) => c.id));
                const imported = guest
                  .filter((c) => !existing.has(c.id))
                  .map((c) => ({
                    ...c,
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
                データの保存
              </h3>
              <p>
                カードはこの端末のブラウザーに保存します。Googleログイン中は、同じアカウントの端末でも使えます。
              </p>
              <div className="info-strip">
                <HardDrive size={15} />
                {cards.length}枚のカードを保存
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
                    a.download = `remio-notes-${dateKey()}.json`;
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
                本文に合うタグや日時を候補として表示します。候補を選ぶと設定でき、あとから変更できます。
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
              remio-notes <span>v1.0 · Web edition</span>
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
  actionLabel = "カードを追加",
}: {
  title: string;
  text: string;
  onAdd: () => void;
  actionLabel?: string;
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
        {actionLabel}
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
  initialTag,
  cards,
  busy,
  onClose,
  onSave,
  onOpenSimilar,
}: {
  card?: Card;
  initial: string;
  initialTag: string;
  cards: Card[];
  busy: boolean;
  onClose: () => void;
  onSave: (c: Card, another: boolean) => Promise<void>;
  onOpenSimilar: (c: Card) => void;
}) {
  const [content, setContent] = useState(card?.content ?? initial),
    [title, setTitle] = useState(card?.title ?? ""),
    [tags, setTags] = useState(card?.tags.join(" ") ?? initialTag),
    [tagsOpen, setTagsOpen] = useState(!!card?.tags.length || !!initialTag),
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
    [error, setError] = useState(""),
    [discardOpen, setDiscardOpen] = useState(false),
    [leaveTarget, setLeaveTarget] = useState<Card | null>(null);
  const initialRemind = useRef(remind);
  const dirty =
    content !== (card?.content ?? initial) ||
    title !== (card?.title ?? "") ||
    tags !== (card?.tags.join(" ") ?? initialTag) ||
    due !== (card?.dueAt ?? "") ||
    context !== (card?.contexts.join("\n") ?? "") ||
    remind !== initialRemind.current;
  const requestClose = () => {
    if (busy) return;
    if (dirty) setDiscardOpen(true);
    else onClose();
  };
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
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
    <Dialog
      label={card ? "カードを編集" : "カードを追加"}
      onClose={requestClose}
    >
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
            <span className="eyebrow">本文だけで保存できます</span>
            <h2>{card ? "カードを編集" : "カードを追加"}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="閉じる"
            disabled={busy}
            onClick={requestClose}
          >
            <X size={20} />
          </button>
        </div>
        {discardOpen && (
          <div className="discard-confirm" role="alert">
            <strong>保存していない変更があります</strong>
            <p>編集を続けるか、変更を破棄してください。</p>
            <div>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setDiscardOpen(false);
                  setLeaveTarget(null);
                  contentRef.current?.focus();
                }}
              >
                編集を続ける
              </button>
              <button
                type="button"
                className="secondary danger"
                onClick={() =>
                  leaveTarget ? onOpenSimilar(leaveTarget) : onClose()
                }
              >
                変更を破棄する
              </button>
            </div>
          </div>
        )}
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
          {tagsOpen && (
            <>
              <label className="field-label" htmlFor="card-tags">
                タグ <span>任意・スペースで区切る</span>
              </label>
              <input
                id="card-tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="例：旅行 持ち物"
              />
            </>
          )}
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
              aria-expanded={tagsOpen}
              className={tagsOpen ? "selected" : ""}
              onClick={() => setTagsOpen(!tagsOpen)}
            >
              <Plus size={12} />
              タグ{chosenTags.length > 0 && "・" + chosenTags.length}
            </button>
            <button
              type="button"
              aria-expanded={dueOpen}
              className={dueOpen ? "selected" : ""}
              onClick={() => setDueOpen(!dueOpen)}
            >
              <Plus size={12} />
              期限
            </button>
            <button
              type="button"
              aria-expanded={remindOpen}
              className={remindOpen ? "selected" : ""}
              onClick={() => setRemindOpen(!remindOpen)}
            >
              <Plus size={12} />
              リマインダー
            </button>
            <button
              type="button"
              aria-expanded={contextOpen}
              className={contextOpen ? "selected" : ""}
              onClick={() => setContextOpen(!contextOpen)}
            >
              <Plus size={12} />
              使う場面
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
                  onClick={() => {
                    if (dirty) {
                      setLeaveTarget(c);
                      setDiscardOpen(true);
                    } else onOpenSimilar(c);
                  }}
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
            {busy ? "保存中…" : "保存する"}
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
        [...cards]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .filter(
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
      ).slice(0, !q && kind === "all" && date === "any" ? 8 : 30),
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
            <X size={20} />
          </button>
        </div>
        <details
          className="search-filter"
          open={kind !== "all" || date !== "any"}
        >
          <summary>
            検索条件{kind !== "all" && `・${titles[kind]}`}
            {date !== "any" &&
              (date === "today" ? "・期限は今日" : "・期限は7日以内")}
          </summary>
          <div className="search-filter-options">
            {[
              ["all", "すべて"],
              ["tasks", "タスク"],
              ["knowledge", "知識"],
              ["memos", "メモ"],
              ["reminders", "通知"],
              ["done", "完了済み"],
              ["archive", "アーカイブ"],
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
        </details>
        {!q && history.length > 0 && (
          <div className="search-start">
            <h3>最近の検索</h3>
            <div className="recent-searches">
              {history.map((h) => (
                <button key={h} onClick={() => setQ(h)}>
                  <Clock size={13} />
                  {h}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="search-result-count">
          {q ? `“${q}” の検索結果` : "最近のカード"}
          <span>
            {result.length === 30 ? "30件まで表示" : `${result.length}件`}
          </span>
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
              text={
                kind !== "all" || date !== "any"
                  ? "検索条件を解除して、すべてのカードから探せます。"
                  : "別の言葉で探すか、検索した内容を新しいカードとして残せます。"
              }
              actionLabel={
                kind !== "all" || date !== "any"
                  ? "検索条件を解除"
                  : "この内容でカードを作る"
              }
              onAdd={
                kind !== "all" || date !== "any"
                  ? () => {
                      setKind("all");
                      setDate("any");
                    }
                  : () => onAdd(q)
              }
            />
          )}
        </div>
        <div className="search-help">
          <span>
            ↑ ↓ 選択 <span>↵ 開く</span>
          </span>
          <span>本文・タグ・使う場面から検索</span>
        </div>
      </div>
    </Dialog>
  );
}
