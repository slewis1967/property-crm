-- Live tasks (advisor-facing TODOs scoped to a contact).
-- Distinct from ghl_archive_tasks (read-only historical) — this table is
-- what the auto-apply Quick Log writes into, and what a future /tasks
-- live view will read from.

create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid references public.contacts(id) on delete cascade,
  title       text not null,
  body        text,
  due_date    timestamptz,
  completed   boolean default false,
  source      text default 'manual',  -- 'manual' | 'quick-log' | 'sequence' | etc.
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists tasks_contact_id_idx on public.tasks(contact_id);
create index if not exists tasks_due_date_idx on public.tasks(due_date);
create index if not exists tasks_completed_idx on public.tasks(completed);

-- RLS not enabled — service-role key bypasses RLS, and there is no anon-key
-- access to contacts data anyway. If a user-facing browser ever needs read
-- access, add a policy here.
