import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Postgres migration enforces ownership, CAS, idempotency and tombstones", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
      insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
    `);
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202610090001_cards.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const login = async (id: string) => {
      await db.exec("reset role; set role authenticated;");
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
        id,
      ]);
    };
    const apply = async (
      base: number,
      content: string | null,
      mutation: string,
    ) => {
      const result = await db.query<{
        result: { applied: boolean; row: { revision: number; card: unknown } };
      }>("select public.apply_note_card($1,$2,$3::jsonb,$4) as result", [
        "a",
        base,
        content === null ? null : JSON.stringify({ id: "a", content }),
        mutation,
      ]);
      return result.rows[0].result;
    };
    await login("11111111-1111-4111-8111-111111111111");
    const first = await apply(0, "user A", "m1");
    assert.equal(first.applied, true);
    assert.equal(first.row.revision, 1);
    const replay = await apply(0, "user A", "m1");
    assert.equal(replay.applied, true);
    assert.equal(replay.row.revision, 1);
    const conflict = await apply(0, "stale", "m2");
    assert.equal(conflict.applied, false);
    assert.equal(conflict.row.revision, 1);
    const updated = await apply(1, "new", "m3");
    assert.equal(updated.row.revision, 2);
    await assert.rejects(
      db.query("update public.note_cards set card=null"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("delete from public.note_cards"),
      /permission denied/,
    );
    await assert.rejects(
      db.query(
        "select public.apply_note_card('a',2,'{\"id\":\"another\"}'::jsonb,'invalid')",
      ),
      /Invalid card/,
    );
    await login("22222222-2222-4222-8222-222222222222");
    assert.equal(
      (await db.query("select * from public.note_cards")).rows.length,
      0,
    );
    const empty = await db.query<{ snapshot: unknown[] }>(
      "select public.list_note_cards() as snapshot",
    );
    assert.deepEqual(empty.rows[0].snapshot, []);
    await apply(0, "user B", "b1");
    assert.equal(
      (await db.query("select * from public.note_cards")).rows.length,
      1,
    );
    await login("11111111-1111-4111-8111-111111111111");
    const deleted = await apply(2, null, "delete");
    assert.equal(deleted.row.revision, 3);
    assert.equal(deleted.row.card, null);
    const stale = await apply(2, "resurrection", "stale");
    assert.equal(stale.applied, false);
    assert.equal(stale.row.card, null);
    const snapshot = await db.query<{ snapshot: { card: unknown }[] }>(
      "select public.list_note_cards() as snapshot",
    );
    assert.equal(snapshot.rows[0].snapshot.length, 1);
    assert.equal(snapshot.rows[0].snapshot[0].card, null);
    await db.exec("reset role; set role anon;");
    await assert.rejects(
      db.query("select public.list_note_cards()"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select public.apply_note_card('a',0,null,'anon')"),
      /permission denied/,
    );
    await login("");
    await assert.rejects(
      apply(0, "no session", "noauth"),
      /Authentication required/,
    );
  } finally {
    await db.close();
  }
});
