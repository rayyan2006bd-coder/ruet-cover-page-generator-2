import { useQuery } from '@tanstack/react-query';
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useMemo } from 'react';
import { syncPublishedDataset } from '@/services/api/dataset';
import { getActiveDirectoryDataset } from '@/services/local/database';
import editor from '@/store/editor';

export function TemplateDirectory() {
  const selectedKey = useAtomValue(editor.templateStableKey);
  const courseDepartmentKey = useAtomValue(editor.courseDepartmentKey);
  const coverType = useAtomValue(editor.type);
  const setStableKey = useSetAtom(editor.templateStableKey);
  const setVersion = useSetAtom(editor.templateVersion);
  const setName = useSetAtom(editor.templateName);
  const setApproved = useSetAtom(editor.templateApproved);
  const setters = {
    formToBorder: useSetAtom(editor.formToBorder),
    watermark: useSetAtom(editor.watermark),
    courseCode: useSetAtom(editor.courseCode),
    studentSeries: useSetAtom(editor.studentSeries),
    studentSession: useSetAtom(editor.studentSession),
    courseInfoBellowTitle: useSetAtom(editor.courseInfoBellowTitle),
    datesBellowTitle: useSetAtom(editor.datesBellowTitle),
    assessmentTable: useSetAtom(editor.assessmentTable),
  };

  const cachedQuery = useQuery({
    queryKey: ['directory-release', 'cached'],
    queryFn: getActiveDirectoryDataset,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const syncedQuery = useQuery({
    queryKey: ['directory-release', 'synced'],
    queryFn: ({ signal }) => syncPublishedDataset(signal),
  });
  const dataset = syncedQuery.data ?? cachedQuery.data;
  const templates = useMemo(
    () =>
      (dataset?.templates ?? []).filter(
        (template) =>
          template.active &&
          template.status === 'published' &&
          template.coverType === coverType &&
          (!courseDepartmentKey ||
            template.departmentKey === courseDepartmentKey),
      ),
    [courseDepartmentKey, coverType, dataset],
  );

  useEffect(() => {
    if (
      selectedKey &&
      dataset &&
      !templates.some((template) => template.stableKey === selectedKey)
    ) {
      setStableKey('');
      setVersion('');
      setName('General RUET cover');
      setApproved(false);
    }
  }, [
    dataset,
    selectedKey,
    setApproved,
    setName,
    setStableKey,
    setVersion,
    templates,
  ]);

  const select = (stableKey: string) => {
    const template = templates.find((item) => item.stableKey === stableKey);
    if (!template) {
      setStableKey('');
      setVersion('');
      setName('General RUET cover');
      setApproved(false);
      return;
    }
    setStableKey(template.stableKey);
    setVersion(template.templateVersion);
    setName(template.name);
    setApproved(true);
    const defaults = template.configuration.defaultSettings;
    for (const [key, value] of Object.entries(defaults)) {
      if (typeof value === 'boolean' && key in setters) {
        setters[key as keyof typeof setters](value);
      }
    }
    if (template.configuration.watermark.enabled) setters.watermark(true);
    if (template.configuration.assessmentTable.enabled) {
      setters.assessmentTable(true);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border p-3 not-prose">
      <label className="block space-y-1 text-sm" htmlFor="approved-template">
        <span>Approved cover template</span>
        <select
          id="approved-template"
          className="h-9 w-full rounded-md border bg-background px-3"
          value={
            templates.some((item) => item.stableKey === selectedKey)
              ? selectedKey
              : ''
          }
          onChange={(event) => select(event.target.value)}
        >
          <option value="">General RUET cover</option>
          {templates.map((template) => (
            <option key={template.stableKey} value={template.stableKey}>
              {template.name} (v{template.templateVersion})
            </option>
          ))}
        </select>
      </label>
      <p className="text-muted-foreground text-xs">
        {templates.length
          ? 'Approved templates are supplied by the current published directory release.'
          : 'No approved template matches this course department and cover type; the general cover remains available.'}
      </p>
    </div>
  );
}
