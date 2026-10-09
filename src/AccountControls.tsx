import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Cloud, CloudOff, LogIn, LogOut, RefreshCw } from "lucide-react";
import { cloud } from "./cloud";
import { flushStorage } from "./storage";
import { getSyncStatus, syncNow } from "./sync";

export function AccountControls({
  user,
  authError,
  onImport,
}: {
  user: User | null;
  authError: string;
  onImport: () => Promise<void>;
}) {
  const [status, setStatus] = useState(getSyncStatus);
  const [error, setError] = useState(authError);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const update = () => setStatus(getSyncStatus());
    window.addEventListener("notes-sync-status", update);
    return () => window.removeEventListener("notes-sync-status", update);
  }, []);
  const action = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch {
      setError("操作を完了できませんでした。接続と設定を確認してください。");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="account-section">
      <h3>
        <Cloud size={17} />
        アカウントと同期
      </h3>
      {user ? (
        <>
          <p className="account-email">{user.email}</p>
          <div className="info-strip" role="status">
            {status.phase === "offline" ? (
              <CloudOff size={16} />
            ) : (
              <Cloud size={16} />
            )}
            {status.phase === "synced"
              ? "同期済み"
              : status.phase === "offline"
                ? "オフライン · この端末に保存"
                : status.phase === "error"
                  ? "同期を再試行できます"
                  : "同期中…"}
            {status.pending > 0 && ` · 未送信 ${status.pending}件`}
          </div>
          {status.at && (
            <p>最終同期: {new Date(status.at).toLocaleString("ja-JP")}</p>
          )}
          {status.message && <p role="alert">{status.message}</p>}
          <p>
            ログイン中のカードは、同じGoogleアカウントの端末間で同期します。オフラインの編集は接続後に送信します。
          </p>
          <div className="account-actions">
            <button
              className="secondary-button"
              disabled={busy || status.phase === "syncing"}
              onClick={() => void action(syncNow)}
            >
              <RefreshCw size={15} />
              今すぐ同期
            </button>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await flushStorage();
                  const { error } = await cloud!.auth.signOut({
                    scope: "local",
                  });
                  if (error) throw error;
                })
              }
            >
              <LogOut size={15} />
              ログアウト
            </button>
          </div>
          <p>
            ログイン前のカードは別の引き出しに残っています。下のボタンでサンプル以外をこのアカウントへコピーし、同期できます。
          </p>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => void action(onImport)}
          >
            この端末のカードを同期へ取り込む
          </button>
          <p>
            ログアウト後もアカウントのオフライン用コピーはこのブラウザーに残ります。共有端末では利用後にサイトデータを削除してください。
          </p>
        </>
      ) : (
        <>
          <p>
            Googleでログインすると、本人のカードを端末間で同期できます。ログイン前のカードはこの端末だけに保存されます。
          </p>
          <button
            className="google-login"
            disabled={busy || !cloud}
            onClick={() =>
              void action(async () => {
                await flushStorage();
                const { error } = await cloud!.auth.signInWithOAuth({
                  provider: "google",
                  options: {
                    redirectTo: `${location.origin}/auth/callback`,
                    queryParams: { prompt: "select_account" },
                  },
                });
                if (error) throw error;
              })
            }
          >
            <LogIn size={17} />
            Googleでログイン
          </button>
          {!cloud && (
            <p className="setup-note">
              現在はローカル版です。管理者が同期サービスを設定するとGoogleログインを利用できます。
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="account-error">
          {error}
        </p>
      )}
    </section>
  );
}
