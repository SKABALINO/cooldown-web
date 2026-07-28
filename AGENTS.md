# AGENTS.md

## Cursor Cloud specific instructions

This repo contains a single product: **Cooldown web** (`cooldown-web/`), a Vite + React
SPA backed by Supabase (auth + Postgres). All commands below run from `cooldown-web/`.

### Services

| Service | Command | Notes |
| --- | --- | --- |
| Frontend (Vite dev) | `npm run dev` | Serves on http://localhost:5173. Hot reloads. |
| Backend (local Supabase) | `supabase start` | Postgres/Auth/REST on http://127.0.0.1:54321, Studio on :54323. |

There is no separate lint or unit-test setup in this repo (no lint/test scripts in
`package.json`). "Build" is `npm run build` (Vite production build); dev uses `npm run dev`.

### Backend startup caveats (important, non-obvious)

- The app needs Supabase env vars. Copy `cp .env.example .env` and fill
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. For local dev these point at the local
  stack: URL `http://127.0.0.1:54321` and the anon key printed by `supabase start`
  (also retrievable via `supabase status`). Vite only reads `.env` at startup — restart
  `npm run dev` after editing it.
- Local Supabase requires Docker, which is pre-installed in the VM snapshot but the daemon
  is not auto-started. Start it once per session before `supabase start`:
  `sudo dockerd > /tmp/dockerd.log 2>&1 &` then `sudo chmod 666 /var/run/docker.sock`
  (the chmod lets the `ubuntu` user — and the Supabase CLI — reach the docker socket).
  Docker 29 is configured with the `fuse-overlayfs` storage driver and
  `containerd-snapshotter` disabled (see `/etc/docker/daemon.json`); do not change this.
- The repo's `supabase/migrations/002_shelf_visibility.sql` is an *incremental* migration
  that assumes `schema.sql` was already applied (it references the `wants` table that only
  `schema.sql` creates), so a plain `supabase start` against an empty DB fails. To make
  local bootstrap reproducible, `supabase/config.toml` disables migrations
  (`[db.migrations] enabled = false`) and loads the full `supabase/schema.sql` via
  `[db.seed]`. Do not "fix" the migration or re-enable migrations for local dev.
- Email confirmation is OFF in local Supabase by default, so sign-up logs you straight in
  (no inbox step). Sent emails, if any, are viewable in Mailpit at http://127.0.0.1:54324.
- Alternatively, point `.env` at a hosted Supabase project and run `schema.sql` in its SQL
  editor (see `cooldown-web/README.md`) instead of running the local stack.
