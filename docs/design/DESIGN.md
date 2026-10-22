# Rangdhanu UI design spec (from the client prototype)

Source of truth for the look: `docs/design/prototype.html` (open it in a browser, "লাইভ ডেমো" tab).
Copy the **look** only. The prototype's numbers, labels and money rules are old (it still shows
"Baburchi bill", "Previous meal balance" etc.). Labels and rules always come from the real app code.

Light theme only (no dark mode).

## 1. Tokens (exact values)

| Token                      | Hex                               | Use                                     |
| -------------------------- | --------------------------------- | --------------------------------------- |
| bg                         | `#f2f3f8`                         | page background                         |
| surface                    | `#ffffff`                         | cards, sidebar, inputs                  |
| surface-2                  | `#f7f8fc`                         | hover rows, total rows, notes           |
| surface-3                  | `#eef0f6`                         | gray pills, progress track              |
| ink                        | `#161a2e`                         | main text                               |
| ink-2                      | `#3a405c`                         | secondary text, labels                  |
| muted                      | `#666d8c`                         | descriptions, table headers             |
| faint                      | `#9aa0ba`                         | very quiet text                         |
| line                       | `#e0e3ee`                         | borders                                 |
| line-2                     | `#eceef5`                         | inner dividers, table row lines         |
| brand                      | `#3340b0`                         | primary buttons, active nav text, links |
| brand-600                  | `#28339a`                         | primary hover                           |
| brand-50                   | `#eef0fc`                         | active nav background, info note        |
| brand-100                  | `#dde1fa`                         | info note border                        |
| head                       | `#12162a`                         | dark surfaces (toast)                   |
| ok / ok-bg / ok-line       | `#15803d` / `#effbf2` / `#bfe8cb` | paid, success                           |
| warn / warn-bg / warn-line | `#a15c07` / `#fff8e6` / `#f6dc9c` | partly paid, warnings                   |
| bad / bad-bg / bad-line    | `#b42323` / `#fdf1f1` / `#f4c9c9` | unpaid, errors, void                    |

Role accents (avatar circles, small dots, role labels):
admin `#3340b0` (50: `#eef0fc`), cashier `#0c7b7f` (50: `#e6f5f5`),
student `#c9581a` (50: `#fdf0e7`), automatic/system `#6b3fa0` (50: `#f3edfa`).

Radius: cards 12px, buttons and inputs 9px, small buttons 8px, pills 20px, modals 16px, phone due-card 14px.
Shadow (cards): `0 1px 2px rgba(22,26,46,.05), 0 2px 10px rgba(22,26,46,.05)`.
Shadow (modals, toasts): `0 24px 60px rgba(22,26,46,.22)`.
Focus ring: `3px solid rgba(51,64,176,.45)`, offset 2px.

## 2. Type

- Sans: **IBM Plex Sans** (400/500/600/700), Bangla text: **Hind Siliguri** (400–700),
  numbers/IDs: **IBM Plex Mono** (500/600). Load with `next/font/google`.
- Body 14.5px / 1.5. Page title 22px bold. Card title 15px semibold. Card description 12.5px muted.
- Table 13.5px, table header 12px muted semibold. Labels 12.5px semibold ink-2. Hints 11.5px muted.
- KPI value 25px bold, tabular numbers. Phone "amount due" 32px bold.
- All money and counts use tabular numbers. Token IDs, receipt numbers and TrxIDs use the mono font.

## 3. Components

- **Button**: 13.5px semibold, padding 8×13, radius 9, 1px line border, white. Variants:
  primary (brand bg, white text, hover brand-600), success (ok bg), ghost (no border/bg), small (5×10, 12.5px, radius 8),
  disabled 45% opacity.
- **Card**: white, 1px line border, radius 12, card shadow. Header padding 14/18/0 (title + optional description,
  actions on the right). Body padding 14/18/18.
- **Pill (status badge)**: 11.5px, weight 650, padding 2×8, radius 20, 1px border.
  ok = Paid, warn = Partly paid, bad = Unpaid / Void, gray = Carried / Left / neutral, brand ("new") = Early / Admission.
- **Table**: full width, header row 12px muted with bottom line, cells 9×10 with line-2 dividers, last row no line,
  money right-aligned tabular, clickable rows hover surface-2, total row bold on surface-2. Wrap in horizontal scroll on small screens.
- **KPI tile**: card with padding 14×16, label 12.5px muted, value 25px bold, small note 12px muted. Clickable KPI: border turns brand-100 on hover.
- **Field**: label 12.5px semibold ink-2, input/select 1px line, radius 9, padding 8×10, 14px; hint 11.5px muted.
- **Note (callout)**: flex row, radius 10, padding 10×12, 13px. Variants: neutral (surface-2), info (brand-50/brand-100),
  ok, warn.
- **Tabs / segmented filters**: buttons 13px semibold, radius 8, line border, active = brand bg + white text.
- **Modal**: overlay `rgba(18,22,42,.5)`, panel radius 16, header/body/footer separated by line-2.
- **Toast**: dark head bg, white 13.5px text, radius 10, bottom-right.

## 4. App shell (staff: admin and cashier)

- Left **sidebar 232px**, white, right border line, sticky full height, padding 16/12.
  - Top "who" block: 34px round avatar in role color with initial, name 14px bold, role 11.5px muted, divider below.
  - Nav items: 14px medium ink-2, padding 9×11, radius 9, 18px icon at 80% opacity; hover surface-2;
    **active = brand-50 background + brand text + weight 650**.
- **Main** area: padding 24/28/60 on desktop, 18/16/50 on phones. Page background bg.
- **Page header**: title 22px, description 13.5px muted, actions aligned to the right, 18px gap below.
- Below 1180px the sidebar becomes a top strip with wrapping nav (who block hidden). Grids of 4 become 2, then 1 below 560px.

## 5. Student portal (phone first)

- Max width ~420px centered. White top bar (hostel name + student name/role, small muted).
- Profile strip: 56–76px round avatar in student color with initial, name bold, "ID · building · room · seat" muted.
- **Due card**: radius 14, padding 16. Must pay: bg `#fdecec`, text `#7f1d1d`. Nothing to pay: bg `#e8f7ed`, text `#14532d`.
  Amount 32px bold tabular.
- Bottom tab bar (4 tabs, icon + 11.5px label), active tab in student color.
- Meal on/off cells: 40×32, radius 8, bold 13px. On = green (`#e8f7ed` / `#15803d` / border `#b9e3c6`),
  off = red (`#fdecec` / `#b42323` / `#f3c3c3`), office-only = surface-3 / muted.

## 6. Things that must NOT change

- `src/components/tokens/token-card.tsx` + `token-card.css` = the hostel's **paper token**. Its layout, rows,
  labels and serif font are the client's printed format. Only the page around it may be restyled.
- Anything under `src/server/`, `src/app/_actions/`, `src/app/api/`, `src/lib/validation/`, `drizzle/`: no changes
  (logic, money rules, queries). UI work only touches components, pages' markup/classes, `globals.css`, `layout.tsx`.
- Labels and words of the real app stay as they are unless a phase says otherwise.
