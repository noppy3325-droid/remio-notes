import test from "node:test";
import assert from "node:assert/strict";
import {
  acknowledge,
  applyEdit,
  emptySync,
  mergeCloud,
  preserveStaleEditor,
  validateCloudRows,
  type CloudRow,
} from "../src/sync-model";
import type { Card } from "../src/model";
const card = (id: string, content = "初期内容"): Card => ({
  id,
  content,
  tags: [],
  contexts: [],
  status: "active",
  pinned: false,
  reminderEnabled: false,
  createdAt: "2026-10-09",
  updatedAt: "2026-10-09",
});
const row = (c: Card | null, revision: number, id = c!.id): CloudRow => ({
  id,
  card: c,
  revision,
  mutation_id: "server",
});

test("local edits preserve unrelated concurrent cloud pulls", () => {
  const a = card("a");
  const b = card("b");
  const state = emptySync();
  const result = applyEdit(
    [a, b],
    [a],
    [{ ...a, content: "変更" }],
    state,
    () => "m1",
  );
  assert.equal(result.length, 2);
  assert.equal(result.find((c) => c.id === "b")?.content, b.content);
  assert.equal(state.pending.a.base, 0);
  assert.equal(state.pending.b, undefined);
});
test("deletes are queued durably and a stale pull cannot resurrect the card", () => {
  const a = card("a");
  const state = emptySync();
  state.revisions.a = 3;
  const result = applyEdit([a], [a], [], state, () => "delete1");
  assert.equal(state.pending.a.card, null);
  assert.equal(state.pending.a.base, 3);
  assert.deepEqual(mergeCloud(result, state, [row(a, 3)]), []);
  acknowledge(
    result,
    state,
    "a",
    state.pending.a,
    row(null, 4, "a"),
    true,
    () => "unused",
  );
  assert.deepEqual(mergeCloud(result, state, [row(a, 3)]), []);
});
test("cloud deletion reaches another offline device when it reconnects", () => {
  const state = emptySync();
  state.revisions.a = 1;
  assert.deepEqual(mergeCloud([card("a")], state, [row(null, 2, "a")]), []);
});
test("edits made during upload stay queued with the acknowledged revision", () => {
  const a = card("a");
  const state = emptySync();
  let cards = applyEdit([], [], [a], state, () => "first");
  const sent = structuredClone(state.pending.a);
  cards = applyEdit(
    cards,
    cards,
    [card("a", "アップロード中の編集")],
    state,
    () => "second",
  );
  acknowledge(cards, state, "a", sent, row(a, 1), true, () => "unused");
  assert.equal(state.pending.a.base, 1);
  assert.equal(state.pending.a.mutationId, "second");
  assert.equal(state.pending.a.card?.content, "アップロード中の編集");
});
test("concurrent edits keep both the remote winner and latest local content", () => {
  const original = card("a");
  const state = emptySync();
  state.revisions.a = 1;
  const local = card("a", "自分の最新編集");
  const cards = applyEdit([original], [original], [local], state, () => "mine");
  const sent = structuredClone(state.pending.a);
  const result = acknowledge(
    cards,
    state,
    "a",
    sent,
    row(card("a", "別端末の編集"), 2),
    false,
    () => "conflict-upload",
  );
  assert.equal(result.find((c) => c.id === "a")?.content, "別端末の編集");
  assert.equal(
    result.find((c) => c.id === "conflict-mine")?.content,
    local.content,
  );
  assert.equal(state.pending.a, undefined);
  assert.equal(state.pending["conflict-mine"].base, 0);
});
test("a local edit conflicting with remote deletion is preserved as a new card", () => {
  const a = card("a");
  const state = emptySync();
  state.revisions.a = 1;
  const cards = applyEdit(
    [a],
    [a],
    [card("a", "残す編集")],
    state,
    () => "mine",
  );
  const result = acknowledge(
    cards,
    state,
    "a",
    state.pending.a,
    row(null, 2, "a"),
    false,
    () => "copy",
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].content, "残す編集");
  assert.notEqual(result[0].id, "a");
});
test("samples never upload and editing a sample opts that card into sync", () => {
  const sample = { ...card("sample"), sample: true };
  const state = emptySync();
  applyEdit([], [], [sample], state, () => "unused");
  assert.deepEqual(state.pending, {});
  applyEdit(
    [sample],
    [sample],
    [{ ...sample, sample: false }],
    state,
    () => "edit",
  );
  assert.equal(state.pending.sample.mutationId, "edit");
});
test("guest mode has no outbox", () => {
  assert.equal(
    applyEdit([], [], [card("guest")], null, () => {
      throw Error("must not enqueue");
    }).length,
    1,
  );
});
test("saving an editor opened before a pull or deletion keeps the user's work separately", () => {
  const original = card("a");
  const edited = card("a", "入力途中の内容");
  assert.equal(
    preserveStaleEditor(original, original, edited, () => "copy").id,
    "a",
  );
  assert.equal(
    preserveStaleEditor(
      original,
      card("a", "他端末の変更"),
      edited,
      () => "copy",
    ).id,
    "copy",
  );
  assert.equal(
    preserveStaleEditor(original, undefined, edited, () => "copy").content,
    edited.content,
  );
});
test("invalid remote data fails before changing local state", () => {
  assert.equal(validateCloudRows([row(card("a"), 1)]).length, 1);
  assert.throws(() => validateCloudRows([row({ id: "a" } as Card, 1)]));
  assert.throws(() => validateCloudRows([row(card("a"), 1, "different")]));
  assert.throws(() =>
    validateCloudRows([row(card("a"), 1), row(card("a"), 2)]),
  );
  assert.throws(() => validateCloudRows([row(card("a"), -1)]));
});
