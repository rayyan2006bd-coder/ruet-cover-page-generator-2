import { ArrowLeftIcon } from '@radix-ui/react-icons';
import { useAtomValue, useSetAtom } from 'jotai';
import { coverFormDataAtom } from '@/services/local/cover-state';
import { buildSmartFilename } from '@/services/pdf/filename';
import { previewModeAtom } from '@/store/preview-mode';
import { CoverTemplate } from './cover-template';
import PDFDownloadLink from './PDFDownloadLink';
import { PDFViewer } from './PDFViewer';
import { Button } from './ui/button';

function TopbarRight() {
  const setPreviewMode = useSetAtom(previewModeAtom);
  const cover = useAtomValue(coverFormDataAtom);
  const filename = buildSmartFilename(cover);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-secondary p-2">
      <Button
        variant="outline"
        size="icon"
        onClick={() => setPreviewMode(false)}
        className="lg:hidden"
        aria-label="Back to editor"
      >
        <ArrowLeftIcon className="h-[1.2rem] w-[1.2rem]" />
      </Button>
      <div className="ms-auto flex min-w-0 items-center gap-2">
        <span
          className="max-w-72 truncate text-muted-foreground text-xs"
          title={filename}
        >
          {filename}
        </span>
        <Button variant="outline" size="icon" asChild>
          <PDFDownloadLink fileName={filename} />
        </Button>
      </div>
    </div>
  );
}

function PreviewLoading() {
  return (
    <div
      className="relative flex flex-1 grow shrink overflow-hidden"
      role="status"
      aria-label="Preparing PDF preview"
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="lds-facebook text-neutral-700" aria-hidden="true">
          <div></div>
          <div></div>
          <div></div>
        </div>
      </div>
    </div>
  );
}

export function PreviewPanel({
  isMobile,
  previewReady,
}: {
  isMobile: boolean;
  previewReady: boolean;
}) {
  return (
    <>
      <TopbarRight />
      {!isMobile || previewReady ? (
        <PDFViewer className="flex-1">
          <CoverTemplate />
        </PDFViewer>
      ) : (
        <PreviewLoading />
      )}
    </>
  );
}

export default PreviewPanel;
