import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  LogOutIcon,
  RefreshCwIcon,
} from 'lucide-react';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { API_BASE_URL } from '@/services/api/client';
import { ReleaseRecordEditor } from './release-record-editor';

type AdminUser = {
  id: string | null;
  email: string | null;
  role: 'owner' | 'editor' | 'viewer' | null;
};

type Release = {
  id: string;
  version: string;
  status: 'draft' | 'published' | 'retired';
  notes: string;
  createdAt: string;
  publishedAt: string | null;
};

type AuditItem = {
  id: string;
  action: string;
  entityType: string;
  entityKey: string | null;
  summary: string;
  requestId: string | null;
  createdAt: string;
};

function csrfToken() {
  const cookie = document.cookie
    .split('; ')
    .find((item) => item.startsWith('ruet_admin_csrf='));
  return cookie
    ? decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1))
    : '';
}

async function adminRequest<T>(path: string, options: RequestInit = {}) {
  const method = options.method?.toUpperCase() ?? 'GET';
  const response = await fetch(`${API_BASE_URL}/api/v1/admin${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(!['GET', 'HEAD', 'OPTIONS'].includes(method)
        ? { 'X-CSRF-Token': csrfToken() }
        : {}),
      ...options.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as
    | T
    | { error?: { message?: string } }
    | null;
  if (!response.ok) {
    throw new Error(
      typeof body === 'object' && body !== null && 'error' in body
        ? (body.error?.message ?? `Request failed (${response.status})`)
        : `Request failed (${response.status})`,
    );
  }
  return body as T;
}

function AdminApp() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void adminRequest<{ user: AdminUser }>('/session')
      .then((result) => setUser(result.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-muted/30 p-6">
        <p role="status">Checking administrator session…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Button asChild variant="ghost" size="icon">
            <a href="/" aria-label="Back to cover generator">
              <ArrowLeftIcon />
            </a>
          </Button>
          <div className="mr-auto">
            <h1 className="font-semibold text-xl">
              RUET directory administration
            </h1>
            <p className="text-muted-foreground text-xs">
              Versioned releases, validation, publishing, and audit history
            </p>
          </div>
          {user && (
            <Button
              variant="outline"
              onClick={() =>
                void adminRequest('/session/logout', { method: 'POST' })
                  .then(() => setUser(null))
                  .catch((error) => setMessage(error.message))
              }
            >
              <LogOutIcon /> Log out
            </Button>
          )}
        </div>
      </header>
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        {user ? (
          <ReleaseDashboard user={user} onMessage={setMessage} />
        ) : (
          <Login onLogin={setUser} onMessage={setMessage} />
        )}
        {message && (
          <p
            className="mt-4 rounded-md border bg-background p-3 text-sm"
            role="status"
          >
            {message}
          </p>
        )}
      </div>
    </main>
  );
}

function Login({
  onLogin,
  onMessage,
}: {
  onLogin: (user: AdminUser) => void;
  onMessage: (message: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    onMessage('');
    try {
      const result = await adminRequest<{ user: AdminUser }>('/session/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      onLogin(result.user);
      setPassword('');
      onMessage('Signed in successfully.');
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mx-auto max-w-md space-y-4 rounded-xl border bg-background p-6 shadow-sm"
    >
      <div>
        <h2 className="font-semibold text-lg">Administrator sign in</h2>
        <p className="text-muted-foreground text-sm">
          Accounts are created only through the server CLI. Public registration
          is disabled.
        </p>
      </div>
      <label htmlFor="admin-email" className="block space-y-1 text-sm">
        <span>Email</span>
        <Input
          id="admin-email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label htmlFor="admin-password" className="block space-y-1 text-sm">
        <span>Password</span>
        <Input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          minLength={12}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <Button className="w-full" disabled={busy} type="submit">
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}

function ReleaseDashboard({
  user,
  onMessage,
}: {
  user: AdminUser;
  onMessage: (message: string) => void;
}) {
  const [releases, setReleases] = useState<Release[]>([]);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [version, setVersion] = useState('');
  const [notes, setNotes] = useState('');
  const [copyPublished, setCopyPublished] = useState(true);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const published = useMemo(
    () => releases.find((release) => release.status === 'published'),
    [releases],
  );
  const selectedDraft = useMemo(
    () => releases.find((release) => release.id === selectedDraftId),
    [releases, selectedDraftId],
  );

  const refresh = useCallback(async () => {
    const [releaseResult, auditResult] = await Promise.all([
      adminRequest<{ items: Release[] }>('/releases'),
      adminRequest<{ items: AuditItem[] }>('/audit'),
    ]);
    setReleases(releaseResult.items);
    setAudit(auditResult.items);
  }, []);

  useEffect(() => {
    void refresh().catch((error) => onMessage(error.message));
  }, [onMessage, refresh]);

  const run = async (operation: () => Promise<void>, success?: string) => {
    setBusy(true);
    onMessage('');
    try {
      await operation();
      await refresh();
      if (success) onMessage(success);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Operation failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-background p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="mr-auto">
            <h2 className="font-semibold text-lg">Dataset releases</h2>
            <p className="text-muted-foreground text-sm">
              Signed in as {user.email} ({user.role})
            </p>
          </div>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void refresh()}
          >
            <RefreshCwIcon /> Refresh
          </Button>
        </div>
        {user.role !== 'viewer' && (
          <form
            className="mb-5 grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-[12rem_1fr_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await adminRequest('/releases', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    version,
                    notes,
                    ...(copyPublished && published
                      ? { copyFromId: published.id }
                      : {}),
                  }),
                });
                setVersion('');
                setNotes('');
              }, 'Draft release created.');
            }}
          >
            <Input
              required
              placeholder="Version, e.g. 2026.08.1"
              aria-label="New release version"
              value={version}
              onChange={(event) => setVersion(event.target.value)}
            />
            <Input
              placeholder="Release notes"
              aria-label="Release notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
            <Button disabled={busy}>Create draft</Button>
            <label className="flex items-center gap-2 text-sm sm:col-span-3">
              <input
                type="checkbox"
                checked={copyPublished}
                onChange={(event) => setCopyPublished(event.target.checked)}
              />
              Copy the current published release
            </label>
          </form>
        )}
        <ul className="space-y-3">
          {releases.map((release) => (
            <li key={release.id} className="rounded-lg border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{release.version}</h3>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {release.status}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {release.notes || 'No release notes'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void run(async () => {
                        const result = await adminRequest<{
                          valid: boolean;
                          issues: Array<{ message: string }>;
                        }>(`/releases/${release.id}/validate`);
                        onMessage(
                          result.valid
                            ? `${release.version} is valid and ready to publish.`
                            : result.issues
                                .map((issue) => issue.message)
                                .join(' '),
                        );
                      })
                    }
                  >
                    <CheckCircle2Icon /> Validate
                  </Button>
                  {release.status === 'draft' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setSelectedDraftId(release.id)}
                    >
                      {user.role === 'viewer' ? 'View data' : 'Edit data'}
                    </Button>
                  )}
                  {user.role !== 'viewer' && release.status === 'draft' && (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          async () =>
                            void (await adminRequest(
                              `/releases/${release.id}/publish`,
                              { method: 'POST' },
                            )),
                          `${release.version} published.`,
                        )
                      }
                    >
                      Publish
                    </Button>
                  )}
                  {user.role === 'owner' && release.status === 'retired' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          async () =>
                            void (await adminRequest(
                              `/releases/${release.id}/rollback`,
                              { method: 'POST' },
                            )),
                          `${release.version} restored.`,
                        )
                      }
                    >
                      Restore
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {selectedDraft && (
        <ReleaseRecordEditor
          key={selectedDraft.id}
          releaseId={selectedDraft.id}
          readOnly={user.role === 'viewer'}
          onMessage={onMessage}
        />
      )}

      <section className="rounded-xl border bg-background p-5">
        <h2 className="mb-3 font-semibold text-lg">Audit history</h2>
        <ol className="space-y-2">
          {audit.map((item) => (
            <li key={item.id} className="border-b py-2 last:border-0">
              <p className="text-sm">
                <strong>{item.action}</strong> · {item.entityType}
                {item.entityKey ? ` · ${item.entityKey}` : ''}
              </p>
              <p className="text-muted-foreground text-xs">
                {item.summary} · {new Date(item.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export default AdminApp;
