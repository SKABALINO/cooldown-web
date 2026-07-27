# Cooldown — website

The web version of Cooldown, wired to a Supabase backend so your shelf is saved to your account and syncs with the browser extension. Built with Vite + React.

Everything here runs on free tiers. **Initial cost: $0.**

---

## 1. Set up the backend (Supabase) — ~5 min

1. Create a free account at supabase.com and click **New project**. Pick a name and a database password (save it somewhere).
2. When the project finishes provisioning, open **SQL Editor → New query**, paste the entire contents of `supabase/schema.sql`, and click **Run**. This creates the tables, security rules, live sync, and shelf sharing RPCs.
3. **Already have an older Cooldown database?** Run `supabase/migrations/002_shelf_visibility.sql` instead (or in addition) to add profiles + sharing without wiping data.
4. Go to **Project Settings → API** and copy two values:
   - **Project URL**
   - **anon public** key
5. *(Optional, smoother testing)* Under **Authentication → Providers → Email**, you can turn off "Confirm email" so new sign-ups work instantly without a confirmation link. Leave it on if you want email verification.

## Shelf visibility (private / shareable / public)

Open **Settings** (gear icon) on your shelf:

| Mode | Who can see it | How |
| --- | --- | --- |
| **Private** | Only you | Default. No links work. |
| **Shareable** | Anyone with your secret link | Copy `/s/<token>`. Not listed publicly. |
| **Public** | Everyone | Listed in `/registry` and at `/u/<username>`. Requires a username. |

Shared views are read-only. Personal notes stay private; visitors see cooling items, savings stats, and recent let-gos.

## 2. Run it locally — ~3 min

You need [Node.js](https://nodejs.org) 18+ installed.

```bash
cp .env.example .env        # then edit .env and paste your two Supabase values
npm install
npm run dev
```

Open the local URL it prints (usually http://localhost:5173). Create an account, and you're in.

## 3. Put it online (Vercel) — ~3 min

1. Push this folder to a GitHub repo.
2. At vercel.com, **Add New → Project**, and import that repo. Vercel auto-detects Vite.
3. Before deploying, add two **Environment Variables** (same names as in `.env`):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Click **Deploy**. You get a live `https://your-app.vercel.app` URL.

Netlify works the same way if you prefer it.

> Note: Vercel's free Hobby plan is for personal, non-commercial use. If Cooldown ever becomes a paid product, move to a paid plan.

---

## Connecting the browser extension

The extension and this website share the same item format. To make them read/write the **same** shelf, point the extension at this same Supabase project (add a sign-in to the extension popup and swap its local storage for Supabase calls). Until then, the extension's Export → website Import still moves data across by hand.

## Install as an app (PWA)

The site ships with a web app manifest + service worker. On mobile (and many desktop browsers), use **Add to Home Screen / Install** to open Cooldown full-screen like a native app.

## Notes

- The `anon` key is safe to expose in the browser — row-level security keeps private shelves private; public/shareable reads go through security-definer RPCs that omit personal notes.
- Free Supabase projects pause after ~7 days of no activity; the first request after that takes 20–30 seconds to wake. Fine for personal use.

## Project layout

```
src/
  main.jsx              app entry + PWA worker
  App.jsx               auth gate, tabs, shelf UI, routing shell
  Auth.jsx              sign in / sign up
  SettingsSheet.jsx     private / shareable / public controls
  store.js              Supabase reads/writes + sharing RPCs
  pages/
    RegistryPage.jsx    public shelf registry
    SharedShelfPage.jsx read-only /u/:user and /s/:token views
  index.css             design tokens + base styles
supabase/
  schema.sql            full schema for new projects
  migrations/           incremental SQL for existing projects
```
