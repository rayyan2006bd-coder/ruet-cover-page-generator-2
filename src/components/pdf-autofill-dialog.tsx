import {
  type CoverFormData,
  coverFormDataSchema,
  type SmartImportResult,
} from '@shared/domain-contracts';
import { useSetAtom } from 'jotai';
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  Loader2Icon,
  SparklesIcon,
  UploadIcon,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { importCoverFile } from '@/services/import/cover-import';
import { applyCoverFormData } from '@/services/local/cover-state';
import { defaultStore } from '@/store';
import editorStore, {
  Department,
  departments,
  designations,
  types,
} from '@/store/editor';

type ExtractionProgress = {
  stage: 'reading' | 'ocr' | 'parsing' | 'done';
  percent: number;
  message: string;
};

export function PdfAutofillDialog({
  trigger,
  className,
}: {
  trigger?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ExtractionProgress | null>(null);
  const [result, setResult] = useState<SmartImportResult | null>(null);
  const [editableCover, setEditableCover] = useState<CoverFormData | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setTab = useSetAtom(editorStore.editorTab);

  const resetState = () => {
    setLoading(false);
    setProgress(null);
    setResult(null);
    setEditableCover(null);
    setError(null);
  };

  const handleFileProcess = async (selectedFile: File) => {
    setFile(selectedFile);
    setLoading(true);
    setError(null);
    setProgress({
      stage: 'reading',
      percent: 10,
      message: 'Reading document...',
    });

    try {
      const importRes = await importCoverFile(selectedFile, (p) => {
        setProgress(p);
      });
      setResult(importRes);
      setEditableCover(coverFormDataSchema.parse(importRes.cover));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to extract information from the file.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      void handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleApply = () => {
    if (!editableCover) return;
    applyCoverFormData(editableCover, defaultStore);
    setOpen(false);
    setTab('student');
    resetState();
  };

  const updateStudentField = (
    key: keyof CoverFormData['student'],
    val: string,
  ) => {
    if (!editableCover) return;
    setEditableCover({
      ...editableCover,
      student: {
        ...editableCover.student,
        [key]: val,
      },
    });
  };

  const updateCourseField = (
    key: keyof CoverFormData['course'],
    val: string,
  ) => {
    if (!editableCover) return;
    setEditableCover({
      ...editableCover,
      course: {
        ...editableCover.course,
        [key]: val,
      },
    });
  };

  const updateTeacher = (
    index: number,
    key: 'name' | 'designation' | 'department',
    val: string,
  ) => {
    if (!editableCover) return;
    const newTeachers = [...editableCover.teachers];
    if (newTeachers[index]) {
      newTeachers[index] = {
        ...newTeachers[index],
        [key]: val,
      };
      setEditableCover({
        ...editableCover,
        teachers: newTeachers,
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetState();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            variant="default"
            size="sm"
            className={
              className ??
              'gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm hover:from-blue-700 hover:to-indigo-700'
            }
          >
            <SparklesIcon className="size-4 animate-pulse" />
            <span>Auto-Fill from PDF</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <SparklesIcon className="size-5 text-indigo-500" />
            AI-Powered PDF Auto-Fill
          </DialogTitle>
          <DialogDescription>
            Upload any RUET cover page (PDF or scanned image) to automatically
            detect student, course, and teacher details.
          </DialogDescription>
        </DialogHeader>

        {!result && !loading && (
          <button
            type="button"
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`w-full cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
              dragActive
                ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                : 'border-border hover:border-indigo-400 hover:bg-muted/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFileProcess(f);
              }}
            />
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              <UploadIcon className="size-7" />
            </div>
            <p className="font-semibold text-base">
              Click or drag & drop RUET Cover Page
            </p>
            <p className="mt-1 text-muted-foreground text-xs">
              Supports digital PDFs, scanned PDFs, and cover page photos (.pdf,
              .png, .jpg)
            </p>
            {error && (
              <div className="mt-4 flex items-center justify-center gap-2 text-destructive text-sm font-medium">
                <AlertCircleIcon className="size-4" />
                <span>{error}</span>
              </div>
            )}
          </button>
        )}

        {loading && (
          <div className="space-y-5 rounded-xl border p-8 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              <Loader2Icon className="size-7 animate-spin" />
            </div>
            <div>
              <p className="font-semibold text-base">
                {progress?.message ?? 'Processing document...'}
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                Extracting layout, detecting fields, and resolving teachers...
              </p>
            </div>
            <div className="w-full overflow-hidden rounded-full bg-secondary h-2.5">
              <div
                className="h-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-300 rounded-full"
                style={{ width: `${progress?.percent ?? 20}%` }}
              />
            </div>
          </div>
        )}

        {result && editableCover && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 p-3 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              <div className="flex items-center gap-2">
                <CheckCircle2Icon className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="font-semibold text-sm">
                  ✓ PDF detected successfully · {result.fields.length} fields
                  extracted
                </span>
              </div>
              <span className="text-xs font-medium opacity-80">
                Source:{' '}
                {result.source === 'ocr'
                  ? 'OCR engine'
                  : result.source === 'embedded-data'
                    ? 'Embedded Data'
                    : 'Digital PDF'}
              </span>
            </div>

            <p className="text-muted-foreground text-xs">
              Review and edit detected information below before applying to your
              cover page:
            </p>

            <div className="space-y-4 max-h-[45vh] overflow-y-auto pr-1">
              {/* Student Section */}
              <div className="rounded-lg border p-3 space-y-3">
                <p className="font-semibold text-xs text-indigo-600 uppercase tracking-wider dark:text-indigo-400">
                  Student Information
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Full Name</Label>
                    <Input
                      value={editableCover.student.name}
                      onChange={(e) =>
                        updateStudentField('name', e.target.value)
                      }
                      placeholder="Student Name"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Roll Number</Label>
                    <Input
                      value={editableCover.student.roll}
                      onChange={(e) =>
                        updateStudentField('roll', e.target.value)
                      }
                      placeholder="e.g. 2405055"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Department</Label>
                    <select
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                      value={editableCover.student.department}
                      onChange={(e) =>
                        updateStudentField('department', e.target.value)
                      }
                    >
                      <option value="">Select Department</option>
                      {departments.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Group</Label>
                      <Input
                        value={editableCover.student.group}
                        onChange={(e) =>
                          updateStudentField('group', e.target.value)
                        }
                        placeholder="e.g. 02"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Section</Label>
                      <Input
                        value={editableCover.student.section}
                        onChange={(e) =>
                          updateStudentField('section', e.target.value)
                        }
                        placeholder="e.g. A"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Course & Submission Section */}
              <div className="rounded-lg border p-3 space-y-3">
                <p className="font-semibold text-xs text-indigo-600 uppercase tracking-wider dark:text-indigo-400">
                  Course & Submission Information
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Course No. / Code</Label>
                    <Input
                      value={editableCover.course.code}
                      onChange={(e) =>
                        updateCourseField('code', e.target.value)
                      }
                      placeholder="e.g. Math-2123 or ME 2152"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Cover Type</Label>
                    <select
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                      value={editableCover.coverType}
                      onChange={(e) =>
                        setEditableCover({
                          ...editableCover,
                          coverType: e.target
                            .value as CoverFormData['coverType'],
                        })
                      }
                    >
                      {types.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <Label className="text-xs">Course Title</Label>
                    <Input
                      value={editableCover.course.title}
                      onChange={(e) =>
                        updateCourseField('title', e.target.value)
                      }
                      placeholder="e.g. Thermodynamics and Heat Transfer Lab"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {editableCover.coverType === 'Lab Report'
                        ? 'Experiment No.'
                        : 'Assignment / Report No.'}
                    </Label>
                    <Input
                      value={editableCover.itemNumber}
                      onChange={(e) =>
                        setEditableCover({
                          ...editableCover,
                          itemNumber: e.target.value,
                        })
                      }
                      placeholder="e.g. 01"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {editableCover.coverType === 'Lab Report'
                        ? 'Experiment Name'
                        : 'Assignment / Report Title'}
                    </Label>
                    <Input
                      value={editableCover.title}
                      onChange={(e) =>
                        setEditableCover({
                          ...editableCover,
                          title: e.target.value,
                        })
                      }
                      placeholder="e.g. Assignment on Fourier Transform"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Date of Submission</Label>
                    <Input
                      type="date"
                      value={editableCover.submissionDate?.slice(0, 10) ?? ''}
                      onChange={(e) =>
                        setEditableCover({
                          ...editableCover,
                          submissionDate: e.target.value
                            ? new Date(
                                `${e.target.value}T00:00:00.000Z`,
                              ).toISOString()
                            : null,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Date of Experiment (Optional)
                    </Label>
                    <Input
                      type="date"
                      value={editableCover.experimentDate?.slice(0, 10) ?? ''}
                      onChange={(e) =>
                        setEditableCover({
                          ...editableCover,
                          experimentDate: e.target.value
                            ? new Date(
                                `${e.target.value}T00:00:00.000Z`,
                              ).toISOString()
                            : null,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Teacher(s) Section */}
              <div className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-xs text-indigo-600 uppercase tracking-wider dark:text-indigo-400">
                    Teacher Details ({editableCover.teachers.length})
                  </p>
                  {editableCover.teachers.length < 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() =>
                        setEditableCover({
                          ...editableCover,
                          teachers: [
                            ...editableCover.teachers,
                            {
                              stableKey: null,
                              name: '',
                              designation: 'Lecturer',
                              department:
                                editableCover.course.department ||
                                Department.IPE,
                              source: 'manual',
                            },
                          ],
                        })
                      }
                    >
                      + Add Second Teacher
                    </Button>
                  )}
                </div>

                {editableCover.teachers.map((teacher, idx) => (
                  <div
                    key={
                      teacher.stableKey
                        ? `${teacher.stableKey}-${idx}`
                        : `teacher-${idx}-${teacher.name}`
                    }
                    className="space-y-2 rounded border bg-muted/20 p-2.5"
                  >
                    <p className="font-medium text-xs text-muted-foreground">
                      Teacher {idx + 1}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Name</Label>
                        <Input
                          value={teacher.name}
                          onChange={(e) =>
                            updateTeacher(idx, 'name', e.target.value)
                          }
                          placeholder="e.g. Dr. Md Saifur Rahman"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Designation</Label>
                        <select
                          className="h-9 w-full rounded-md border bg-background px-2 text-xs"
                          value={teacher.designation}
                          onChange={(e) =>
                            updateTeacher(idx, 'designation', e.target.value)
                          }
                        >
                          {designations.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Department</Label>
                        <select
                          className="h-9 w-full rounded-md border bg-background px-2 text-xs"
                          value={teacher.department}
                          onChange={(e) =>
                            updateTeacher(idx, 'department', e.target.value)
                          }
                        >
                          {departments.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter className="flex flex-row justify-end gap-2 pt-2">
              <Button variant="outline" onClick={resetState}>
                Upload Another
              </Button>
              <Button
                onClick={handleApply}
                className="bg-indigo-600 text-white hover:bg-indigo-700 font-semibold"
              >
                Apply to Cover Page
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
