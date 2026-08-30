# ExperienceHub — Backend

Fastify + Drizzle + PostgreSQL API service. Standalone; the Next.js frontend talks to it over HTTP.

## Setup

```bash
yarn install
cp .env.example .env        # then fill in DATABASE_URL and the secrets
yarn db:generate            # create the initial SQL migration from the schema
yarn db:migrate             # apply migrations to the database
yarn dev                    # start on http://localhost:4000
```

Generate secrets:

```bash
openssl rand -base64 48     # AUTH_SHARED_SECRET (must match the frontend)
openssl rand -base64 24     # INTERNAL_API_SECRET
```

## Scripts

| Script            | Purpose                                            |
| ----------------- | ------------------------------------------------- |
| `yarn dev`        | watch-mode dev server (tsx)                        |
| `yarn build`      | compile to `dist/`                                 |
| `yarn start`      | run compiled server                               |
| `yarn typecheck`  | `tsc --noEmit`                                     |
| `yarn db:generate`| generate a migration from schema changes          |
| `yarn db:migrate` | apply pending migrations                           |
| `yarn db:push`    | push schema straight to DB (dev only, no history)  |
| `yarn db:studio`  | Drizzle Studio                                     |

## Layout

```
src/
  index.ts                 boot + graceful shutdown
  app.ts                   Fastify instance, plugins, error envelope, route mounting
  config.ts                Zod-validated env (fails fast on boot)
  db/
    client.ts              postgres-js pool + drizzle instance
    schema/                one file per domain; index.ts re-exports all
    migrations/            generated SQL (after db:generate)
  lib/
    errors.ts              AppError + helpers -> { error: { code, message } }
  plugins/
    security.ts            helmet, cors, rate-limit, under-pressure
    auth.ts                @fastify/jwt verify + app.authenticate / app.requireRole
  modules/
    health/                /health, /health/ready
    internal/              /internal/auth/sync  (server-to-server, shared secret)
    categories/            reference module: routes -> service -> schema
```

## Adding a module

Copy `modules/categories/`:

- **`*.schema.ts`** — Zod schemas for params / query / body / response. Nothing else imports Drizzle here.
- **`*.service.ts`** — framework-agnostic functions `(db, actor, input) => result`. All business logic and transactions. Throw `AppError` helpers.
- **`*.routes.ts`** — thin: attach schemas, `onRequest: app.requireRole(...)` for protected routes, call the service.

Then register it in `app.ts` with its `/api/v1/...` prefix.

## Auth model

The backend never runs OAuth. The frontend (Auth.js) signs a short-lived HS256 JWT
with `AUTH_SHARED_SECRET` carrying `{ sub: userId, role }` and sends it as
`Authorization: Bearer <token>`. `app.authenticate` verifies it; `app.requireRole('admin')`
gates admin routes. On login the frontend also calls `POST /internal/auth/sync` to
upsert the user row.
