import { EyeOpenIcon } from '@radix-ui/react-icons';
import { useSetAtom } from 'jotai';
import { UserRoundIcon } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import icon from '@/assets/icon.svg';
import { previewModeAtom } from '@/store/preview-mode';
import { workspaceOpenAtom } from '@/store/workspace';
import { About } from './about';
import { ModeToggle } from './mode-toggle';
import { Button } from './ui/button';

const loadWorkspaceDialog = () =>
  import('./workspace/workspace-dialog').then((module) => ({
    default: module.WorkspaceDialog,
  }));
const WorkspaceDialog = lazy(loadWorkspaceDialog);

export function TopbarLeft() {
  const setPreviewMode = useSetAtom(previewModeAtom);
  return (
    <div className="flex min-h-14 shrink-0 items-center justify-between gap-2 bg-secondary px-2 py-1.5 sm:p-2">
      <div className="flex min-w-0 items-center gap-2">
        <img src={icon} alt="" className="h-7 w-auto shrink-0 sm:h-8" />
        <h1 className="min-w-0 truncate whitespace-nowrap font-semibold text-xl sm:text-2xl">
          Cover Page <span className="max-sm:sr-only">Generator</span>
        </h1>
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <WorkspaceLauncher />
        <About />
        <ModeToggle />
        <Button
          variant="outline"
          size="icon"
          onClick={() => setPreviewMode(true)}
          className="lg:hidden"
          aria-label="Preview cover"
        >
          <EyeOpenIcon className="h-[1.2rem] w-[1.2rem]" />
        </Button>
      </div>
    </div>
  );
}

function WorkspaceLauncher() {
  const [loaded, setLoaded] = useState(false);
  const setOpen = useSetAtom(workspaceOpenAtom);

  if (loaded) {
    return (
      <Suspense
        fallback={
          <Button
            variant="outline"
            size="icon"
            aria-label="Loading workspace"
            disabled
          >
            <UserRoundIcon />
          </Button>
        }
      >
        <WorkspaceDialog />
      </Suspense>
    );
  }

  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Open workspace"
      onPointerEnter={() => void loadWorkspaceDialog()}
      onFocus={() => void loadWorkspaceDialog()}
      onClick={() => {
        setOpen(true);
        setLoaded(true);
      }}
    >
      <UserRoundIcon />
    </Button>
  );
}
