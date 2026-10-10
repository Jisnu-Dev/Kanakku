# Kanakku

Split trip expenses with a group. One shared link, no sign-up.

Next.js (App Router) + Postgres. Built for Vercel + Neon.

## Deploy (about 5 minutes)

1. Push this folder to a GitHub repo.
2. On Vercel: **Add New → Project**, import the repo. Don't deploy yet.
3. In the project: **Storage → Create Database → Neon**. This creates the database and
   adds `DATABASE_URL` to the project for you. (If you already have a Neon project, add
   its **pooled** connection string as `DATABASE_URL` under Settings → Environment Variables.)
4. Deploy. Open the site, create the trip, share the link in your group chat.

There is no migration step. The app creates its tables the first time it connects
(`lib/db.ts`).

On each phone: open the link, pick your name, then use the browser menu's
"Add to Home screen" to install it like an app.

## Run locally

```bash
cp .env.example .env.local   # paste a Postgres connection string
npm install
npm run dev
npm test                     # split and balance maths
```

## How it works

- **Access**: a trip lives at `/t/<16 random characters>`. Anyone with the link can read
  and write, so share it only with the group. Each phone remembers who you are locally.
- **Money** is stored as integer paise. Balances are never stored; they are recomputed
  from the ledger every time (`lib/balances.ts`).
- **Splits** (`lib/split.ts`): equal, exact amounts, percent, shares, and by item. The
  server recomputes every split, so stored amounts always add up to the bill. Leftover
  paise go to the largest remainders, rotating between people across expenses.
- **Kitty**: contributions count as money paid in. Whoever holds the kitty is charged
  for what is left in it, so balances still sum to zero.
- **People**: someone with recorded expenses can't be deleted, only marked as left.
- **History**: every change is logged with who made it and what changed. Deleted
  expenses can be restored from the Group tab.
- **Tickets**: PDFs or photos (up to 20 MB each) of bus, train and flight tickets, entry
  passes and stay bookings. They are stored in Postgres and open full screen inside the app,
  with zoom and download. Vercel rejects any request or response over 4.5 MB, so files are
  uploaded and fetched in 2 MB pieces (`ticket_chunks` table, `TICKET_CHUNK` in
  `lib/constants.ts`). For PDFs, the type, route or venue, date, ticket number and passengers
  are read from the ticket's own text in the browser (`lib/ticketParse.ts`, written against
  redBus e-tickets). `public/pdf.worker.min.mjs` is a copy of
  `node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs`; copy it again if you upgrade pdfjs-dist.
- **Receipts** are shrunk in the browser (about 150 KB each) and stored in Postgres.
- **Sync**: the page refetches every 6 seconds and on focus. Saves for one trip are
  serialised with a row lock, so simultaneous edits don't clash.

## Layout

```
app/                    pages and API routes
  api/trips/[id]/       GET the whole trip, POST { action, actorId, payload }
components/             screens and forms
lib/split.ts            split maths          lib/balances.ts   balances + settle-up
lib/store.ts            validation, actions  lib/db.ts         schema + connection
```
