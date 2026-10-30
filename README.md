# Rejestr schroniska

Ewidencja zwierząt w schronisku: przyjęcia, leczenie, profilaktyka z
przypomnieniami, historia wagi, adopcje. Built on top of the old
_Rejestr zwierząt_ (hycel-baza): same stack, same login-by-code, same split
into gminy. The difference is that this one isn't tied to a single operator.
The shelter's name is a setting, so any organisation can run its own copy.

- **Admin** (the shelter) adds and edits everything.
- **Each gmina** logs in with its own code and sees **only its own** animals,
  read-only. Enforced on the server, not in the browser.
- UI in Polish, code comments in whatever language came first.

Stack: **Next.js 14 (App Router)** + **Supabase** (Postgres + Storage). All
data access goes through Server Actions with the `service_role` key, which
never reaches the browser.

---

## Co jest w bazie

| # | Pole | Gdzie |
|---|---|---|
| 1 | data przyjęcia | `animals.data_przyjecia` |
| 2 | gmina | `animals.gmina_id` (+ copied `gmina_name`) |
| 3 | nadany mikrochip | `animals.chip` |
| 4 | opis | `animals.opis` |
| 5 | imię | `animals.imie` |
| 6 | płeć | `animals.plec` (samiec / samica / nieustalona) |
| 7 | zabiegi weterynaryjne (data + jaki) | `animal_events` typ `zabieg` |
| 8 | szczepienie – wścieklizna | `animal_events` typ `wscieklizna`, every 12 months |
| 9 | szczepienie – choroby zakaźne | `animal_events` typ `zakazne`, every 12 months |
| 10 | waga (historia) | `animal_events.waga`, on any entry (+ typ `waga` for weighing only) |
| 11 | pchły i kleszcze | `animal_events` typ `pchly`, every month |
| 12 | pasożyty wewnętrzne | `animal_events` typ `pasozyty`, every 6 months |
| 13 | status + data adopcji + dane adoptującego | `animals.status`, `data_adopcji`, `adoptujacy` |
| 14 | zdjęcie | `animals.zdjecie` (Storage) |

Every vet entry is one row in `animal_events`, so the whole history stays
visible (all previous flea treatments, all vaccinations and so on). The
next due date (`nastepny`) gets filled in automatically from the interval
above and can be edited, for example when a vaccine is valid for 3 years.

Status has two extra values beyond the brief (*zwrócony właścicielowi*,
*inny*), because dogs sometimes go home. Drop them from `lib/care.js` if
they're not wanted.

### Przypomnienia

- Bell + red/amber strip at the top: overdue and coming up soon.
  Warnings start 5 days ahead for fleas, 14 days for internal parasites
  and 30 days for vaccinations.
- Only animals **still in the shelter** generate reminders.
- The reminders panel works by type: tick the dogs, enter the date and
  product, click **Zapisz podanie**. That's how the monthly flea round
  gets logged for the whole shelter in one go.
- Optional email: the daily cron sends a digest of what's due. Each dose
  is emailed at most twice: once when the date gets close, once more if
  it goes past the date.

### RODO

- Adopter data is **hidden on prints by default**. The print toolbar has
  a toggle (*Z danymi adoptujących / Ukryj dane*). The toggle reloads the
  page from the server, so hidden data isn't in the document at all, not
  just covered up with CSS.
- In the table it's blurred until you click the eye icon.
- Gminy **don't see** adopter data at all unless the admin turns it on in
  Settings. When it's off, the data never leaves the server.
- The adopter fields are wiped automatically when the status changes from
  *adopcja* to something else.

---

## 1. Supabase

1. New project at https://supabase.com (free tier is fine).
2. **SQL editor** → paste [`supabase/schema.sql`](supabase/schema.sql) →
   Run. This creates the tables, RLS, the `animal-photos` bucket and some
   sample data. Delete the bottom block if you want an empty start.
3. **Project Settings → API** → copy the Project URL and the
   `service_role` key.

## 2. Env

```bash
cp .env.local.example .env.local
```

| Variable | |
| --- | --- |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role (server only!) |
| `ADMIN_CODE` | admin login code |
| `SESSION_SECRET` | `openssl rand -base64 32` |
| `ORG_NAME` | optional, fallback name until it's set in Settings |

## 3. Run

```bash
npm install
npm run dev
```

Sample codes: `ADMIN_CODE` for admin, plus `LEG1`, `JAB1`, `NIE1` for the gminy.

---

## Deploy

**Vercel:** import the repo, add the env vars, deploy. `vercel.json`
schedules the daily cron.

## Email (backup co 5 dni + przypomnienia)

Same as the old app: an ordinary mailbox over SMTP.

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (optional)
- `CLIENT_EMAIL`: where backups go
- `REMINDER_EMAIL`: optional, a different inbox for vet reminders (for
  example the shelter vet). Defaults to `CLIENT_EMAIL`.
- `CRON_SECRET`: Vercel uses it to authorise the cron call
- `APP_URL`: optional, adds an "open the app" link to the reminder email

Gmail needs an App Password (2FA → App passwords), not the normal password.

The backup is a single Excel file with two sheets (*Zwierzęta*, *Historia
leczenia*) plus two CSVs. It **does** contain adopter data, so it only
goes to the client's own inbox.

Test: `GET /api/cron/export?force=1` with `Authorization: Bearer CRON_SECRET`.

---

## Layout

```
app/
  page.js            session gate, loads data
  actions.js         server actions: animals, vet entries, gminy, settings
  druk/              print: register table (A4 landscape) + karta zwierzęcia
  api/export         CSV / XLSX download (admin)
  api/cron/export    daily: backup + reminders
components/
  Login.jsx
  AppShell.jsx       the whole dashboard
lib/
  care.js            intervals, due dates, reminders: shared by UI, print and email
  data.js            who sees what (gmina scoping, RODO stripping)
  export.js, email.js, session.js, auth.js, supabase.js
supabase/schema.sql
```
