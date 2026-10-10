-- Requests for a help guide that does not exist yet.
--
-- Safe to re-run.
--
-- The "How do I do this?" panel lets staff ask for a guide. A request is
-- screened, a draft is prepared from the guides we already have, and nothing is
-- shown to other staff until a super admin approves it. Rows with status
-- 'published' are the approved guides the panel shows alongside the built-in
-- ones.
--
-- status:
--   new        saved, not prepared yet (the preparing step failed or is off)
--   drafted    a draft is ready for review
--   refer      cannot be written from the existing guides; someone must prepare it
--   blocked    the screen found it asks for a way around a rule; see screen
--   published  approved, visible in the help panel
--   declined   reviewed and turned down; see decline_reason

create table if not exists help_requests (
  id             uuid primary key default gen_random_uuid(),
  question       text not null,
  page_path      text,
  section_label  text,
  requested_by   text not null,
  status         text not null default 'new'
                 check (status in ('new','drafted','refer','blocked','published','declined')),
  screen         jsonb,          -- { verdict, reason, concerns[] } from the checks
  draft          jsonb,          -- { title, summary, steps[{title, detail}] }
  reviewed_by    text,
  reviewed_at    timestamptz,
  decline_reason text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists help_requests_status_idx on help_requests (status, created_at desc);
create index if not exists help_requests_requested_by_idx on help_requests (requested_by, created_at desc);

-- Server routes use the service key, which bypasses RLS. Default-deny: do not
-- add a permissive policy.
alter table help_requests enable row level security;
