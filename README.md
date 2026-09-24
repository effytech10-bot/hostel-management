# Rangdhanu Hostel — Management & Accounting

Next.js (App Router) + TypeScript · Supabase (Postgres, Auth) · Drizzle ORM · Tailwind + shadcn-style UI · Vitest

## First-time setup (Windows / macOS / Linux)

1. `npm install`
2. Create `.env.local` from `.env.example` and fill in the Supabase values.
3. `npm run db:migrate` — creates the tables in Supabase.
4. `npm run db:seed -- --name "Your Name" --phone 01XXXXXXXXX --password "at-least-8-chars"` — creates the organization and the first admin.
5. `npm run dev` → open http://localhost:3000 and log in with that phone number and password.

## Scripts

| Command                                           | What it does                                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| `npm run dev`                                     | Development server                                                                |
| `npm run build` / `npm start`                     | Production build / run                                                            |
| `npm run lint` · `npm run typecheck` · `npm test` | Checks — run all three before every commit                                        |
| `npm run format`                                  | Format all code with Prettier (120 columns, Tailwind class order)                 |
| `npm run db:generate`                             | After changing `src/server/db/schema/*`, create a new SQL migration in `drizzle/` |
| `npm run db:migrate`                              | Apply pending migrations to the database in `.env.local`                          |
| `npm run db:studio`                               | Browse the database                                                               |
| `npm run db:seed -- …`                            | Create the organization and first admin (safe to re-run)                          |

## Folder structure

```
src/
├─ app/                 Pages and server actions ("the door")
│   ├─ login/           Phone + password login
│   ├─ admin/           Admin area (layout checks role = admin)
│   ├─ cashier/         Cashier area
│   └─ student/         Student area
├─ components/
│   ├─ ui/              Buttons, inputs, cards, tables
│   └─ layout/          App shell and navigation (nav.ts lists every module)
├─ lib/                 Pure helpers usable anywhere: money, dates, phone, zod schemas
├─ server/              Never sent to the browser
│   ├─ auth/            getSessionUser, requireRole, assertRole
│   ├─ db/              Drizzle client and schema
│   ├─ services/        Business operations (validation → permission → transaction → audit)
│   ├─ supabase/        Supabase clients (session client, admin client)
│   ├─ audit.ts         writeAudit()
│   ├─ env.ts           Validated environment variables
│   └─ errors.ts        AppError, ActionState
└─ proxy.ts             Refreshes the login session, protects /admin /cashier /student
scripts/seed.ts         First organization + admin
src/server/domain/      Pure business rules (no database) with unit tests
src/components/students Student screens shared by the admin and cashier areas
drizzle/                SQL migrations (commit these)
```

## Rules for every change

1. **Money is integer paisa.** ৳8,000 = `800000`, ৳27.50 = `2750`. Use `parseTaka` / `formatTaka` from `src/lib/money.ts`. Never use floats for money.
2. **All money logic and all writes run on the server** (`src/server/services`). Client components only display and submit forms.
3. **Every table has `org_id`**, and every query filters by the logged-in user's `orgId`. The product will be sold to other hostels later.
4. **Every business table has RLS enabled with no policies** (`.enableRLS()` in the schema). The browser can never read or write tables directly; the server connects with the database URL.
5. **Server actions follow one pattern:** `requireRole` → Zod `safeParse` → service function → `revalidatePath`. Services call `assertRole`, run changes in `db().transaction`, and call `writeAudit` in the same transaction.
6. **Nothing that involves money is deleted or edited in place later:** payments are voided with a reverse entry; closed months are locked and corrected with adjustments.
7. **Dates:** calendar dates are `YYYY-MM-DD` strings in Asia/Dhaka, billing months are `YYYY-MM` (`src/lib/dates.ts`). Timestamps are stored in UTC.
8. Files under `src/server/` that touch the database or secrets start with `import "server-only"`.

## Month-end (tokens)

Admin → Tokens shows a preview, then **closes last month** (meal settlement: meals × that month's rates vs the
meal deposit billed; the month is locked) and **makes this month's token** for every active student.
The first month-end must be done by hand; after that `/api/cron/month-end` (Vercel cron, 00:05 Dhaka every night)
does it automatically. Running it again only adds missing tokens. Set `CRON_SECRET` in Vercel.

## Joining and leaving

- **Admission** can make the first bill: advance (months of rent from Settings) + this month's rent, meal deposit and
  baburchi. Settings → "Joining or leaving in the middle of the month" decides: by days, or full month.
  The first bill is stored as an "admission" token, so the student never also gets a monthly token for that month.
- **Leaving** (admin, student page): preview, then confirm. Settles the month's meals up to the last day, gives back
  unused days (by-days rule), cancels the advance charge so the paid advance pays the dues, frees the seat and stops
  future tokens. If the hostel owes money back, record the refund (now or later).
- **Meals on/off by students**: a student can turn their own meals off (or back on) from their phone until the hour
  the admin picks in Settings (6–11 PM, the night before). After that only the office can change that day. Meals the
  office turned off stay off until the office turns them on. "Not allowed" in Settings = office only.
- **Reports** (admin, and cashier for their own buildings): dues & credit & student advance (current / former /
  batch), collections by day / account / building / person, meal settlement of a closed month, month summary per
  building, and (admin only) the audit log. Each has an "Excel (CSV)" download (`/api/reports/csv`).
- **Go-live** (admin → Dashboard → "Go-live checklist", or `/admin/go-live`): checklist of what must be ready.
  **Import** (`/admin/import`): download the Excel template, fill one row per student, upload, check, import.
  Missing buildings/rooms/seats are created. Seats start on the 1st of the chosen start month; the dues columns are
  posted as the opening balance of the month before (ledger `opening`; advance already paid = `opening_payment`),
  so they show as "previous due" on the first token. Re-uploading the same file skips students already imported.
  Then run the first month-end by hand on the 1st of the start month.

## Deployment

Vercel, region `bom1` (Mumbai, same region as the Supabase project) — see `vercel.json`.
Set the same variables as `.env.local` in the Vercel project settings.

## Supabase settings

- Authentication → Sign In / Providers: **Allow new users to sign up = OFF**, Email provider ON, Confirm email OFF.
  Logins are created only by an admin (or the seed script). Users log in with their phone number; an internal email is used behind the scenes.
