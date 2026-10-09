import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { type Card, searchScore } from "./model";
import { seedCards } from "./seed";
import { accountId } from "./cloud";
import { applyEdit, emptySync, type SyncState } from "./sync-model";
let sqlite: Awaited<ReturnType<typeof sqlite3InitModule>>,
  db: InstanceType<Awaited<ReturnType<typeof sqlite3InitModule>>["oo1"]["DB"]>,
  vault: IDBDatabase;
export let storageMode = "SQLite · この端末に保存";
const snapshotKey = () =>
  accountId === "guest" ? "notes.sqlite" : `account:${accountId}:notes.sqlite`;
let syncState: SyncState | null = null;
let operations: Promise<unknown> = Promise.resolve();
export function exclusive<T>(operation: () => Promise<T>): Promise<T> {
  const next = operations.then(operation);
  operations = next.catch(() => {});
  return next;
}
export const flushStorage = () => operations;
function readSnapshot(key = snapshotKey()): Promise<Uint8Array | undefined> {
  return new Promise((resolve, reject) => {
    const tx = vault.transaction("files", "readonly");
    const r = tx.objectStore("files").get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function persist(): Promise<void> {
  const bytes = sqlite.capi.sqlite3_js_db_export(db);
  return new Promise((resolve, reject) => {
    const tx = vault.transaction("files", "readwrite");
    tx.objectStore("files").put(bytes, snapshotKey());
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? Error("保存が中断されました"));
  });
}
let initPromise: Promise<Card[]> | undefined;
export function initStorage() {
  return (initPromise ??= (async () => {
    if (navigator.locks) {
      await new Promise<void>((resolve, reject) => {
        navigator.locks
          .request(
            "knowledge-notes-writer",
            { ifAvailable: true },
            async (lock) => {
              if (!lock) {
                reject(
                  Error(
                    "このアプリは別のタブで開いています。そちらを閉じてから再読み込みしてください。",
                  ),
                );
                return;
              }
              resolve();
              await new Promise(() => {});
            },
          )
          .catch(reject);
      });
    }
    vault = await new Promise((resolve, reject) => {
      const r = indexedDB.open("knowledge-notes-v1", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("files");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    sqlite = await sqlite3InitModule({ print: () => {}, printErr: () => {} });
    const snapshot = await readSnapshot();
    if (snapshot)
      sqlite.capi.sqlite3_js_posix_create_file("/notes.sqlite", snapshot);
    db = new sqlite.oo1.DB("/notes.sqlite", "c");
    db.exec(
      'CREATE TABLE IF NOT EXISTS cards(id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE VIRTUAL TABLE IF NOT EXISTS card_search USING fts5(id UNINDEXED,title,content,tags,contexts, tokenize="trigram"); CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT);',
    );
    const initialized = db.selectValue(
      "SELECT value FROM meta WHERE key='initialized'",
    );
    if (!initialized) {
      write(accountId === "guest" ? seedCards() : []);
      db.exec("INSERT INTO meta VALUES('initialized','1')");
      await persist();
    }
    if (accountId !== "guest") {
      syncState =
        JSON.parse(
          (db.selectValue(
            "SELECT value FROM meta WHERE key='sync'",
          ) as string) || "null",
        ) ?? emptySync();
      storageMode = "SQLite · ローカル保存 + Google同期";
    }
    return readCards();
  })());
}
export function readCards(): Card[] {
  return db
    .selectObjects("SELECT data FROM cards")
    .map((row) => JSON.parse(row.data as string));
}
function write(cards: Card[]) {
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM cards; DELETE FROM card_search;");
    for (const c of cards) {
      db.exec({
        sql: "INSERT INTO cards VALUES(?,?)",
        bind: [c.id, JSON.stringify(c)],
      });
      db.exec({
        sql: "INSERT INTO card_search(id,title,content,tags,contexts) VALUES(?,?,?,?,?)",
        bind: [
          c.id,
          c.title ?? "",
          c.content,
          c.tags.join(" "),
          c.contexts.join(" "),
        ],
      });
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export const readSyncState = () => structuredClone(syncState);
async function store(cards: Card[], nextSync: SyncState | null) {
  const old = readCards();
  const oldSync = syncState;
  const writeSync = () =>
    db.exec({
      sql: "INSERT OR REPLACE INTO meta(key,value) VALUES('sync',?)",
      bind: [JSON.stringify(syncState)],
    });
  try {
    write(cards);
    syncState = nextSync;
    writeSync();
    await persist();
  } catch (e) {
    write(old);
    syncState = oldSync;
    writeSync();
    throw e;
  }
  window.dispatchEvent(new CustomEvent("notes-changed", { detail: cards }));
  return cards;
}
export function saveCards(cards: Card[], before = readCards()) {
  return exclusive(async () => {
    const nextSync = readSyncState();
    const next = applyEdit(readCards(), before, cards, nextSync, () =>
      crypto.randomUUID(),
    );
    const saved = await store(next, nextSync);
    window.dispatchEvent(new Event("notes-pending"));
    return saved;
  });
}
export function updateCloudState(
  reduce: (cards: Card[], sync: SyncState) => Card[],
) {
  return exclusive(async () => {
    const nextSync = readSyncState();
    if (!nextSync) throw Error("同期アカウントがありません");
    const cards = reduce(readCards(), nextSync);
    return store(cards, nextSync);
  });
}
let guestPromise: Promise<Card[]> | undefined;
export function readGuestCards() {
  return (guestPromise ??= (async () => {
    await initStorage();
    const bytes = await readSnapshot("notes.sqlite");
    if (!bytes) return [];
    sqlite.capi.sqlite3_js_posix_create_file("/guest-import.sqlite", bytes);
    const guestDb = new sqlite.oo1.DB("/guest-import.sqlite", "r");
    try {
      return guestDb
        .selectObjects("SELECT data FROM cards")
        .map((row) => JSON.parse(row.data as string) as Card)
        .filter((card) => !card.sample);
    } finally {
      guestDb.close();
    }
  })());
}
export function searchCards(cards: Card[], query: string): Card[] {
  const q = query.trim();
  if (!q) return cards;
  const hits = new Set<string>();
  if (q.length >= 3) {
    try {
      for (const r of db.selectObjects(
        "SELECT id FROM card_search WHERE card_search MATCH ?",
        ['"' + q.replaceAll('"', '""') + '"'],
      ))
        hits.add(r.id as string);
    } catch {
      /* Natural language queries still use deterministic ranking. */
    }
  }
  return cards
    .map((c) => ({ c, score: searchScore(c, q) + (hits.has(c.id) ? 10 : 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.c);
}
