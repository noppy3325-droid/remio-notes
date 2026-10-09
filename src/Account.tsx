import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { cloud, setAccount } from "./cloud";
import { flushStorage } from "./storage";
import { startSync } from "./sync";
import App from "./App";

export default function SessionGate() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [authError, setAuthError] = useState("");
  const [switching, setSwitching] = useState(false);
  useEffect(() => {
    let alive = true;
    let knownId: string | null | undefined;
    let stop: (() => void) | undefined;
    let subscription: { unsubscribe(): void } | undefined;
    async function initialize() {
      const result = cloud ? await cloud.auth.getSession() : null;
      if (!alive) return;
      const current = result?.data.session?.user ?? null;
      knownId = current?.id ?? null;
      setAccount(current?.id);
      setUser(current);
      const callback = new URL(location.href);
      if (result?.error || callback.searchParams.has("error"))
        setAuthError(
          "ログインを完了できませんでした。Googleログインをもう一度お試しください。",
        );
      if (location.pathname === "/auth/callback")
        history.replaceState(null, "", "/");
      if (current) stop = startSync();
      if (cloud)
        subscription = cloud.auth.onAuthStateChange((_event, session) => {
          if ((session?.user.id ?? null) !== knownId) {
            stop?.();
            setSwitching(true);
            // Drain local persistence before switching namespaces. Do not await
            // Supabase calls inside the auth callback (its internal lock is held).
            setTimeout(() => {
              void flushStorage().then(() => location.reload());
            }, 0);
          }
        }).data.subscription;
    }
    void initialize().catch(() => {
      if (alive)
        setAuthError(
          "アカウントを確認できませんでした。再読み込みしてください。",
        );
    });
    return () => {
      alive = false;
      stop?.();
      subscription?.unsubscribe();
    };
  }, []);
  if (user === undefined || switching)
    return (
      <div className="session-loading" role="status">
        {authError || "引き出しを準備しています…"}
      </div>
    );
  return <App user={user} authError={authError} />;
}
