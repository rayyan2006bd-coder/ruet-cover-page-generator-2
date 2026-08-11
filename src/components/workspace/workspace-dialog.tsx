import type {
  BatchCoverRow,
  CoursePreset,
  CoverHistoryRecord,
  Draft,
  SmartImportResult,
  StudentProfile,
} from '@shared/domain-contracts';
import { coverFormDataSchema } from '@shared/domain-contracts';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  CopyIcon,
  DownloadIcon,
  Redo2Icon,
  SaveIcon,
  Trash2Icon,
  Undo2Icon,
  UploadIcon,
  UserRoundIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { importCoverFile } from '@/services/import/cover-import';
import {
  applyCoverFormData,
  applyPresetToCover,
  applyProfileToCover,
  captureCoverFormData,
  isCoverPopulated,
} from '@/services/local/cover-state';
import {
  clearAllLocalWorkspaceData,
  clearDraftsAndHistory,
  deleteCoverHistoryRecord,
  deleteDraft,
  deletePreset,
  deleteProfile,
  exportLocalBackup,
  importLocalBackup,
  listCoverHistory,
  listDrafts,
  listPresets,
  listProfiles,
  saveCoverHistoryRecord,
  saveCoverHistoryRecords,
  saveDraft,
  savePreset,
  saveProfile,
} from '@/services/local/database';
import {
  currentSnapshot,
  redoSnapshot,
  undoSnapshot,
} from '@/services/local/history';
import { generateBatchZip, generateMergedBatchPdf } from '@/services/pdf/batch';
import type { PdfExportMode } from '@/services/pdf/generate';
import { defaultStore } from '@/store';
import editor from '@/store/editor';
import {
  activeDraftIdAtom,
  activeIdentityLocksAtom,
  snapshotHistoryAtom,
  workspaceLastSavedAtAtom,
  workspaceOpenAtom,
  workspaceSaveStatusAtom,
  workspaceTabAtom,
} from '@/store/workspace';

type WorkspaceCollections = {
  profiles: StudentProfile[];
  presets: CoursePreset[];
  drafts: Draft[];
  history: CoverHistoryRecord[];
};

const emptyCollections: WorkspaceCollections = {
  profiles: [],
  presets: [],
  drafts: [],
  history: [],
};

function downloadJson(filename: string, value: unknown) {
  downloadBlob(
    filename,
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function CollectionCard({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        <p className="truncate text-muted-foreground text-xs">{detail}</p>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </li>
  );
}

export function WorkspaceDialog() {
  const [open, setOpen] = useAtom(workspaceOpenAtom);
  const [history, setHistory] = useAtom(snapshotHistoryAtom);
  const setActiveDraftId = useSetAtom(activeDraftIdAtom);
  const setIdentityLocks = useSetAtom(activeIdentityLocksAtom);
  const saveStatus = useAtomValue(workspaceSaveStatusAtom);
  const lastSavedAt = useAtomValue(workspaceLastSavedAtAtom);
  const [collections, setCollections] =
    useState<WorkspaceCollections>(emptyCollections);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [makeDefault, setMakeDefault] = useState(true);
  const [useCourseDepartment, setUseCourseDepartment] = useState(false);
  const [lockedFields, setLockedFields] = useState<
    StudentProfile['lockedFields']
  >([]);
  const [importStrategy, setImportStrategy] = useState<'merge' | 'replace'>(
    'merge',
  );
  const [importResult, setImportResult] = useState<SmartImportResult | null>(
    null,
  );
  const [replacementProfileId, setReplacementProfileId] = useState('');
  const [batchRows, setBatchRows] = useState<BatchCoverRow[]>([]);
  const backupFileRef = useRef<HTMLInputElement>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [profiles, presets, drafts, coverHistory] = await Promise.all([
      listProfiles(),
      listPresets(),
      listDrafts(),
      listCoverHistory(),
    ]);
    setCollections({ profiles, presets, drafts, history: coverHistory });
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh().catch(() =>
      setMessage('Could not read local workspace data.'),
    );
  }, [open, refresh]);

  const run = async (operation: () => Promise<void>, success: string) => {
    setBusy(true);
    setMessage('');
    try {
      await operation();
      await refresh();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Operation failed.');
    } finally {
      setBusy(false);
    }
  };

  const now = () => new Date().toISOString();
  const current = () => captureCoverFormData(defaultStore);
  const confirmReplace = (description: string) =>
    !isCoverPopulated(current()) ||
    window.confirm(
      `${description} This will replace populated cover fields. Continue?`,
    );

  const applyUndoRedo = (direction: 'undo' | 'redo') => {
    const next =
      direction === 'undo' ? undoSnapshot(history) : redoSnapshot(history);
    const snapshot = currentSnapshot(next);
    if (!snapshot || next.index === history.index) return;
    setHistory(next);
    applyCoverFormData(snapshot.cover, defaultStore);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Open workspace">
          <UserRoundIcon />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <div className="mr-auto">
              <DialogTitle>Local workspace</DialogTitle>
              <DialogDescription>
                Profiles, presets, and drafts stay on this device unless you
                export them.
              </DialogDescription>
            </div>
            <Button
              variant="outline"
              size="icon"
              aria-label="Undo cover change"
              disabled={history.index <= 0}
              onClick={() => applyUndoRedo('undo')}
            >
              <Undo2Icon />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Redo cover change"
              disabled={history.index >= history.snapshots.length - 1}
              onClick={() => applyUndoRedo('redo')}
            >
              <Redo2Icon />
            </Button>
            <span
              className="min-w-14 text-right text-muted-foreground text-xs"
              role="status"
            >
              {saveStatus === 'saving'
                ? 'Saving...'
                : saveStatus === 'saved' && lastSavedAt
                  ? `Saved ${new Date(lastSavedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}`
                  : saveStatus === 'error'
                    ? 'Save error'
                    : ''}
            </span>
          </div>
        </DialogHeader>

        <Tabs atom={workspaceTabAtom} className="min-h-0 flex-1 gap-0">
          <TabsList className="mx-6 mt-4 grid h-auto w-auto grid-cols-4 sm:grid-cols-7">
            <TabsTrigger value="profiles">Profiles</TabsTrigger>
            <TabsTrigger value="presets">Presets</TabsTrigger>
            <TabsTrigger value="drafts">Drafts</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="batch">Batch</TabsTrigger>
            <TabsTrigger value="import">Import</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
          </TabsList>
          <div className="max-h-[65vh] overflow-y-auto p-6">
            <TabsContent value="profiles" className="space-y-4">
              <CreateRow
                value={name}
                onChange={setName}
                placeholder="Profile name"
                buttonLabel="Save current student"
                disabled={busy}
                onCreate={() =>
                  run(async () => {
                    const cover = current();
                    const timestamp = now();
                    await saveProfile({
                      schemaVersion: 1,
                      id: crypto.randomUUID(),
                      label:
                        name.trim() || cover.student.name || 'Student profile',
                      identity: cover.student,
                      lockedFields,
                      isDefault:
                        makeDefault || collections.profiles.length === 0,
                      createdAt: timestamp,
                      updatedAt: timestamp,
                    });
                    setName('');
                  }, 'Profile saved on this device.')
                }
              />
              <div className="space-y-2 rounded-lg border p-3 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={makeDefault}
                    onChange={(event) => setMakeDefault(event.target.checked)}
                  />
                  Remember my information as the default profile
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={useCourseDepartment}
                    onChange={(event) =>
                      setUseCourseDepartment(event.target.checked)
                    }
                  />
                  Use the selected course department when applying a profile
                </label>
                <fieldset>
                  <legend className="mb-1 font-medium">
                    Lock identity fields against replacement
                  </legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {(
                      [
                        'name',
                        'roll',
                        'session',
                        'series',
                        'department',
                      ] as const
                    ).map((field) => (
                      <label
                        key={field}
                        className="flex items-center gap-1.5 capitalize"
                      >
                        <input
                          type="checkbox"
                          checked={lockedFields.includes(field)}
                          onChange={(event) =>
                            setLockedFields((currentFields) =>
                              event.target.checked
                                ? [...currentFields, field]
                                : currentFields.filter(
                                    (item) => item !== field,
                                  ),
                            )
                          }
                        />
                        {field}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
              <ul className="space-y-2">
                {collections.profiles.map((profile) => (
                  <CollectionCard
                    key={profile.id}
                    title={`${profile.label}${profile.isDefault ? ' · default' : ''}`}
                    detail={`${profile.identity.name || 'No name'} · ${profile.identity.roll || 'No roll'} · ${profile.identity.department || 'No department'}`}
                  >
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!confirmReplace('Apply this student profile?'))
                          return;
                        applyCoverFormData(
                          applyProfileToCover(current(), profile, {
                            useCourseDepartment,
                          }),
                          defaultStore,
                        );
                        defaultStore.set(editor.activeProfileId, profile.id);
                        setIdentityLocks(profile.lockedFields);
                        setMessage('Profile applied.');
                      }}
                    >
                      Apply
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        run(async () => {
                          const timestamp = now();
                          await saveProfile({
                            ...profile,
                            identity: current().student,
                            updatedAt: timestamp,
                          });
                        }, 'Profile updated from the current student fields.')
                      }
                    >
                      Update
                    </Button>
                    {!profile.isDefault && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          run(
                            async () =>
                              void (await saveProfile({
                                ...profile,
                                isDefault: true,
                                updatedAt: now(),
                              })),
                            'Default profile updated.',
                          )
                        }
                      >
                        Make default
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Duplicate ${profile.label}`}
                      onClick={() =>
                        run(async () => {
                          const timestamp = now();
                          await saveProfile({
                            ...profile,
                            id: crypto.randomUUID(),
                            label: `${profile.label} copy`,
                            isDefault: false,
                            createdAt: timestamp,
                            updatedAt: timestamp,
                          });
                        }, 'Profile duplicated.')
                      }
                    >
                      <CopyIcon />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${profile.label}`}
                      onClick={() =>
                        run(async () => {
                          if (
                            defaultStore.get(editor.activeProfileId) ===
                            profile.id
                          ) {
                            defaultStore.set(editor.activeProfileId, '');
                            setIdentityLocks([]);
                          }
                          await deleteProfile(profile.id);
                        }, 'Profile deleted.')
                      }
                    >
                      <Trash2Icon />
                    </Button>
                  </CollectionCard>
                ))}
              </ul>
            </TabsContent>

            <TabsContent value="presets" className="space-y-4">
              <CreateRow
                value={name}
                onChange={setName}
                placeholder="Preset name"
                buttonLabel="Save current course"
                disabled={busy}
                onCreate={() =>
                  run(async () => {
                    const cover = current();
                    const timestamp = now();
                    await savePreset({
                      schemaVersion: 1,
                      id: crypto.randomUUID(),
                      name:
                        name.trim() ||
                        cover.course.code ||
                        cover.course.title ||
                        'Course preset',
                      course: cover.course,
                      teachers: cover.teachers,
                      coverType: cover.coverType,
                      template: cover.template,
                      settings: cover.settings,
                      filename: cover.filename,
                      createdAt: timestamp,
                      updatedAt: timestamp,
                    });
                    setName('');
                  }, 'Course preset saved.')
                }
              />
              <ul className="space-y-2">
                {collections.presets.map((preset) => (
                  <CollectionCard
                    key={preset.id}
                    title={preset.name}
                    detail={`${preset.course.code || 'No code'} · ${preset.course.title || 'No title'}`}
                  >
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!confirmReplace('Apply this course preset?'))
                          return;
                        applyCoverFormData(
                          applyPresetToCover(current(), preset),
                          defaultStore,
                        );
                        setMessage('Preset applied.');
                      }}
                    >
                      Apply
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${preset.name}`}
                      onClick={() =>
                        run(
                          async () => void (await deletePreset(preset.id)),
                          'Preset deleted.',
                        )
                      }
                    >
                      <Trash2Icon />
                    </Button>
                  </CollectionCard>
                ))}
              </ul>
            </TabsContent>

            <TabsContent value="drafts" className="space-y-4">
              <CreateRow
                value={name}
                onChange={setName}
                placeholder="Draft name"
                buttonLabel="Save a copy"
                disabled={busy}
                onCreate={() =>
                  run(async () => {
                    const timestamp = now();
                    const draft: Draft = {
                      schemaVersion: 1,
                      id: crypto.randomUUID(),
                      name: name.trim() || 'Cover draft',
                      cover: current(),
                      snapshots: history.snapshots,
                      snapshotIndex: Math.max(0, history.index),
                      createdAt: timestamp,
                      updatedAt: timestamp,
                    };
                    await saveDraft(draft);
                    setActiveDraftId(draft.id);
                    setName('');
                  }, 'Draft copy saved and activated.')
                }
              />
              <ul className="space-y-2">
                {collections.drafts.map((draft) => (
                  <CollectionCard
                    key={draft.id}
                    title={draft.name}
                    detail={`Updated ${new Date(draft.updatedAt).toLocaleString()}`}
                  >
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!confirmReplace('Load this saved draft?')) return;
                        applyCoverFormData(draft.cover, defaultStore);
                        setActiveDraftId(draft.id);
                        const nextHistory = {
                          snapshots: draft.snapshots,
                          index: Math.min(
                            draft.snapshotIndex,
                            Math.max(0, draft.snapshots.length - 1),
                          ),
                        };
                        setHistory(nextHistory);
                        setMessage('Draft loaded.');
                      }}
                    >
                      Load
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Duplicate ${draft.name}`}
                      onClick={() =>
                        run(async () => {
                          const timestamp = now();
                          await saveDraft({
                            ...draft,
                            id: crypto.randomUUID(),
                            name: `${draft.name} copy`,
                            createdAt: timestamp,
                            updatedAt: timestamp,
                          });
                        }, 'Draft duplicated.')
                      }
                    >
                      <CopyIcon />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${draft.name}`}
                      onClick={() =>
                        run(
                          async () => void (await deleteDraft(draft.id)),
                          'Draft deleted.',
                        )
                      }
                    >
                      <Trash2Icon />
                    </Button>
                  </CollectionCard>
                ))}
              </ul>
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              <p className="text-muted-foreground text-sm">
                Generated-cover records appear here after a successful download.
              </p>
              <ul className="space-y-2">
                {collections.history.map((record) => (
                  <CollectionCard
                    key={record.id}
                    title={record.name}
                    detail={`Generated ${new Date(record.generatedAt).toLocaleString()}`}
                  >
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!confirmReplace('Load this generated cover?'))
                          return;
                        applyCoverFormData(record.cover, defaultStore);
                        setMessage('History entry loaded.');
                      }}
                    >
                      Open
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        run(async () => {
                          const timestamp = now();
                          const draft: Draft = {
                            schemaVersion: 1,
                            id: crypto.randomUUID(),
                            name: `${record.name} copy`,
                            cover: record.cover,
                            snapshots: [],
                            snapshotIndex: 0,
                            createdAt: timestamp,
                            updatedAt: timestamp,
                          };
                          await saveDraft(draft);
                          applyCoverFormData(record.cover, defaultStore);
                          defaultStore.set(editor.editorTab, 'subject');
                          setActiveDraftId(draft.id);
                          setOpen(false);
                        }, 'Previous cover duplicated as a new draft.')
                      }
                    >
                      <CopyIcon /> Duplicate
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const renamed = window.prompt(
                          'Rename generated-cover record',
                          record.name,
                        );
                        if (!renamed?.trim()) return;
                        void run(
                          async () =>
                            void (await saveCoverHistoryRecord({
                              ...record,
                              name: renamed.trim(),
                            })),
                          'History record renamed.',
                        );
                      }}
                    >
                      Rename
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${record.name}`}
                      onClick={() =>
                        run(
                          async () =>
                            void (await deleteCoverHistoryRecord(record.id)),
                          'History record deleted.',
                        )
                      }
                    >
                      <Trash2Icon />
                    </Button>
                  </CollectionCard>
                ))}
              </ul>
            </TabsContent>

            <TabsContent value="batch" className="space-y-4">
              <div>
                <h3 className="font-semibold">Batch cover generation</h3>
                <p className="text-muted-foreground text-sm">
                  Every row uses the current student, course, teachers,
                  template, and settings. PDFs are generated sequentially on
                  this device.
                </p>
              </div>
              <div className="space-y-3">
                {batchRows.map((row, index) => (
                  <div
                    key={row.id}
                    className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[6rem_1fr_9rem_9rem_auto]"
                  >
                    <Input
                      aria-label={`Batch row ${index + 1} item number`}
                      placeholder="No."
                      value={row.itemNumber}
                      onChange={(event) =>
                        setBatchRows((rows) =>
                          rows.map((item) =>
                            item.id === row.id
                              ? { ...item, itemNumber: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <Input
                      aria-label={`Batch row ${index + 1} title`}
                      placeholder="Experiment or assignment title"
                      value={row.title}
                      onChange={(event) =>
                        setBatchRows((rows) =>
                          rows.map((item) =>
                            item.id === row.id
                              ? { ...item, title: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <Input
                      aria-label={`Batch row ${index + 1} experiment date`}
                      type="date"
                      value={row.experimentDate?.slice(0, 10) ?? ''}
                      onChange={(event) =>
                        setBatchRows((rows) =>
                          rows.map((item) =>
                            item.id === row.id
                              ? {
                                  ...item,
                                  experimentDate: event.target.value
                                    ? new Date(
                                        `${event.target.value}T00:00:00`,
                                      ).toISOString()
                                    : null,
                                }
                              : item,
                          ),
                        )
                      }
                    />
                    <Input
                      aria-label={`Batch row ${index + 1} submission date`}
                      type="date"
                      value={row.submissionDate?.slice(0, 10) ?? ''}
                      onChange={(event) =>
                        setBatchRows((rows) =>
                          rows.map((item) =>
                            item.id === row.id
                              ? {
                                  ...item,
                                  submissionDate: event.target.value
                                    ? new Date(
                                        `${event.target.value}T00:00:00`,
                                      ).toISOString()
                                    : null,
                                }
                              : item,
                          ),
                        )
                      }
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove batch row ${index + 1}`}
                      onClick={() =>
                        setBatchRows((rows) =>
                          rows.filter((item) => item.id !== row.id),
                        )
                      }
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    const cover = current();
                    setBatchRows((rows) => [
                      ...rows,
                      {
                        id: crypto.randomUUID(),
                        itemNumber: String(rows.length + 1),
                        title: '',
                        experimentDate: cover.experimentDate,
                        submissionDate: cover.submissionDate,
                      },
                    ]);
                  }}
                >
                  Add row
                </Button>
                <Button
                  disabled={busy || batchRows.length === 0}
                  onClick={() =>
                    run(async () => {
                      const base = current();
                      const result = await generateMergedBatchPdf({
                        base,
                        rows: batchRows,
                        mode: defaultStore.get(
                          editor.pdfExportMode,
                        ) as PdfExportMode,
                        onProgress: (progress) =>
                          setMessage(
                            `Generating ${progress.completed}/${progress.total}: ${progress.filename}`,
                          ),
                      });
                      downloadBlob(
                        `${base.course.code || 'RUET'}-covers.pdf`,
                        result.blob,
                      );
                      await saveCoverHistoryRecords(
                        result.files.map((file) => ({
                          schemaVersion: 1,
                          id: crypto.randomUUID(),
                          name: file.filename.replace(/\.pdf$/i, ''),
                          cover: file.cover,
                          profileId:
                            defaultStore.get(editor.activeProfileId) || null,
                          generatedAt: new Date().toISOString(),
                        })),
                      );
                    }, 'Merged batch PDF generated.')
                  }
                >
                  Generate merged PDF
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || batchRows.length === 0}
                  onClick={() =>
                    run(async () => {
                      const base = current();
                      const result = await generateBatchZip({
                        base,
                        rows: batchRows,
                        mode: defaultStore.get(
                          editor.pdfExportMode,
                        ) as PdfExportMode,
                        onProgress: (progress) =>
                          setMessage(
                            `Generating ${progress.completed}/${progress.total}: ${progress.filename}`,
                          ),
                      });
                      downloadBlob(
                        `${base.course.code || 'RUET'}-covers.zip`,
                        result.blob,
                      );
                      await saveCoverHistoryRecords(
                        result.files.map((file) => ({
                          schemaVersion: 1,
                          id: crypto.randomUUID(),
                          name: file.filename.replace(/\.pdf$/i, ''),
                          cover: file.cover,
                          profileId:
                            defaultStore.get(editor.activeProfileId) || null,
                          generatedAt: new Date().toISOString(),
                        })),
                      );
                    }, 'Individual PDF ZIP generated.')
                  }
                >
                  Generate ZIP
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="import" className="space-y-4">
              <div className="rounded-lg border p-4">
                <h3 className="font-semibold">Import existing cover</h3>
                <p className="mb-3 text-muted-foreground text-sm">
                  Processing stays inside this browser. App-generated PDFs use
                  exact embedded data; other PDFs use selectable text.
                </p>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => coverFileRef.current?.click()}
                >
                  <UploadIcon /> Choose PDF or image
                </Button>
                <input
                  ref={coverFileRef}
                  className="sr-only"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void run(async () => {
                      setImportResult(await importCoverFile(file));
                      event.target.value = '';
                    }, 'Cover processed locally. Review the extracted fields below.');
                  }}
                />
              </div>
              {importResult && (
                <div className="space-y-4 rounded-lg border p-4">
                  <div>
                    <h3 className="font-semibold">Review extracted fields</h3>
                    <p className="text-muted-foreground text-xs">
                      Source: {importResult.source} - {importResult.pageCount}{' '}
                      page(s)
                    </p>
                  </div>
                  <dl className="grid gap-2 sm:grid-cols-2">
                    {importResult.fields.map((field) => (
                      <div
                        key={field.field}
                        className="rounded-md bg-muted/50 p-2"
                      >
                        <dt className="text-muted-foreground text-xs">
                          {field.field}
                        </dt>
                        <dd className="break-words text-sm">{field.value}</dd>
                        <dd className="text-muted-foreground text-xs">
                          {Math.round(field.confidence * 100)}% confidence
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {importResult.warnings.length > 0 && (
                    <ul className="list-disc space-y-1 pl-5 text-amber-700 text-sm dark:text-amber-300">
                      {importResult.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  )}
                  {collections.profiles.length > 0 && (
                    <label className="block space-y-1 text-sm">
                      <span>
                        Replace imported student information with a saved
                        profile
                      </span>
                      <select
                        className="h-9 w-full rounded-md border bg-background px-2"
                        value={replacementProfileId}
                        onChange={(event) =>
                          setReplacementProfileId(event.target.value)
                        }
                      >
                        <option value="">
                          Keep imported student information
                        </option>
                        {collections.profiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => {
                        if (!confirmReplace('Apply the imported cover?'))
                          return;
                        let importedCover = coverFormDataSchema.parse(
                          importResult.cover,
                        );
                        const profile = collections.profiles.find(
                          (item) => item.id === replacementProfileId,
                        );
                        if (profile) {
                          importedCover = applyProfileToCover(
                            importedCover,
                            profile,
                          );
                          defaultStore.set(editor.activeProfileId, profile.id);
                          setIdentityLocks(profile.lockedFields);
                        } else {
                          const activeProfile = collections.profiles.find(
                            (item) =>
                              item.id ===
                              defaultStore.get(editor.activeProfileId),
                          );
                          if (activeProfile?.lockedFields.length) {
                            const currentStudent = current().student;
                            importedCover.student = {
                              ...importedCover.student,
                              ...Object.fromEntries(
                                activeProfile.lockedFields.map((field) => [
                                  field,
                                  currentStudent[field],
                                ]),
                              ),
                            };
                          }
                        }
                        applyCoverFormData(importedCover, defaultStore);
                        setMessage('Imported cover applied.');
                      }}
                    >
                      Apply imported cover
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setImportResult(null)}
                    >
                      Discard
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="data" className="space-y-6">
              <section className="space-y-3">
                <h3 className="font-semibold">Backup and restore</h3>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        downloadJson(
                          `ruet-cover-backup-${new Date().toISOString().slice(0, 10)}.json`,
                          await exportLocalBackup(),
                        );
                      }, 'Backup exported.')
                    }
                  >
                    <DownloadIcon /> Export JSON
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => backupFileRef.current?.click()}
                  >
                    <UploadIcon /> Import JSON
                  </Button>
                  <label className="flex items-center gap-2 text-sm">
                    <span>Import mode</span>
                    <select
                      className="h-9 rounded-md border bg-background px-2"
                      value={importStrategy}
                      onChange={(event) =>
                        setImportStrategy(
                          event.target.value as 'merge' | 'replace',
                        )
                      }
                    >
                      <option value="merge">Merge</option>
                      <option value="replace">Replace</option>
                    </select>
                  </label>
                  <input
                    ref={backupFileRef}
                    className="sr-only"
                    type="file"
                    accept="application/json,.json"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      event.target.value = '';
                      void run(async () => {
                        if (file.size > 10 * 1024 * 1024) {
                          throw new Error(
                            'Choose a backup no larger than 10 MB.',
                          );
                        }
                        await importLocalBackup(
                          JSON.parse(await file.text()),
                          importStrategy,
                        );
                      }, 'Backup imported and validated.');
                    }}
                  />
                </div>
              </section>
              <section className="space-y-3 rounded-lg border border-destructive/40 p-4">
                <h3 className="font-semibold">Clear local data</h3>
                <p className="text-muted-foreground text-sm">
                  These actions affect only this browser on this device.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (
                        !window.confirm(
                          'Clear all saved drafts and generated-cover history?',
                        )
                      )
                        return;
                      void run(
                        async () => void (await clearDraftsAndHistory()),
                        'Drafts and history cleared.',
                      );
                    }}
                  >
                    <Trash2Icon /> Clear drafts and history
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (
                        !window.confirm(
                          'Clear all local profiles, presets, drafts, and history?',
                        )
                      )
                        return;
                      void run(async () => {
                        await clearAllLocalWorkspaceData();
                        defaultStore.set(editor.activeProfileId, '');
                        setIdentityLocks([]);
                      }, 'Local workspace cleared.');
                    }}
                  >
                    <Trash2Icon /> Clear workspace
                  </Button>
                </div>
              </section>
            </TabsContent>
          </div>
        </Tabs>
        {message && (
          <p className="border-t px-6 py-3 text-sm" role="status">
            {message}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateRow({
  value,
  onChange,
  placeholder,
  buttonLabel,
  disabled,
  onCreate,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  buttonLabel: string;
  disabled: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      <Button disabled={disabled} onClick={onCreate}>
        <SaveIcon /> {buttonLabel}
      </Button>
    </div>
  );
}
