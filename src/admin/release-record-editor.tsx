import { PlusIcon, SaveIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { API_BASE_URL } from '@/services/api/client';

type ReleaseData = {
  release: { id: string; version: string; status: string };
  departments: Array<Record<string, unknown>>;
  teachers: Array<Record<string, unknown>>;
  courses: Array<Record<string, unknown>>;
  courseTeachers: Array<Record<string, unknown>>;
  templates: Array<Record<string, unknown>>;
};

type CollectionKey = Exclude<keyof ReleaseData, 'release'>;

const collectionOptions: Array<{
  key: CollectionKey;
  label: string;
  route: string;
}> = [
  { key: 'departments', label: 'Departments', route: 'departments' },
  { key: 'teachers', label: 'Teachers', route: 'teachers' },
  { key: 'courses', label: 'Courses', route: 'courses' },
  {
    key: 'courseTeachers',
    label: 'Course–teacher links',
    route: 'course-teachers',
  },
  { key: 'templates', label: 'Cover templates', route: 'templates' },
];

const emptyRecords: Record<CollectionKey, Record<string, unknown>> = {
  departments: {
    stableKey: 'dept-key',
    shortName: 'DEPT',
    fullName: 'Department name',
    slug: 'dept-key',
    faculty: null,
    active: true,
  },
  teachers: {
    stableKey: 'teacher-key',
    name: 'Teacher name',
    designation: 'Designation',
    departmentKey: 'dept-key',
    profileUrl: null,
    sourceUrl: null,
    lastVerifiedAt: null,
    active: true,
  },
  courses: {
    stableKey: 'course-key',
    code: 'CSE 0000',
    title: 'Course title',
    departmentKey: 'dept-key',
    active: true,
  },
  courseTeachers: {
    courseKey: 'course-key',
    teacherKey: 'teacher-key',
    priority: 0,
    active: true,
  },
  templates: {
    stableKey: 'template-key',
    departmentKey: 'dept-key',
    coverType: 'Lab Report',
    name: 'Approved cover',
    templateVersion: '1.0',
    status: 'draft',
    configuration: {
      layoutVariant: 'general',
      requiredFields: [],
      lockedElements: [],
      defaultSettings: {},
      allowedSettings: [],
      logo: { mode: 'ruet' },
      watermark: { enabled: false },
      assessmentTable: { enabled: false },
      printMarginsMm: { top: 25.4, right: 25.4, bottom: 25.4, left: 30 },
      headerRule: '',
      footerRule: '',
    },
    effectiveDate: null,
    releaseNotes: '',
    active: true,
  },
};

function csrfToken() {
  const cookie = document.cookie
    .split('; ')
    .find((item) => item.startsWith('ruet_admin_csrf='));
  return cookie
    ? decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1))
    : '';
}

async function request<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}/api/v1/admin${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.method && options.method !== 'GET'
        ? { 'X-CSRF-Token': csrfToken() }
        : {}),
      ...options.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as
    | T
    | { error?: { message?: string; details?: unknown } }
    | null;
  if (!response.ok) {
    const error = body as { error?: { message?: string; details?: unknown } };
    throw new Error(
      error?.error?.message ?? `Request failed (${response.status})`,
    );
  }
  return body as T;
}

function recordLabel(record: Record<string, unknown>) {
  const primary =
    record.name ??
    record.fullName ??
    record.code ??
    record.stableKey ??
    record.courseKey ??
    'Record';
  const secondary = record.teacherKey ? ` → ${record.teacherKey}` : '';
  return `${String(primary)}${secondary}${record.active === false ? ' (inactive)' : ''}`;
}

export function ReleaseRecordEditor({
  releaseId,
  readOnly,
  onMessage,
}: {
  releaseId: string;
  readOnly: boolean;
  onMessage: (message: string) => void;
}) {
  const [data, setData] = useState<ReleaseData | null>(null);
  const [collection, setCollection] = useState<CollectionKey>('departments');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [json, setJson] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await request<ReleaseData>(`/releases/${releaseId}/data`);
    setData(result);
  }, [releaseId]);

  useEffect(() => {
    setSelectedIndex(-1);
    setJson(JSON.stringify(emptyRecords.departments, null, 2));
    void load().catch((error) => onMessage(error.message));
  }, [load, onMessage]);

  const records = data?.[collection] ?? [];
  const route = useMemo(
    () => collectionOptions.find((option) => option.key === collection)?.route,
    [collection],
  );

  const chooseCollection = (next: CollectionKey) => {
    setCollection(next);
    setSelectedIndex(-1);
    setJson(JSON.stringify(emptyRecords[next], null, 2));
  };

  const chooseRecord = (index: number) => {
    setSelectedIndex(index);
    setJson(
      JSON.stringify(
        index < 0 ? emptyRecords[collection] : records[index],
        null,
        2,
      ),
    );
  };

  const save = async (record: Record<string, unknown>) => {
    if (!route) return;
    setBusy(true);
    onMessage('');
    try {
      await request(`/releases/${releaseId}/${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
      await load();
      setJson(JSON.stringify(record, null, 2));
      onMessage(
        `${collectionOptions.find((item) => item.key === collection)?.label} record saved.`,
      );
    } catch (error) {
      onMessage(
        error instanceof Error ? error.message : 'Could not save record.',
      );
    } finally {
      setBusy(false);
    }
  };

  const parseEditor = () => {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('The editor must contain one JSON object.');
    }
    return parsed as Record<string, unknown>;
  };

  return (
    <section className="rounded-xl border bg-background p-5">
      <div className="mb-4">
        <h2 className="font-semibold text-lg">Draft records</h2>
        <p className="text-muted-foreground text-sm">
          Edit one record at a time. Stable keys remain unchanged across
          releases; set <code>active</code> to <code>false</code> to deactivate
          a record.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <div className="space-y-3">
          <label className="block space-y-1 text-sm" htmlFor="record-kind">
            <span>Record type</span>
            <select
              id="record-kind"
              className="h-9 w-full rounded-md border bg-background px-3"
              value={collection}
              onChange={(event) =>
                chooseCollection(event.target.value as CollectionKey)
              }
            >
              {collectionOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label} ({data?.[option.key].length ?? 0})
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm" htmlFor="record-item">
            <span>Existing record</span>
            <select
              id="record-item"
              className="h-9 w-full rounded-md border bg-background px-3"
              value={selectedIndex}
              onChange={(event) => chooseRecord(Number(event.target.value))}
            >
              <option value={-1}>New record</option>
              {records.map((record, index) => (
                <option
                  key={`${record.stableKey ?? record.courseKey}:${record.teacherKey ?? index}`}
                  value={index}
                >
                  {recordLabel(record)}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            className="w-full"
            variant="outline"
            onClick={() => chooseRecord(-1)}
          >
            <PlusIcon /> New{' '}
            {collectionOptions
              .find((item) => item.key === collection)
              ?.label.toLowerCase()}
          </Button>
          <p className="text-muted-foreground text-xs">
            Relationships must reference stable course and teacher keys from
            this release. Publishing is blocked until validation passes.
          </p>
        </div>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              void save(parseEditor());
            } catch (error) {
              onMessage(
                error instanceof Error ? error.message : 'Invalid JSON.',
              );
            }
          }}
        >
          <label className="block space-y-1 text-sm" htmlFor="record-json">
            <span>Record JSON</span>
            <Textarea
              id="record-json"
              className="min-h-80 font-mono text-xs"
              spellCheck={false}
              readOnly={readOnly}
              value={json}
              onChange={(event) => setJson(event.target.value)}
            />
          </label>
          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>
                <SaveIcon /> {busy ? 'Saving…' : 'Save record'}
              </Button>
              {selectedIndex >= 0 &&
                records[selectedIndex]?.active !== false && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      try {
                        const record = { ...parseEditor(), active: false };
                        setJson(JSON.stringify(record, null, 2));
                        void save(record);
                      } catch (error) {
                        onMessage(
                          error instanceof Error
                            ? error.message
                            : 'Invalid JSON.',
                        );
                      }
                    }}
                  >
                    Deactivate
                  </Button>
                )}
            </div>
          )}
        </form>
      </div>
    </section>
  );
}
