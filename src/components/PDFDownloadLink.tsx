import { DownloadIcon } from '@radix-ui/react-icons';
import { fileSave } from 'browser-fs-access';
import { type ComponentProps, type MouseEvent, useTransition } from 'react';
import { captureCoverFormData } from '@/services/local/cover-state';
import { saveCoverHistoryRecord } from '@/services/local/database';
import { sanitizePdfFilename } from '@/services/pdf/filename';
import { generateCoverPdf, type PdfExportMode } from '@/services/pdf/generate';
import {
  hasBlockingPreflightIssues,
  preflightCover,
} from '@/services/pdf/preflight';
import { defaultStore } from '@/store';
import editor from '@/store/editor';
import { getCoverValues } from './cover-template';
import { LoadingSpinner } from './ui/loading-spinner';

export const PDFDownloadLink = ({
  fileName = 'document.pdf',
  ...props
}: { fileName?: string } & ComponentProps<'button'>) => {
  const [isPending, startTransition] = useTransition();
  const fileNameClean = sanitizePdfFilename(fileName);

  const handleClick = (
    _event: MouseEvent<HTMLButtonElement, globalThis.MouseEvent>,
  ) => {
    const cover = captureCoverFormData(defaultStore);
    const issues = preflightCover(cover);
    if (hasBlockingPreflightIssues(issues)) {
      window.alert(
        `Please fix these fields before export:\n\n${issues
          .filter((issue) => issue.severity === 'error')
          .map((issue) => `• ${issue.message}`)
          .join('\n')}`,
      );
      return;
    }
    const warnings = issues.filter((issue) => issue.severity === 'warning');
    if (
      warnings.length > 0 &&
      !window.confirm(
        `PDF preflight found possible layout issues:\n\n${warnings
          .map((issue) => `• ${issue.message}`)
          .join('\n')}\n\nContinue with this layout?`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        const exportMode = defaultStore.get(editor.pdfExportMode);
        const blob = await generateCoverPdf({
          cover,
          values: getCoverValues(defaultStore),
          mode: ['standard', 'high-quality', 'compressed'].includes(exportMode)
            ? (exportMode as PdfExportMode)
            : 'standard',
        });
        if (window.navigator.userAgent === 'ruet-cover-page-gen') {
          const fileReader = new FileReader();
          fileReader.onloadend = () => {
            (
              window as {
                ReactNativeWebView?: {
                  postMessage(msg: string): void;
                };
              }
            ).ReactNativeWebView?.postMessage(
              JSON.stringify({
                dataURI: fileReader.result,
                fileName: fileNameClean,
              }),
            );
          };
          fileReader.readAsDataURL(blob);
          await saveCoverHistoryRecord({
            schemaVersion: 1,
            id: crypto.randomUUID(),
            name: fileNameClean.replace(/\.pdf$/i, ''),
            cover,
            profileId: defaultStore.get(editor.activeProfileId) || null,
            generatedAt: new Date().toISOString(),
          });
          return;
        }
        await fileSave(blob, {
          fileName: fileNameClean,
          extensions: ['.pdf'],
        });
        await saveCoverHistoryRecord({
          schemaVersion: 1,
          id: crypto.randomUUID(),
          name: fileNameClean.replace(/\.pdf$/i, ''),
          cover,
          profileId: defaultStore.get(editor.activeProfileId) || null,
          generatedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error(error);
        alert('Could not download!');
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      data-testid="download-pdf"
      {...props}
    >
      {isPending ? (
        <LoadingSpinner />
      ) : (
        <DownloadIcon className="h-[1.2rem] w-[1.2rem]" />
      )}
      <span className="sr-only">Download</span>
    </button>
  );
};

export default PDFDownloadLink;
