@AGENTS.md
@README.md

# Rangdhanu Chatrabash — hostel management & accounting

Client project built by Effy Tech. One hostel business with several buildings; students rent a seat, eat
meals, and pay a monthly "token" (bill). Three roles: **admin** (owner, everything), **cashier** (takes
payments, only their buildings), **student** (phone portal: own token, payments, meals on/off).
Phase 1 is finished and live. The README above has the setup, folder map, coding rules and the business
rules for tokens, payments, admission and leaving. Read it before changing anything.

## How to talk to the team

- Reply to the developers in **Bangla (Bengali script)**; English technical terms are fine. Code, comments,
  commit messages and UI labels stay in English, except the audit log page, which is Bangla on purpose.
- The people who use the app (hostel office) are not technical. Screens must use plain words.

## Things that must not break

1. **The database in `.env.local` is the LIVE Supabase database** (same one production uses). There is no
   separate dev database. Never reset, truncate or bulk-delete. Test only inside the demo hostel
   (org slug `rangdhanu-demo`) or in a temporary org whose slug starts with `zz-` and delete it afterwards.
   The real hostel is org slug `rangdhanu`.
2. **Never print, commit or paste secrets.** `.env.local` is gitignored; keep it that way.
3. **Money rules live in `src/server/domain` (pure, unit-tested) and `src/server/services`.** Do not move
   money logic into components. Change a rule only when the developer asks, and update its tests.
4. **The paper token** (`src/components/tokens/token-card.tsx` + `token-card.css`) is the hostel's printed
   format: Rent, Meal Deposit, Total, Pre. Meal Balance, Due:Advance/S.Charge, Due:Monthly Rent, To Be Paid.
   Do not change its rows, labels or layout unless asked. The token page, print, receipt and student phone
   all render this same card.
5. **Every write goes through a service that calls `writeAudit` in the same transaction.** New actions need
   a Bangla sentence in `src/server/domain/audit-text.ts` (`describeAudit`) so the admin's
   "কে কী করেছে (Audit log)" page stays readable, plus a test in `audit-text.test.ts`.
6. Schema change = edit `src/server/db/schema/*`, run `npm run db:generate`, commit the SQL in `drizzle/`.
   Migrations must be additive and safe on live data; ask before applying (`npm run db:migrate` hits live).

## Where the important logic is

| Area                                                              | Files                                                                                     |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Token rules (ID, lines, admission, early token, states)           | `src/server/domain/tokens.ts`, `src/server/services/token-engine.ts`, `tokens.ts`         |
| Ledger, dues, payment allocation                                  | `src/server/domain/billing.ts`, `src/server/services/ledger.ts`, `payments.ts`            |
| Meals (defaults, day exceptions, cut-off, locks)                  | `src/server/domain/meals.ts`, `src/server/services/meals.ts`, `student-portal.ts`         |
| Leaving / refunds                                                 | `src/server/domain/stay.ts`, `src/server/services/leave.ts`                               |
| Reports, CSV, audit log                                           | `src/server/services/reports.ts`, `reports-csv.ts`, `audit.ts`, `src/components/reports/` |
| Monthly cron (1st, 12:05 AM Dhaka; runs nightly, skips when done) | `src/app/api/cron/month-end/route.ts`, `vercel.json`                                      |
| Design system (tokens, fonts, components)                         | `docs/design/DESIGN.md`, `src/app/globals.css`, `src/components/ui/`                      |

## Workflow

- Branch from `main` (`feature/...`, `fix/...`, `ui/...`); never commit straight to `main`.
- Before every commit: `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` must pass.
- Small commits with conventional messages (`feat(tokens): ...`, `fix(ui): ...`).
- Do not push or merge unless the developer says so. Merging to `main` deploys to Vercel
  (https://hostel-management-theta-one.vercel.app).
- Report honestly: what changed, what was actually run and its result, and anything not verified.

## Project status (updated 11 Nov 2026)

### Done and live (Phase 1)

1. **Foundation:** phone + password login (Supabase Auth behind an internal email), roles, route protection
   (`src/proxy.ts`), forced password change on first login, admin password reset for staff and students.
2. **Property:** buildings, rooms (single and bulk create), seats, reserved seats, cashier-to-building access.
3. **Students:** admission with photo, profile edit, seat / rent change with history, Excel import
   (`/admin/import`) with opening dues, go-live checklist (`/admin/go-live`).
4. **Rates & settings:** per-month meal rates, meal deposit, advance months, one-time service charge,
   leaving rule (by days / full month), student meal cut-off hour (6-11 PM the night before, or not allowed),
   payment accounts (cash, bKash, Nagad, bank).
5. **Meals:** daily grid per building, holidays, monthly counts; students switch their own meals on/off
   from the phone; "Breakfast every day" switch (`meal_preferences`, exceptions in `meal_offs.turned_on`).
6. **Tokens + payments merged** (Oct 2026): one token per student per month with ID
   `YYMM-<building><room><seat>-<last 3 of Student ID>`; payments are saved on the newest token
   (`payments.token_id`); older tokens show "Carried"; overpayment becomes "Extra paid"; admin-only early
   token; automatic run on the 1st; meals already on a token are locked.
7. **Admission rule (changed 21 Oct 2026):** admission on any day makes the token for **that** month with the
   full month's rent + meal deposit + advance + one-time service charge. An earlier version billed the next
   month with the rest of the month as due: that rule is gone, do not bring it back.
8. **Paper token format kept** everywhere (token page, print 4-per-A4, receipt, student phone). A receipt
   opens the token with that payment highlighted; there is no separate money-receipt layout any more.
9. **Leaving:** preview then confirm; settles meals since the newest token, gives back unused rent (by-days
   rule), returns the paid advance against dues, refund now or later.
10. **Reports:** dues & advance, collections, meal settlement, month summary, CSV downloads.
11. **Dashboards** for admin and cashier; **student phone portal** (home, account, tokens, meals, profile).
12. **UI redesign** (9 phases, merged in PR #5) to match `docs/design/prototype.html`; spec in
    `docs/design/DESIGN.md`, plan and QA notes in `docs/design/UI-PLAN.md` and `QA-REPORT.md`.
13. **Audit log in plain Bangla** (PR #6, 11 Nov 2026): sentences, before -> after, filters by kind / person /
    date / student, summary tiles, Excel download.

Removed on purpose: the separate baburchi bill (the column still exists in `billing_rates`, the form sends 0)
and the "service charge this month" switch. Do not re-add them.

### Open items / known gaps

- **Leaving rule vs admission rule:** admission charges the full month, but with the "by days" leaving rule a
  student who leaves gets unused days of rent back. The client has not confirmed this is what they want.
- **Meal settlement report:** a student can now have more than one settlement in a month (early token,
  leaving) and each has a date range (`meal_settlements.from_date / to_date`); the report still lists them by
  `period` without showing the range.
- **Token lines:** "Advance due" and "Service charge due" carry no detail text; "Meal due" (unpaid meal money
  from older tokens) is shown separately from "Pre meal" by design.
- **`package-lock.json`** is slightly out of sync with `package.json` (`npm ci` can fail with "@emnapi
  missing"). Fix: run `npm install` once and commit the lock file.
- **Data:** everything in both orgs is test data so far. The real org (`rangdhanu`) has 4 test students with
  September admission tokens and October tokens; they must be cleared before real go-live (ask first).
  The demo org has students covering every payment case (paid, partial, unpaid, overpaid, void, early token,
  carried, left with refund).
- **Login history** is not in the audit log (only Supabase's own auth logs have it).
- A stale local branch `feature/readable-audit-log` exists on a teammate's laptop with an older copy of the
  audit-log work. It must not be pushed; the merged PR #6 is the real one.
- No automated end-to-end (browser) tests yet; only unit tests in `src/server/domain` and `src/lib`.
- Phase 2 scope has not been decided yet. Ask the developer before starting anything beyond fixes.

## Demo logins (demo hostel only)

Admin `01700000001` / `admin123` · Cashier `01700000002` / `cashier123` ·
Student Abir `01700000100` / `000100` (students: phone + last 6 digits of the phone).
