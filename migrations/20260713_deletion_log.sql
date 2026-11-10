-- deletion_log — audit trail + recovery snapshot for CLIENT (contact) and
-- OPPORTUNITY deletions in the CRM.
-- Run this in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run (idempotent: IF NOT EXISTS guards).
--
-- WHY: deleting a client or an opportunity is destructive and, for
-- opportunities, a HARD delete in NEXUS (unrecoverable). The business rule is
-- that every such deletion must record WHO did it, the REASON, and enough of
-- the record to recover it if the deletion was a mistake. This table captures:
--   - who: deleter_name (typed by the user) + deleter_email (verified CF-Access identity)
--   - why: reason (required, free text)
--   - what: entity_type/entity_id/entity_label + record_snapshot (full row for recovery)
--
-- The reason + name are ALSO enforced at the UI and API layers (a delete is
-- rejected 400 without them). The app degrades gracefully if THIS table is
-- absent: the audit write is skipped with a logged warning and the delete still
-- proceeds — so a pre-migration deploy never strands a user, it just loses the
-- audit row until the migration is applied.
--
-- APPEND-ONLY: rows here are only ever INSERTed. Never UPDATE/DELETE them —
-- the point is a tamper-evident deletion history + recovery trail.

create table if not exists deletion_log (
  id              uuid primary key default gen_random_uuid(),
  entity_type     text not null check (entity_type in ('contact','opportunity')),
  entity_id       text not null,                          -- id of the deleted record
  entity_label    text,                                   -- snapshot of the name/title (readable after deletion)
  reason          text not null,                          -- why it was deleted (required)
  deleter_name    text not null,                          -- name typed by the user (required)
  deleter_email   text,                                   -- verified CF-Access identity of the actor
  record_snapshot jsonb,                                  -- full deleted record, for recovery
  deleted_at      timestamptz not null default now()
);

-- The one query a "recently deleted" view would run: everything of one kind, newest first.
create index if not exists deletion_log_type_deleted_idx
  on deletion_log (entity_type, deleted_at desc);

-- Match the schema's posture: RLS on, default-deny. Snapshots hold the same
-- PII as the deleted records, so the browser anon key must never read them.
-- Server routes use the service key (utils/supabase.ts), which bypasses RLS.
-- Do not add a permissive policy here — and never add UPDATE/DELETE access:
-- this table is append-only.
alter table deletion_log enable row level security;
