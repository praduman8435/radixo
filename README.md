# Radixo — student mess app

A web app for running Radixo student mess outlets. Students pick a ready-made weekly menu or build their own, book it for 1 week to 6 months, pay by UPI, and show a QR pass at the counter. The admin side runs the mess day to day.

## What's in it

**Students** (phone-first, no login needed to browse)
- **Home:** live "serving now" status, today's meals, ready-made weeks, the "build your own" story, booking lengths with their discounts, the chef story, timings with directions, FAQ
- **Menus:** a swipe deck of ready-made weekly menus (each with its own price), or **build your own**: day by day, add dishes for breakfast, lunch, snacks and dinner from the kitchen's options, with a live total. Eat 4 days a week or 7, at any budget
- **Login only when needed** (saving or booking a menu, paying, profile): mobile number → OTP → name. With `VITE_OTP_REQUIRED=false` (the default) the code isn't checked and can be skipped
- **Booking:** any menu for 1 week, 1 month, 3 months or 6 months (default 0 / 5 / 8 / 12% off, set in Settings), starting from the next meal at least 24 hours away (or a later day the student picks). A booking covers exactly 7 days of meals per week booked, so a start on Thursday lunch ends with the next Thursday's breakfast. The price is locked and the menu carries over each week. Any meal can be changed up to 24 hours before it; a costlier change is paid first, a cheaper one isn't refunded. There is no weekly deadline
- **Not coming:** mark a date range at least 24 hours before (counted to midnight India time). The full value of those booked meals goes to the **wallet** and is used automatically on the next booking. Undo is allowed under the same notice
- **Wallet:** balance, bookings, payments being checked, wallet history, and UPI checkout (QR, UPI app link, 12-digit UTR). If the wallet covers the whole booking it's confirmed at once
- **Profile:** meal pass QR, today's plate, the week's menu, "not coming", payments, profile details

**Admin and staff** (`/admin`, password login via "Team login" in the footer → `/welcome`)
- Overview with all four meals, check-in (code, phone, name or QR scan), kitchen prep from everyone's picks
- Weekly menu editor (breakfast, lunch, snacks, dinner; 1–4 options per line; priced ready-made menus with their meals), dishes with price and photo, members, approvals (UPI payments; "not coming" list), add money to a wallet (cash at the counter, refunds), feedback, wastage, settings (meal timings, booking discounts, notice hours)

Roles: **student**, **staff** (check-in, prep, wastage), **admin** (everything).

## Login and OTP

Students log in with their mobile number. There's no WhatsApp/SMS provider yet, so while `VITE_OTP_REQUIRED=false`, **anyone can log in to a student account by typing its number**. That's fine for testing; don't launch like this. Owner and staff accounts always use a password and can't be opened through the student login.

To turn real OTP on: Supabase → Authentication → Providers → Phone, connect Twilio (SMS or WhatsApp), then set `VITE_OTP_REQUIRED=true`. In the demo, the code is `123456` when OTP is required.

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:5173. With no Supabase keys the app runs in **demo mode**: data lives in your browser, seeded with a realistic week. Demo logins: student `98110 00001` (any OTP), owner `98000 00000`, counter staff `98000 00001` (password `demo1234`, via "Team login" in the footer). To start the demo over, clear the site's local storage.

## Go live with Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste `supabase/schema.sql`, and run it. Then run the files in `supabase/migrations/` (002, 003, 004, 005) in order, the same way. Together they create the tables, row-level security, the booking and wallet functions, and starter dishes. Both are safe to run again.
3. Copy `.env.example` to `.env.local` and fill in **Project Settings → API**: the project URL and the `anon` public key.
4. Turn off "Confirm email" (Authentication → Providers → Email). Open the app, log in once as a student with your number, then in the SQL editor make that account the owner and give it a password:
   ```sql
   update profiles set role = 'admin' where phone = '98xxxxxxxx';
   ```
   Then set its password in Authentication → Users, and log in through "Team login".
5. Log in again. In **Settings**, set the real UPI ID, WhatsApp number and address. In **Weekly menu**, create the first week and publish it.


## Deploy (Vercel)

Import the repo in Vercel, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, and deploy. `vercel.json` already routes all paths to the app.

## How it fits together

| Path | What |
| --- | --- |
| `src/lib/types.ts` | Data model (matches `supabase/schema.sql`) |
| `src/lib/logic.ts` | Business rules: member status, picks, prep-sheet maths |
| `src/lib/booking.ts` | Booking rules: durations and discounts, weekly carry-over, "not coming" credit (mirrors the SQL functions) |
| `src/lib/data.ts`, `src/lib/admin.ts` | Loaders and actions (approve payment, check in, copy week…) |
| `src/lib/backend/` | One interface, two stores: `supabase.ts` and the in-browser `local.ts` demo (`seed.ts`, `localRpc.ts` for the booking functions) |
| `src/pages/app/` | Student screens |
| `src/pages/admin/` | Admin and staff screens |

Security lives in the database. Row-level security decides who can read and write what: students can't change their own role or change picks after the deadline, and each UPI reference can be used once. Money is never trusted from the browser: students book, pay from the wallet and mark "not coming" only through Postgres functions (`book`, `mark_skip`, `cancel_skip`) that compute prices and credits themselves. Only the owner can approve or reject payments (`approve_payment`, `reject_payment`) or add wallet money.

## Known limits

- Pending payments are priced when submitted. If the owner approves one much later, the booking still starts on the date quoted then.
- Payments are checked by hand against your UPI app. There's no gateway integration yet.
- QR scanning uses the browser's built-in `BarcodeDetector`. Where it isn't available (iPhone Safari, Firefox), staff type the code instead.
