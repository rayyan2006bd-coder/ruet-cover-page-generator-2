# Backend deployment

GitHub Pages hosts only the frontend. Deploy `server/` and PostgreSQL separately, then build the frontend with the public HTTPS API origin in `PUBLIC_API`.

## Container contract

The root Docker build context uses `server/Dockerfile`. It builds and starts the Bun production bundle, runs as the non-root `bun` user, exposes port 8787, and checks `/api/v1/health`. The initial schema migration is explicitly forward-only; production corrections must be new migrations because applied migrations are immutable.

Before each production release:

```bash
bun --cwd server run db:migrate
bun --cwd server run db:seed   # only when reviewed seed changes are intended
bun --cwd server run start
```

Migrations are transactional through Drizzle. Do not automatically reseed on every production boot unless that behavior is explicitly desired.

## Render example

1. Create a managed PostgreSQL database and a Docker web service from this repository.
2. Use the repository root as the build context and `server/Dockerfile` as the Dockerfile.
3. Set `DATABASE_URL` from the managed database, `NODE_ENV=production`, `PORT=8787`, and a comma-separated `CORS_ORIGINS` containing the exact GitHub Pages origin. Do not use `*`.
4. Apply migrations, then create the initial owner with `bun --cwd server run admin:create-user` using private `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_ROLE` environment values. Remove `ADMIN_PASSWORD` from the deployed environment afterward. `ADMIN_TOKEN_HASH` is optional legacy compatibility only.
5. Run `bun --cwd server run db:migrate` as a pre-deploy command. Run the reviewed seed/import once when required.
6. Verify `/api/v1/health`, `/api/v1/ready`, `/api/v1/meta`, and `/api/v1/teachers?q=Sarowar` over HTTPS.
7. Build GitHub Pages with `PUBLIC_API=https://your-api.example` and redeploy the static frontend.

The same image works on Railway or Fly.io with managed PostgreSQL. Ensure the platform terminates TLS, forwards SIGTERM, honors the health check, and provides compression. The API already sends ETag and cache-control headers; gzip/Brotli is delegated to the edge platform.

## Required production variables

See `server/.env.example`. `DATABASE_URL` and `CORS_ORIGINS` are required and validated at startup. Wildcard production CORS is rejected. No default admin password exists. Session cookies are Secure in production, so the API and frontend must use HTTPS; CORS must name the exact frontend origin and allow credentials.

## Privacy

The backend stores only public department/teacher directory data and maintenance audit summaries. It receives no student ID, student name, course content, cover content, or generated PDF. Avoid access-log configurations that record arbitrary request bodies. The application continues to generate PDFs and retain personal histories exclusively in the browser.
