import { parseBackup, type Card } from "./model";

export type CloudRow = {
  id: string;
  revision: number;
  card: Card | null;
  mutation_id: string;
};
export type Mutation = { base: number; card: Card | null; mutationId: string };
export type SyncState = {
  revisions: Record<string, number>;
  pending: Record<string, Mutation>;
};
export const emptySync = (): SyncState => ({ revisions: {}, pending: {} });
const same = (a: Card | undefined, b: Card | undefined) =>
  JSON.stringify(a) === JSON.stringify(b);
export function validateCloudRows(value: unknown): CloudRow[] {
  if (!Array.isArray(value)) throw Error("Invalid cloud snapshot");
  const ids = new Set<string>();
  for (const row of value) {
    if (
      !row ||
      typeof row.id !== "string" ||
      !row.id ||
      ids.has(row.id) ||
      !Number.isSafeInteger(row.revision) ||
      row.revision < 1 ||
      typeof row.mutation_id !== "string" ||
      !("card" in row)
    )
      throw Error("Invalid cloud row");
    ids.add(row.id);
    if (row.card !== null) {
      if (row.card?.id !== row.id) throw Error("Invalid card identity");
      parseBackup(JSON.stringify([row.card]));
    }
  }
  return value;
}

export function preserveStaleEditor(
  original: Card,
  latest: Card | undefined,
  edited: Card,
  uuid: () => string,
) {
  if (same(original, latest)) return edited;
  return {
    ...edited,
    id: uuid(),
    title: `${edited.title || "無題"}（競合した編集）`,
    sample: false,
  };
}

// Apply only the user's changes to the latest snapshot, preserving concurrent pulls.
export function applyEdit(
  current: Card[],
  before: Card[],
  next: Card[],
  sync: SyncState | null,
  uuid: () => string,
) {
  const result = new Map(current.map((c) => [c.id, c]));
  const old = new Map(before.map((c) => [c.id, c]));
  const edited = new Map(next.map((c) => [c.id, c]));
  for (const id of new Set([...old.keys(), ...edited.keys()])) {
    const card = edited.get(id);
    if (same(old.get(id), card)) continue;
    if (card) result.set(id, card);
    else result.delete(id);
    if (sync && !card?.sample && !old.get(id)?.sample) {
      sync.pending[id] = {
        base: sync.pending[id]?.base ?? sync.revisions[id] ?? 0,
        card: card ?? null,
        mutationId: uuid(),
      };
    } else if (sync && card && !card.sample) {
      sync.pending[id] = { base: 0, card, mutationId: uuid() };
    }
  }
  return [...result.values()];
}

export function acknowledge(
  cards: Card[],
  sync: SyncState,
  id: string,
  sent: Mutation,
  row: CloudRow,
  applied: boolean,
  uuid: () => string,
): Card[] {
  const map = new Map(cards.map((c) => [c.id, c]));
  const pending = sync.pending[id];
  sync.revisions[id] = row.revision;
  if (!pending) return cards;
  if (applied) {
    if (pending.mutationId === sent.mutationId) delete sync.pending[id];
    else pending.base = row.revision;
    return cards;
  }
  // Keep the latest local content as a separate card when another device won.
  if (pending.card) {
    const copy = {
      ...pending.card,
      id: `conflict-${pending.mutationId}`,
      title: `${pending.card.title || "無題"}（競合した編集）`,
      sample: false,
    };
    map.set(copy.id, copy);
    sync.pending[copy.id] = { base: 0, card: copy, mutationId: uuid() };
  }
  delete sync.pending[id];
  if (row.card) map.set(id, row.card);
  else map.delete(id);
  return [...map.values()];
}

export function mergeCloud(cards: Card[], sync: SyncState, rows: CloudRow[]) {
  const result = new Map(cards.map((c) => [c.id, c]));
  for (const row of rows) {
    if (sync.pending[row.id] || row.revision <= (sync.revisions[row.id] ?? 0))
      continue;
    sync.revisions[row.id] = row.revision;
    if (row.card) result.set(row.id, row.card);
    else result.delete(row.id);
  }
  return [...result.values()];
}
