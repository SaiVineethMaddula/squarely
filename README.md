# Squarely

Split group expenses with friends and see who pays whom. Installable web app (PWA) for Android, iPhone and desktop. INR only.

**Stack:** React + TypeScript + Vite · Tailwind · TanStack Query · Supabase (Postgres, Auth, Row-Level Security, Realtime) · Cloudflare Pages

## Run it on your laptop

Needs Node 22, the Supabase CLI and OrbStack (or Docker) running.

```bash
npm install
supabase start                 # local database, auth and email catcher
cp .env.example .env.local     # then paste ANON_KEY from `supabase status`
npm run dev                    # http://localhost:5173
```

Sign-in emails don't really get sent locally. Open **Mailpit** at http://127.0.0.1:54324 to read them and get the 6-digit code.
Database dashboard (Supabase Studio): http://127.0.0.1:54323

## Tests

| Command | What it checks |
|---|---|
| `npm test` | Split maths, rounding, balances and settle-up (Vitest) |
| `npm run test:db` | Access rules and database functions (pgTAP), e.g. only the creator can edit an expense |
| `npm run test:e2e` | Full flow in a phone-sized browser: create group → add expenses → invite → claim name → settle up (Playwright) |
| `npm run build` | Type-check and production build |

`supabase db reset` wipes the local database and re-applies `supabase/migrations/`.

## Project layout

```
src/lib/money.ts       paise parsing and ₹ formatting
src/lib/splits.ts      equal / exact / percent / shares, exact rounding
src/lib/balances.ts    net balances, simplified and pairwise debts
src/lib/api.ts         all reads and writes to Supabase
src/pages/             screens
supabase/migrations/   database schema, access rules, write functions
supabase/tests/        database tests
supabase/templates/    sign-in email (includes the 6-digit code)
e2e/                   browser tests
```

All writes go through database functions (`create_expense`, `record_settlement`, `join_group`, …) that validate input. The app can only read tables directly, and only for groups you belong to.

## Deploying (production)

### 1. Supabase production project
1. In the Supabase dashboard, create a project `squarely-prod` (region: Mumbai `ap-south-1`).
2. Link and push the schema:
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
3. **Authentication → Email templates → Magic link:** paste `supabase/templates/magic_link.html` and set the subject to "Your Squarely sign-in code". Do the same for **Confirm signup**.
4. **Authentication → URL configuration:** set Site URL to `https://squarely.pages.dev` and add `https://*.squarely.pages.dev/**` and `https://squarely.pages.dev/**` to Redirect URLs.
5. **Authentication → SMTP:** connect a provider such as Resend (free tier). Supabase's built-in sender only allows a few emails per hour, so friends wouldn't get their codes without this.

### 2. Cloudflare Pages
1. Push this repo to GitHub.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick the repo.
3. Build settings: preset **React (Vite)**, build command `npm run build`, output `dist`.
4. Environment variables: `NODE_VERSION=22`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (from Supabase → Project Settings → API).
5. Deploy. Every push to `main` goes live; other branches get preview URLs.

### Later database changes
Add a new file under `supabase/migrations/` (`supabase migration new <name>`), test locally with `supabase db reset && npm run test:db`, then `supabase db push`.
