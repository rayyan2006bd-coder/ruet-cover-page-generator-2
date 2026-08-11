import { useAtomValue } from 'jotai';
import './App.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useDebounce } from 'use-debounce';
import { Editor } from './components/editor/editor';
import { InApp } from './components/in-app';
import { TopbarLeft } from './components/topbar';
import { Update } from './components/update';
import { WorkspaceController } from './components/workspace/workspace-controller';
import { cn } from './lib/utils';
import { previewModeAtom } from './store/preview-mode';

const mql = window.matchMedia('(max-width: 1023px)');
const AdminApp = lazy(() => import('./admin/admin-app'));
const PreviewPanel = lazy(() => import('./components/preview-panel'));
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) =>
        failureCount < 2 &&
        !(error instanceof DOMException && error.name === 'AbortError'),
      staleTime: 5 * 60 * 1000,
    },
  },
});

const GeneratorApp = () => {
  const previewMode = useAtomValue(previewModeAtom);
  const [isMobile, setIsMobile] = useState(mql.matches);
  const [previewModeDebounced] = useDebounce(previewMode, 350);

  useEffect(() => {
    const handleChange = (event: { matches: boolean }) =>
      setIsMobile(event.matches);
    mql.addEventListener('change', handleChange);

    return () => mql.removeEventListener('change', handleChange);
  }, []);

  return (
    <main className="flex h-dvh min-h-0 w-full overflow-hidden divide-x">
      <QueryClientProvider client={queryClient}>
        <WorkspaceController />
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1 origin-left flex-col divide-y transition-all',
            previewMode && 'max-lg:invisible max-lg:grow-0 max-lg:scale-x-0',
          )}
        >
          <TopbarLeft />
          <Editor />
        </div>
        {(!isMobile || previewMode) && (
          <div
            className={cn(
              'flex min-h-0 min-w-0 flex-1 origin-left flex-col divide-y transition-all bg-neutral-500',
              previewMode || 'max-lg:invisible max-lg:grow-0 max-lg:scale-x-0',
            )}
          >
            <Suspense fallback={<PreviewLoading />}>
              <PreviewPanel
                isMobile={isMobile}
                previewReady={!isMobile || previewModeDebounced}
              />
            </Suspense>
          </div>
        )}
      </QueryClientProvider>
      <InApp />
      <Update />
    </main>
  );
};

function PreviewLoading() {
  return (
    <div
      className="relative flex flex-1 grow shrink overflow-hidden"
      role="status"
      aria-label="Loading PDF preview"
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

const App = () =>
  window.location.pathname.startsWith('/admin') ? (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center">
          Loading administrator interface…
        </main>
      }
    >
      <AdminApp />
    </Suspense>
  ) : (
    <GeneratorApp />
  );

export default App;
