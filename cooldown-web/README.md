# Cooldown — website

The web version of Cooldown, wired to a Supabase backend so your shelf is saved to your account and syncs with the browser extension. Built with Vite + React.

Everything here runs on free tiers. **Initial cost: $0.**

---

## 1. Set up the backend (Supabase) — ~5 min

1. Create a free account at supabase.com and click **New project**. Pick a name and a database password (save it somewhere).
2. When the project finishes provisioning, open **SQL Editor → New query**, paste the entire contents of `supabase/schema.sql`, and click **Run**. This creates the tables, security rules, and live sync.
3. Go to **Project Settings → API** and copy two values:
   - **Project URL**
   - **anon public** key
4. *(Optional, smoother testing)* Under **Authentication → Providers → Email**, you can turn off "Confirm email" so new sign-ups work instantly without a confirmation link. Leave it on if you want email verification.

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

## Make it feel like a phone app (optional)

Because it's a website, you can add a web app manifest + service worker to make it an installable PWA — it'll go to your home screen and open full-screen like a native app, no app store needed. Ask and I'll wire that up.

## Notes

- The `anon` key is safe to expose in the browser — it only permits what your row-level security policies allow, which here is "each user sees only their own rows."
- Free Supabase projects pause after ~7 days of no activity; the first request after that takes 20–30 seconds to wake. Fine for personal use.

## Project layout

```
src/
  main.jsx           app entry
  App.jsx            the whole UI (home, shelf, insights) + auth gate + live sync
  Auth.jsx           sign in / sign up screen
  store.js           all Supabase reads/writes
  supabaseClient.js  Supabase connection
  index.css          design tokens + base styles
supabase/schema.sql  run once in Supabase
```
