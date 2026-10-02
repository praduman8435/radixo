# Radixo — student mess app

A web app for running Radixo, the student mess near KIET, Muradnagar. Students join, pay by UPI, pick a ready-made weekly menu or build their own, and show a QR pass at the counter. The admin side runs the mess day to day.

## What's in it

**Students** (phone-first, no login needed to browse)
- **Home:** live "serving now" status, today's meals, ready-made weeks, the "build your own" showcase, offers, the chef story, hygiene promise, timings with directions, FAQ
- **Menu:** "Create/Choose a menu". Ready-made weekly menus with their own price ("see the menu", "Book Now"), or **build your own**: day by day, Add dishes for breakfast, lunch, snacks and dinner from the kitchen's options, with a live Total Budget
- **Login only when needed** (saving or booking a menu, paying, profile): mobile number → OTP → name. With `VITE_OTP_REQUIRED=false` (the default) the code isn't checked and can be skipped
- **Wallet:** plans and UPI checkout (QR, UPI app link, 12-digit UTR) for a plan, a ready-made week, or a custom menu. Plan holders pay only for meals their plan doesn't cover
- **Profile:** "QR code & your plan": meal pass, today's plate, this week's menu, pause requests, payments, profile details

**Admin and staff** (`/admin`, password login via "Owner & staff login" in the footer → `/welcome`)
- Overview with all four meals, check-in (code, phone, name or QR scan), kitchen prep from everyone's picks
- Weekly menu editor (breakfast, lunch, snacks, dinner; 1–4 options per line; priced ready-made menus with their meals), dishes with price and photo, members, approvals (plans and menu bookings), feedback, wastage, settings (timings for each meal, plans with their meals)

Roles: **student**, **staff** (check-in, prep, wastage), **admin** (everything).

## Login and OTP

Students log in with their mobile number. There's no WhatsApp/SMS provider yet, so while `VITE_OTP_REQUIRED=false`, **anyone can log in to a student account by typing its number**. That's fine for testing; don't launch like this. Owner and staff accounts always use a password and can't be opened through the student login.

To turn real OTP on: Supabase → Authentication → Providers → Phone, connect Twilio (SMS or WhatsApp), then set `VITE_OTP_REQUIRED=true`. In the demo, the code is `123456` when OTP is required.

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:5173. With no Supabase keys the app runs in **demo mode**: data lives in your browser, seeded with a realistic week. Demo logins: student `98110 00001` (any OTP), owner `98000 00000`, counter staff `98000 00001` (password `demo1234`, via "Owner & staff login" in the footer). "Reset demo" in the footer restores the demo data.

## Go live with Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste `supabase/schema.sql`, and run it. This creates the tables, row-level security, and starter plans and dishes.
3. Copy `.env.example` to `.env.local` and fill in **Project Settings → API**: the project URL and the `anon` public key.
4. Turn off "Confirm email" (Authentication → Providers → Email). Open the app, log in once as a student with your number, then in the SQL editor make that account the owner and give it a password:
   ```sql
   update profiles set role = 'admin' where phone = '98xxxxxxxx';
   ```
   Then set its password in Authentication → Users, and log in through "Owner & staff login".
5. Log in again. In **Settings**, set the real UPI ID, WhatsApp number and address. In **Weekly menu**, create the first week and publish it.


## Deploy (Vercel)

Import the repo in Vercel, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, and deploy. `vercel.json` already routes all paths to the app.

## How it fits together

| Path | What |
| --- | --- |
| `src/lib/types.ts` | Data model (matches `supabase/schema.sql`) |
| `src/lib/logic.ts` | Business rules: plan status, pauses, picks, prep-sheet maths |
| `src/lib/data.ts`, `src/lib/admin.ts` | Loaders and actions (approve payment, check in, copy week…) |
| `src/lib/backend/` | One interface, two stores: `supabase.ts` and the in-browser `local.ts` demo (`seed.ts`) |
| `src/pages/app/` | Student screens |
| `src/pages/admin/` | Admin and staff screens |

Security lives in the database: row-level security in `schema.sql` decides who can read and write what. For example, students can only submit *pending* payments, can't change their own role, and can't change picks after the deadline. Each UPI reference can be used once.

## Known limits

- Approving a payment and creating the plan are two separate writes from the admin's browser. If the connection drops between them, the payment shows approved without a plan. Move this into a Postgres function if it becomes a problem.
- Payments are checked by hand against your UPI app. There's no gateway integration yet.
- QR scanning uses the browser's built-in `BarcodeDetector`. Where it isn't available (iPhone Safari, Firefox), staff type the code instead.
