import type { StudentProfile } from '@shared/domain-contracts';
import { atom } from 'jotai';
import type { SnapshotHistory } from '@/services/local/history';

export type WorkspaceSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export const workspaceOpenAtom = atom(false);
export const workspaceTabAtom = atom('profiles');
export const activeDraftIdAtom = atom('');
export const snapshotHistoryAtom = atom<SnapshotHistory>({
  snapshots: [],
  index: -1,
});
export const workspaceSaveStatusAtom = atom<WorkspaceSaveStatus>('idle');
export const workspaceLastSavedAtAtom = atom<string | null>(null);
export const activeIdentityLocksAtom = atom<StudentProfile['lockedFields']>([]);
