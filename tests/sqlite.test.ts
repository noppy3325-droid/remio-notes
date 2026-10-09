import { test } from "node:test";
import assert from "node:assert/strict";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
test("SQLite FTS5 finds Japanese partial text and database snapshots reopen unchanged", async () => {
  const sqlite = await sqlite3InitModule({
    print: () => {},
    printErr: () => {},
  });
  const db = new sqlite.oo1.DB(":memory:");
  db.exec(
    'CREATE TABLE cards(id TEXT PRIMARY KEY, content TEXT); CREATE VIRTUAL TABLE card_search USING fts5(content, tokenize="trigram");',
  );
  db.exec({
    sql: "INSERT INTO cards VALUES(?,?)",
    bind: ["one", "飛行機を逆光で撮影する時は露出を下げる"],
  });
  db.exec({
    sql: "INSERT INTO card_search VALUES(?)",
    bind: ["飛行機を逆光で撮影する時は露出を下げる"],
  });
  assert.equal(
    db.selectValue(
      "SELECT count(*) FROM card_search WHERE card_search MATCH ?",
      ['"逆光で撮影"'],
    ),
    1,
  );
  const snapshot = sqlite.capi.sqlite3_js_db_export(db);
  assert.ok(snapshot.length > 0);
  sqlite.capi.sqlite3_js_posix_create_file("/restored.sqlite", snapshot);
  const restored = new sqlite.oo1.DB("/restored.sqlite");
  assert.equal(
    restored.selectValue("SELECT content FROM cards WHERE id=?", ["one"]),
    "飛行機を逆光で撮影する時は露出を下げる",
  );
  assert.equal(
    restored.selectValue(
      "SELECT count(*) FROM card_search WHERE card_search MATCH ?",
      ['"逆光で撮影"'],
    ),
    1,
  );
  restored.close();
  db.close();
});
