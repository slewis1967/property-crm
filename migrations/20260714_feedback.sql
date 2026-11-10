-- Feedback / issue tracker: bugs, identified issues, and feature requests
-- filed by users straight from the CRM. Read + written server-side with the
-- service key (RLS off, same as the other CRM tables).

create table if not exists feedback (
  id           uuid primary key default gen_random_uuid(),
  type         text not null default 'other'   check (type in ('bug','feature','other')),
  title        text not null,
  details      text,
  area         text,                            -- page / section the item relates to
  priority     text not null default 'medium'  check (priority in ('low','medium','high')),
  status       text not null default 'open'     check (status in ('open','planned','in_progress','done','wont_do')),
  submitted_by text,                            -- Cloudflare Access email of the reporter
  page_url     text,                            -- page the reporter was on when filing
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists feedback_status_created_idx on feedback (status, created_at desc);
