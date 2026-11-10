# CRM Memory Bank ("the Brain")

A persistent, self-improving memory layer for the CRM's AI features, mirrored
two-way into an Obsidian vault (`NextKey_CRM_Brain`) so Sean can read and curate
it by hand.

## Why

AI features that don't remember repeat themselves. The memory bank lets any
feature **recall** relevant past learnings before it generates, and **remember**
what it learned afterwards — so the advisor, deal-analyser, voice assistant and
outreach get steadily sharper instead of starting cold every time.

## Architecture

```
CRM AI features ── recall()/remember() ──►  utils/memory.ts
                                                  │
                                                  ▼
                                  Supabase: public.crm_memory   ◄── source of truth
                                                  ▲
            scripts/obsidian-memory-sync.mjs      │  (runs on the NEXUS box, cron)
            (direct PostgREST, bypasses CF Access)│
                                                  ▼
                            NextKey_CRM_Brain vault (markdown + [[wikilinks]])
                                                  ▲
                                          Sean reads / edits here
```

**Source of truth is Supabase**, not the vault — the cloud CRM can always reach
Supabase but cannot reach Sean's local OneDrive. The vault is a synced mirror.

### One table, four capabilities (`crm_memory.kind`)

| kind                 | what it holds                                              |
| -------------------- | --------------------------------------------------------- |
| `learning`           | agent self-learning: what worked / what failed            |
| `knowledge`          | Sean-curated KB (builder intel, playbooks, market notes)  |
| `contact_memory`     | running insights attached to a contact                    |
| `opportunity_memory` | running insights attached to a deal                       |
| `playbook`           | reusable procedures the AI can follow                     |

`contact_memory` / `opportunity_memory` carry `entity_type` + `entity_id` so they
surface on the right record.

### Recall is hybrid

- **Always on:** Postgres full-text search over a generated `tsvector`.
- **Upgrades automatically to semantic** (pgvector cosine) once an embeddings key
  is configured — see Embeddings below. No code change needed to switch; callers
  get the same shape back either way.

## Code map

| Path                                   | Role                                              |
| -------------------------------------- | ------------------------------------------------- |
| `migrations/20260628_crm_memory.sql`   | table, FTS, pgvector, usage log, `match_crm_memory` RPC |
| `utils/memory.ts`                      | `remember` / `recall` / `reinforce` / `getMemory` |
| `utils/embeddings.ts`                  | optional embeddings (no-op + FTS fallback if no key) |
| `app/api/memory/route.ts`              | `GET` list/browse, `POST` write                   |
| `app/api/memory/recall/route.ts`       | `GET` hybrid retrieval                             |
| `app/api/memory/[id]/route.ts`         | `GET` / `PATCH` (edit, archive, reinforce) / `DELETE` |
| `scripts/obsidian-memory-sync.mjs`     | two-way Supabase ↔ vault bridge (runs on NEXUS box) |

## Using it from an AI feature

```ts
import { recall, remember } from "@/utils/memory"; // or relative import

// before generating
const memories = await recall(userQuestion, { kind: "knowledge", feature: "deal-analyser" });
const context = memories.map((m) => `- ${m.title}: ${m.body}`).join("\n");

// after a useful outcome
await remember({
  kind: "learning",
  title: "Builder X responds best to SMS within 2h of enquiry",
  body: "Three deals closed after sub-2h SMS; email-first attempts went cold.",
  source: "deal-analyser",
  tags: ["builder-x", "timing"],
});
```

## Deploy checklist

1. **Run the migration** in the Supabase SQL editor. Paste from the raw GitHub
   URL (avoids the SQL-editor paste glitch):
   `https://raw.githubusercontent.com/slewis1967/property-crm/<branch>/migrations/20260628_crm_memory.sql`
   - Requires the `vector` and `pg_trgm` extensions; the migration enables them.
     If the project can't create `vector`, enable it under Database → Extensions
     first, then re-run.
2. **(Optional) Turn on semantic recall** — add Netlify env vars:
   - `EMBEDDINGS_API_KEY` = an OpenAI key (`sk-...`)
   - optional `EMBEDDINGS_MODEL` (default `text-embedding-3-small`, 1536d — keep
     in sync with the `vector(1536)` column if changed)
   - Without these, recall still works via full-text search.
3. **Create the vault** — make a folder `NextKey_CRM_Brain` beside `Claude_Memory`
   in `OneDrive - Better Lifestyle Services Pty Ltd\Documents\` and open it once
   in Obsidian as a vault. The sync script creates `kind` subfolders on first run.
4. **Configure the sync job** on the NEXUS box — drop a `.env` beside
   `scripts/obsidian-memory-sync.mjs`:
   ```
   SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_SERVICE_KEY=<service-role key>
   CRM_BRAIN_VAULT=C:\Users\Seans GP\OneDrive - Better Lifestyle Services Pty Ltd\Documents\NextKey_CRM_Brain
   EMBEDDINGS_API_KEY=<optional, same key as Netlify for push-side re-embed>
   ```
   Test: `node scripts/obsidian-memory-sync.mjs --dry-run`
5. **Schedule it** (every ~15 min) via Task Scheduler / cron:
   `node <repo>/scripts/obsidian-memory-sync.mjs`

## Loop & conflict safety

The sync script keeps `.sync-state.json` in the vault: last pull/push timestamps
and a content hash per slug. A row it just wrote won't bounce back as an edit.
Conflicts resolve last-writer-wins (newer of `updated_at` vs file mtime) with a
logged warning.

## Not yet wired (Phase 2)

- Calling `recall()`/`remember()` from advisor, deal-analyser, voice, outreach.
- A `/brain` page in the CRM to browse, search, edit and reinforce memories
  (mirrors the `/advisor` UI).
