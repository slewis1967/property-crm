# Brief for recording the help videos (demo environment)

You earlier wrote the written guides for a group of CRM sections in
`utils/help/sections/<your file>.ts`. Now record a walkthrough video for each of
your guides. Work only in `C:/Users/sean/property-crm-help`. No git commands
that change state. Do not start or stop servers.

## The environment (already running)

- Demo CRM: http://localhost:3111 . It is connected to a LOCAL demo database
  with made-up people, and holds NO email, SMS, AI or NEXUS keys. Nothing can
  leave this machine, so you may click anything, including save and delete.
- Demo database: `docker exec -i supabase_db_crm-help-studio psql -U postgres`
  (148 tables, same structure as the real CRM, mostly empty).
- Stand-in NEXUS API on http://127.0.0.1:8799 (`scripts/help-videos/mock-nexus.mjs`,
  read its header). Pages that read from NEXUS get whatever you mock.
- NEVER connect to anything that is not localhost / 127.0.0.1. Never use the
  Supabase MCP tools or any `*.supabase.co` address. Never read or copy real
  data from anywhere into the demo.

## What to read first

`scripts/help-videos/README.md`, `record.mjs` (the helper API), and the working
example `scenarios/lenders-find-policy.mjs`.

## For each guide

1. Seed what the screen needs. Put it in `scripts/help-videos/seed/10-<your group>.sql`
   (one file, yours alone). It must be safe to re-run (fixed ids, `on conflict do
   nothing`, or delete-then-insert of your own rows). Apply with
   `docker exec -i supabase_db_crm-help-studio psql -U postgres -v ON_ERROR_STOP=1 < seed/10-<group>.sql`.
   Check real column names with `\d tablename` first.
   - The shared cast is in `seed/00-core.sql`: 12 made-up contacts (Olivia
     Bennett, Liam Nguyen, ...). Use them. Do NOT delete or rename them. If a
     scenario deletes or heavily changes a record, seed your own extra record
     for it so re-recording still works.
   - All data must be invented and obviously harmless: `@example.com` emails,
     `0491 570 xxx` phones, invented company names (not real builders, lenders,
     firms or people). Exception: you may leave real bank/lender names that are
     already committed in the repo's lender research pack.
2. If the page reads from NEXUS, add routes in `scripts/help-videos/mock-nexus/<your group>.mjs`
   (yours alone; find the endpoints and response shapes in the CRM code that
   calls NEXUS). New files are picked up without a restart.
3. Write `scripts/help-videos/scenarios/<guide id>.mjs`. Do NOT set
   `noClientData`. Narration (`say`): plain Australian English for a
   non-technical office worker; one or two short spoken sentences per step; no
   symbols, quotes, emoji or em dashes; first line says what the video shows;
   follow the written guide's steps. 5 to 9 steps, 30 to 75 seconds.
4. Record: `cd scripts/help-videos && HELP_DEMO_DATA=1 HELP_BASE_URL=http://localhost:3111 node record.mjs <id> --no-manifest`
   (other helpers are recording at the same time; `--no-manifest` avoids
   everyone rewriting the same file. I rebuild it at the end.)
5. Verify: pull 5 frames spread through the mp4 into one tiled PNG under
   `scripts/help-videos/.work/<your group>/` with ffmpeg and LOOK at it. The cursor must reach
   the right controls, captions present, no error banners, no developer error
   text, no empty "nothing here" screen where the guide expects data. Fix and
   re-record until right.

## Things that cannot really happen in the demo

- Sending email/SMS, AI generation and anything else needing an outside
  service will fail (no keys). If the call is made by the BROWSER to a CRM
  `/api/...` route, you may answer it inside the scenario with
  `h.page.route(...)` returning a realistic made-up success, so the video shows
  what staff would see. Say so in a comment at the top of the scenario.
- If the page needs an outside service on the SERVER side and cannot be shown
  honestly, skip that guide and report it.
- Browser pop-ups (confirm/alert) are auto-accepted by the recorder and do not
  appear in the video; word the narration so that still makes sense.

## If the written guide is wrong

The video must match the real screen. If a written step is wrong, fix the guide
in your own `utils/help/sections/<file>.ts` and tell me.

## Order and budget

Do the FIRST guide of every section before any second guides, so every section
gets a video early. Then work through the rest. If you are running out of room
to work, stop cleanly and report.

## Report back (short)

A table: guide id | recorded / skipped | seconds | note. Then: guide text you
corrected, CRM bugs you hit on screen, and anything you changed in `record.mjs`
(avoid; if it has a real bug tell me exactly what you changed).
