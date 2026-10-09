import { accountId, cloud } from "./cloud";
import { initStorage, readSyncState, updateCloudState } from "./storage";
import { acknowledge, mergeCloud, validateCloudRows } from "./sync-model";

export type SyncStatus = {
  phase: "local" | "syncing" | "synced" | "offline" | "error";
  pending: number;
  message?: string;
  at?: string;
};
let status: SyncStatus = { phase: "local", pending: 0 };
let running: Promise<void> | undefined;
let epoch = 0;
export const getSyncStatus = () => status;
function publish(next: SyncStatus) {
  status = next;
  window.dispatchEvent(new Event("notes-sync-status"));
}
const count = () => Object.keys(readSyncState()?.pending ?? {}).length;

// One runner per tab. Local commits continue while requests are in flight.
export function syncNow() {
  if (!cloud || accountId === "guest") return Promise.resolve();
  return (running ??= performSync(epoch).finally(() => {
    running = undefined;
  }));
}
async function performSync(token: number) {
  try {
    await initStorage();
    if (token !== epoch) return;
    if (!navigator.onLine) {
      publish({ phase: "offline", pending: count() });
      return;
    }
    publish({ phase: "syncing", pending: count() });
    const pending = readSyncState()!.pending;
    for (const [id, sent] of Object.entries(pending)) {
      if (token !== epoch) return;
      const { data, error } = await cloud!.rpc("apply_note_card", {
        p_id: id,
        p_base: sent.base,
        p_card: sent.card,
        p_mutation: sent.mutationId,
      });
      if (token !== epoch) return;
      if (error) throw error;
      if (!data || typeof data.applied !== "boolean" || !data.row)
        throw Error("同期の応答を確認できませんでした");
      const row = validateCloudRows([data.row])[0];
      if (row.id !== id) throw Error("Invalid acknowledgement");
      await updateCloudState((cards, state) =>
        acknowledge(cards, state, id, sent, row, data.applied, () =>
          crypto.randomUUID(),
        ),
      );
    }
    const { data, error } = await cloud!.rpc("list_note_cards");
    if (token !== epoch) return;
    if (error) throw error;
    const rows = validateCloudRows(data);
    await updateCloudState((cards, state) => mergeCloud(cards, state, rows));
    const remaining = count();
    publish({
      phase: remaining ? "syncing" : "synced",
      pending: remaining,
      at: new Date().toISOString(),
    });
    if (remaining && token === epoch)
      setTimeout(() => {
        if (token === epoch) void syncNow();
      }, 500);
  } catch (error) {
    if (token !== epoch) return;
    const code = (error as { code?: string }).code;
    publish({
      phase: navigator.onLine ? "error" : "offline",
      pending: count(),
      message:
        code === "PGRST202"
          ? "同期データベースの初期設定が必要です。"
          : "同期できませんでした。接続とログインを確認してください。カードは端末に保存されています。",
    });
  }
}
export function startSync() {
  const onPending = () => {
    publish({ ...status, pending: count() });
    void syncNow();
  };
  const onOffline = () => publish({ phase: "offline", pending: count() });
  window.addEventListener("notes-pending", onPending);
  window.addEventListener("online", onPending);
  window.addEventListener("offline", onOffline);
  const timer = setInterval(() => void syncNow(), 20_000);
  void syncNow();
  return () => {
    epoch++;
    clearInterval(timer);
    window.removeEventListener("notes-pending", onPending);
    window.removeEventListener("online", onPending);
    window.removeEventListener("offline", onOffline);
  };
}
