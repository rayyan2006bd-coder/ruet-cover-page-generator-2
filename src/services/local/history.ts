import {
  type CoverFormData,
  type CoverSnapshot,
  coverSnapshotSchema,
} from '@shared/domain-contracts';

export const MAX_SNAPSHOTS = 50;

export type SnapshotHistory = {
  snapshots: CoverSnapshot[];
  index: number;
};

export function createSnapshot(
  cover: CoverFormData,
  createdAt = new Date().toISOString(),
): CoverSnapshot {
  return coverSnapshotSchema.parse({
    id: crypto.randomUUID(),
    createdAt,
    cover,
  });
}

export function pushSnapshot(
  history: SnapshotHistory,
  cover: CoverFormData,
): SnapshotHistory {
  const current = history.snapshots[history.index]?.cover;
  if (current && JSON.stringify(current) === JSON.stringify(cover))
    return history;
  const snapshots = [
    ...history.snapshots.slice(0, history.index + 1),
    createSnapshot(cover),
  ].slice(-MAX_SNAPSHOTS);
  return { snapshots, index: snapshots.length - 1 };
}

export function undoSnapshot(history: SnapshotHistory): SnapshotHistory {
  if (history.snapshots.length === 0) return history;
  return { ...history, index: Math.max(0, history.index - 1) };
}

export function redoSnapshot(history: SnapshotHistory): SnapshotHistory {
  if (history.snapshots.length === 0) return history;
  return {
    ...history,
    index: Math.min(history.snapshots.length - 1, history.index + 1),
  };
}

export function currentSnapshot(history: SnapshotHistory) {
  return history.snapshots[history.index] ?? null;
}
