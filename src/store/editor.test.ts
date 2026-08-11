import { describe, expect, test } from 'bun:test';
import 'fake-indexeddb/auto';
import * as idbKeyVal from 'idb-keyval';
import { createStore } from 'jotai/vanilla';
import editor, { courseTitleIDBStore } from './editor';

describe('course editor state', () => {
  test('does not let a remembered title overwrite a directory selection', async () => {
    await idbKeyVal.set(
      'IPES 1202',
      'Engineering Shop - I',
      courseTitleIDBStore,
    );
    const store = createStore();

    store.set(editor.courseNo, 'IPES 1202');
    store.set(editor.courseTitle, 'Shop Practice-I');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(store.get(editor.courseTitle)).toBe('Shop Practice-I');
  });
});
