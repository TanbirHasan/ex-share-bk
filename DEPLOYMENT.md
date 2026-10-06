# Where this is hosted

| Layer | Provider | Plan | Notes |
|---|---|---|---|
| API (this repo) | [Render](https://render.com) | Free Web Service | Deploys from `main` on push. Spins down after ~15 min idle — first request after that takes 30–50s to wake up. |
| Database | [Neon](https://neon.tech) | Free tier Postgres | Serverless Postgres. Use the **pooled** connection string (has `?sslmode=require` built in). |
| Image uploads | [Cloudinary](https://cloudinary.com) | Free tier | Product/review images. Chosen because Render's free-tier disk is ephemeral — local storage would lose files on every deploy. Uploads land in an auto-created `experiencehub/` folder. |
| Frontend | [Vercel](https://vercel.com) | Free | Repo: `ex-share-fr`. See that repo's `DEPLOYMENT.md`. |

Live URL: `<fill in your Render service URL here, e.g. https://ex-share-bk.onrender.com>`

## Render service settings
- **Root directory:** `.` (this repo's root is the whole backend app)
- **Build command:** `yarn install --production=false && yarn build`
  — the `--production=false` is required: Render sets `NODE_ENV=production` during the build step too, and Yarn Classic skips `devDependencies` (typescript, @types/node, drizzle-kit) when that's set, which breaks `tsc`.
- **Start command:** `yarn start`
- **Health check path:** `/health`

## Environment variables (set in Render's dashboard, not committed)
| Key | Where it comes from |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon dashboard → your project → Connection string (pooled) |
| `AUTH_SHARED_SECRET` | Generated once (`openssl rand -base64 48`-style) — **must exactly match** the frontend's `AUTH_SHARED_SECRET` on Vercel |
| `INTERNAL_API_SECRET` | Generated once — **must exactly match** the frontend's `INTERNAL_API_SECRET` on Vercel |
| `CORS_ORIGIN` | The live Vercel URL, e.g. `https://ex-share-fr.vercel.app` (comma-separate if more than one origin needs access) |
| `LOG_LEVEL` | `info` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary dashboard home page |
| `CLOUDINARY_API_KEY` | Cloudinary dashboard home page |
| `CLOUDINARY_API_SECRET` | Cloudinary dashboard home page |
| `PORT` | Don't set — Render injects its own and the app already reads `process.env.PORT` |
| `TRANSLATE_ENDPOINT` | Leave unset in prod — the on-demand Translate feature just degrades gracefully (503 + "not set up" message) without it |

Full schema + defaults: `src/config.ts`.

## One-time setup after creating a fresh database
Run from your own machine, pointed at the Neon connection string:
```
cd backend
# PowerShell: $env:DATABASE_URL="<neon connection string>"
yarn db:migrate         # creates all tables
yarn seed:catalog       # optional — sample categories/brands/products
yarn make:admin you@email.com "Your Name"   # grants admin role
```

## Magic-link sign-in is OFF
Resend's free sandbox sender (`onboarding@resend.dev`) only delivers to the account owner's own email, so it can't reach real users in production. Disabled via a `MAGIC_LINK_ENABLED = false` flag (not deleted) in:
- `src/modules/internal/internal.routes.ts`
- the frontend's `app/api/auth/magic-link/route.ts` and `app/login/page.tsx`

Google sign-in is the only live auth path. **To re-enable:** buy a domain, verify it in Resend, update `RESEND_FROM` on the frontend, flip all three `MAGIC_LINK_ENABLED` flags back to `true`, redeploy both apps.

## Redeploying
Push to `main` — Render auto-deploys. If you change `CORS_ORIGIN` or any other env var, Render redeploys automatically on save too.
