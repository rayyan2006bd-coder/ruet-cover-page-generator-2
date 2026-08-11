import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useRef } from 'react';
import {
  applyCoverFormData,
  coverFormDataAtom,
  isCoverPopulated,
} from '@/services/local/cover-state';
import {
  getLatestDraft,
  listProfiles,
  migrateLocalDatabase,
  saveDraft,
} from '@/services/local/database';
import { pushSnapshot } from '@/services/local/history';
import { setWorkspaceFlusher } from '@/services/local/workspace-flush';
import { defaultStore } from '@/store';
import editor from '@/store/editor';
import {
  activeDraftIdAtom,
  activeIdentityLocksAtom,
  snapshotHistoryAtom,
  workspaceLastSavedAtAtom,
  workspaceSaveStatusAtom,
} from '@/store/workspace';

const AUTOSAVE_DELAY_MS = 750;

function draftName(cover: ReturnType<typeof coverFormDataAtom.read>) {
  const subject = cover.course.code || cover.course.title || cover.coverType;
  const number = cover.itemNumber ? ` ${cover.itemNumber}` : '';
  return `${subject}${number}`.trim().slice(0, 160) || 'Untitled cover';
}

export function WorkspaceController() {
  const cover = useAtomValue(coverFormDataAtom);
  const [activeDraftId, setActiveDraftId] = useAtom(activeDraftIdAtom);
  const setHistory = useSetAtom(snapshotHistoryAtom);
  const setSaveStatus = useSetAtom(workspaceSaveStatusAtom);
  const setLastSavedAt = useSetAtom(workspaceLastSavedAtAtom);
  const setIdentityLocks = useSetAtom(activeIdentityLocksAtom);
  const readyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coverRef = useRef(cover);
  const activeDraftIdRef = useRef(activeDraftId);
  const persistRef = useRef<() => Promise<void>>(async () => {});

  coverRef.current = cover;
  activeDraftIdRef.current = activeDraftId;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await migrateLocalDatabase();
      const [latest, profiles] = await Promise.all([
        getLatestDraft(),
        listProfiles(),
      ]);
      if (cancelled) return;
      const nextId = latest?.id ?? crypto.randomUUID();
      setActiveDraftId(nextId);
      const selectedProfile = profiles.find(
        (profile) => profile.id === defaultStore.get(editor.activeProfileId),
      );
      setIdentityLocks(selectedProfile?.lockedFields ?? []);
      if (latest) {
        setLastSavedAt(latest.updatedAt);
        setSaveStatus('saved');
        const history = {
          snapshots: latest.snapshots,
          index: Math.min(
            latest.snapshotIndex,
            Math.max(0, latest.snapshots.length - 1),
          ),
        };
        setHistory(history);
        if (!isCoverPopulated(coverRef.current)) {
          applyCoverFormData(latest.cover);
        }
      } else if (!isCoverPopulated(coverRef.current)) {
        const defaultProfile = profiles.find((profile) => profile.isDefault);
        if (defaultProfile) {
          applyCoverFormData({
            ...coverRef.current,
            student: defaultProfile.identity,
          });
          defaultStore.set(editor.activeProfileId, defaultProfile.id);
          setIdentityLocks(defaultProfile.lockedFields);
        }
      }
      readyRef.current = true;
    })().catch(() => setSaveStatus('error'));
    return () => {
      cancelled = true;
    };
  }, [
    setActiveDraftId,
    setHistory,
    setIdentityLocks,
    setLastSavedAt,
    setSaveStatus,
  ]);

  useEffect(() => {
    const persist = async () => {
      const currentCover = coverRef.current;
      const currentDraftId = activeDraftIdRef.current;
      if (!currentDraftId || !isCoverPopulated(currentCover)) return;
      const history = defaultStore.get(snapshotHistoryAtom);
      const timestamp = new Date().toISOString();
      await saveDraft({
        schemaVersion: 1,
        id: currentDraftId,
        name: draftName(currentCover),
        cover: currentCover,
        snapshots: history.snapshots,
        snapshotIndex: Math.max(0, history.index),
        createdAt: history.snapshots[0]?.createdAt ?? timestamp,
        updatedAt: timestamp,
      });
      setLastSavedAt(timestamp);
      setSaveStatus('saved');
    };
    persistRef.current = persist;
    const removeFlusher = setWorkspaceFlusher(persist);
    const preserve = () =>
      void persistRef.current().catch(() => setSaveStatus('error'));
    const preserveWhenHidden = () => {
      if (document.visibilityState === 'hidden') preserve();
    };
    window.addEventListener('pagehide', preserve);
    document.addEventListener('visibilitychange', preserveWhenHidden);
    return () => {
      window.removeEventListener('pagehide', preserve);
      document.removeEventListener('visibilitychange', preserveWhenHidden);
      removeFlusher();
    };
  }, [setLastSavedAt, setSaveStatus]);

  useEffect(() => {
    if (!readyRef.current || !activeDraftId || !isCoverPopulated(cover)) return;
    const history = pushSnapshot(defaultStore.get(snapshotHistoryAtom), cover);
    setHistory(history);
    setSaveStatus('saving');

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void persistRef.current().catch(() => setSaveStatus('error'));
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeDraftId, cover, setHistory, setSaveStatus]);

  return null;
}
