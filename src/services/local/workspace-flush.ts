let flushWorkspace: () => Promise<void> = async () => {};

export function setWorkspaceFlusher(flusher: () => Promise<void>) {
  flushWorkspace = flusher;
  return () => {
    if (flushWorkspace === flusher) flushWorkspace = async () => {};
  };
}

export function flushWorkspaceDraft() {
  return flushWorkspace();
}
