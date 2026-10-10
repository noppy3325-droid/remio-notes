import { useEffect, useState } from "react";
import { Cloud, CloudOff, HardDrive, RefreshCw } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { getSyncStatus } from "./sync";

export function SyncIndicator({
  user,
  onOpen,
}: {
  user: User | null;
  onOpen: () => void;
}) {
  const [status, setStatus] = useState(getSyncStatus);
  useEffect(() => {
    const update = () => setStatus(getSyncStatus());
    window.addEventListener("notes-sync-status", update);
    return () => window.removeEventListener("notes-sync-status", update);
  }, []);
  const label = !user
    ? "この端末に保存"
    : status.phase === "synced"
      ? "同期済み"
      : status.phase === "offline"
        ? "オフライン・端末に保存"
        : status.phase === "error"
          ? "同期を確認"
          : "同期中";
  const Icon = !user
    ? HardDrive
    : status.phase === "offline" || status.phase === "error"
      ? CloudOff
      : status.phase === "synced"
        ? Cloud
        : RefreshCw;
  return (
    <button
      className="sync-indicator"
      onClick={onOpen}
      aria-label={`${label}。アカウントと同期を開く`}
    >
      <Icon size={16} />
      <span>
        <strong>{label}</strong>
        <small>{user ? "アカウントと同期" : "Googleで端末間を同期"}</small>
      </span>
    </button>
  );
}
