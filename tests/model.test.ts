import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type Card,
  complete,
  archive,
  restore,
  matchesView,
  dateKey,
  dayOffset,
  suggest,
  searchScore,
  parseBackup,
} from "../src/model.ts";
const make = (props: Partial<Card> = {}): Card => ({
  id: "a",
  content: "USB-Cケーブルの映像出力を確認",
  tags: ["ガジェット"],
  contexts: ["PCを買うとき"],
  status: "active",
  reminderEnabled: true,
  remindAt: dayOffset(1) + "T20:00",
  pinned: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...props,
});
test("completion preserves knowledge, cancels reminder, stores timestamp and reopens without a stale notification", () => {
  const card = make({ dueAt: dateKey() });
  const done = complete(card);
  assert.equal(done.status, "done");
  assert.ok(done.completedAt);
  assert.equal(done.reminderEnabled, false);
  assert.equal(done.content, card.content);
  assert.equal(matchesView(done, "today"), false);
  assert.equal(matchesView(done, "knowledge"), true);
  const active = complete(done);
  assert.equal(active.status, "active");
  assert.equal(active.completedAt, undefined);
  assert.equal(active.reminderEnabled, false);
});
test("today includes overdue tasks and scheduled reminders; upcoming has future dates", () => {
  assert.ok(matchesView(make({ dueAt: dayOffset(-2) }), "today"));
  assert.ok(matchesView(make({ dueAt: dayOffset(3) }), "upcoming"));
  assert.ok(matchesView(make({ remindAt: dateKey() + "T20:00" }), "today"));
  assert.ok(!matchesView(make({ dueAt: dayOffset(3) }), "today"));
});
test("archiving a completed card preserves its state when restored", () => {
  const archived = archive(complete(make()));
  assert.equal(matchesView(archived, "all"), false);
  assert.equal(matchesView(archived, "archive"), true);
  assert.equal(restore(archived).status, "done");
  assert.equal(archived.reminderEnabled, false);
});
test("local rules propose attributes without applying them and reject impossible times", () => {
  const s = suggest("明日20時にXserverの更新を確認する");
  assert.equal(s.dueAt, dayOffset(1));
  assert.equal(s.remindAt, dayOffset(1) + "T20:00");
  assert.ok(s.tags.includes("開発"));
  assert.equal(suggest("明日29時に確認").remindAt, undefined);
});
test("Japanese context and natural task conditions produce relevant results", () => {
  assert.ok(searchScore(make(), "PCを買うとき") > 0);
  assert.ok(searchScore(make(), "ガジェット") > 0);
  assert.equal(searchScore(make({ dueAt: dayOffset(20) }), "今週やること"), 0);
  assert.equal(searchScore(make({ status: "done" }), "未完了"), 0);
  assert.equal(searchScore(make(), "存在しない検索文字列"), 0);
});
test("backup validates atomically, rejects duplicate IDs and bad dates and disables reminders on done cards", () => {
  assert.equal(parseBackup(JSON.stringify({ cards: [make()] })).length, 1);
  assert.throws(() => parseBackup(JSON.stringify([make(), make()])));
  assert.throws(() => parseBackup(JSON.stringify([make({ dueAt: "broken" })])));
  assert.throws(() =>
    parseBackup(JSON.stringify([make({ tags: [12 as unknown as string] })])),
  );
  assert.equal(
    parseBackup(JSON.stringify([make({ status: "done" })]))[0].reminderEnabled,
    false,
  );
});
