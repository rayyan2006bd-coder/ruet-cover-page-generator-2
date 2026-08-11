import { describe, expect, test } from 'bun:test';
import {
  type CoverFormData,
  coverFormDataSchema,
} from '@shared/domain-contracts';
import {
  currentSnapshot,
  MAX_SNAPSHOTS,
  pushSnapshot,
  redoSnapshot,
  type SnapshotHistory,
  undoSnapshot,
} from './history';

function cover(title = ''): CoverFormData {
  return coverFormDataSchema.parse({
    schemaVersion: 1,
    student: {},
    course: {},
    title,
  });
}

const emptyHistory = (): SnapshotHistory => ({ snapshots: [], index: -1 });

describe('cover snapshot history', () => {
  test('keeps empty undo and redo operations stable', () => {
    const history = emptyHistory();
    expect(undoSnapshot(history)).toBe(history);
    expect(redoSnapshot(history)).toBe(history);
    expect(currentSnapshot(history)).toBeNull();
  });

  test('does not store adjacent duplicate snapshots', () => {
    const initial = pushSnapshot(emptyHistory(), cover('First'));
    expect(pushSnapshot(initial, cover('First'))).toBe(initial);
  });

  test('undoes, redoes, and removes the abandoned redo branch', () => {
    let history = pushSnapshot(emptyHistory(), cover('First'));
    history = pushSnapshot(history, cover('Second'));
    history = pushSnapshot(history, cover('Third'));

    history = undoSnapshot(history);
    expect(currentSnapshot(history)?.cover.title).toBe('Second');
    expect(currentSnapshot(redoSnapshot(history))?.cover.title).toBe('Third');

    history = pushSnapshot(history, cover('Replacement'));
    expect(history.snapshots.map((item) => item.cover.title)).toEqual([
      'First',
      'Second',
      'Replacement',
    ]);
    expect(currentSnapshot(redoSnapshot(history))?.cover.title).toBe(
      'Replacement',
    );
  });

  test('retains only the newest bounded set', () => {
    let history = emptyHistory();
    for (let index = 0; index < MAX_SNAPSHOTS + 5; index += 1) {
      history = pushSnapshot(history, cover(`Cover ${index}`));
    }
    expect(history.snapshots).toHaveLength(MAX_SNAPSHOTS);
    expect(history.snapshots[0]?.cover.title).toBe('Cover 5');
    expect(currentSnapshot(history)?.cover.title).toBe(
      `Cover ${MAX_SNAPSHOTS + 4}`,
    );
  });
});
