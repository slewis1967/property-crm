-- Books, stage 1: tax invoices, replacing Conta for NextKey Pty Ltd.
--
-- An issued invoice is a tax document, so the database refuses edits and deletes
-- to it independently of the app. A wrong invoice is voided and reissued, and its
-- number is never reused. Money is whole cents (bigint), never floats.

create table if not exists invoice_settings (
  id                 int primary key default 1 check (id = 1),
  seller_name        text not null default 'NextKey Pty Ltd',
  abn                text not null default '28 689 818 264',
  address            text,
  email              text,            -- reply-to and remittance address
  phone              text,
  cc_emails          text,            -- comma-separated, copied on every invoice email
  bank_name          text,
  bsb                text,
  account_name       text,
  account_number     text,
  next_number        int not null default 1072,
  default_terms_days int not null default 7,
  updated_at         timestamptz not null default now(),
  updated_by         text
);
insert into invoice_settings (id) values (1) on conflict (id) do nothing;

create table if not exists invoices (
  id                  uuid primary key default gen_random_uuid(),
  number              int unique,                      -- null until issued
  status              text not null default 'draft' check (status in ('draft','issued','paid','void')),
  source              text not null default 'crm' check (source in ('crm','conta_import')),
  trading_as          text,                            -- a registered business name, or null
  issue_date          date,
  due_date            date,
  buyer_name          text,
  buyer_abn           text,
  buyer_email         text,
  buyer_address       text,
  reference           text,
  notes               text,                            -- printed on the invoice
  internal_note       text,                            -- never printed
  lines               jsonb not null default '[]',     -- [{description, quantity, unit_cents, gst}]
  amounts_include_gst boolean not null default true,
  subtotal_cents      bigint not null default 0,
  gst_cents           bigint not null default 0,
  total_cents         bigint not null default 0,
  amount_paid_cents   bigint not null default 0,
  contact_id          uuid,                            -- soft link, contact may be archived
  revenue_deal_id     uuid,                            -- soft link
  issued_at           timestamptz,
  issued_by           text,
  sent_at             timestamptz,
  last_reminder_at    timestamptz,
  reminder_count      int not null default 0,
  paid_at             timestamptz,
  voided_at           timestamptz,
  void_reason         text,
  created_by          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists invoices_status_due_idx on invoices (status, due_date);
create index if not exists invoices_contact_idx on invoices (contact_id);
create index if not exists invoices_deal_idx on invoices (revenue_deal_id);

create table if not exists invoice_payments (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references invoices (id),
  amount_cents bigint not null check (amount_cents > 0),
  paid_on      date not null,
  method       text,
  note         text,
  created_by   text,
  created_at   timestamptz not null default now()
);
create index if not exists invoice_payments_invoice_idx on invoice_payments (invoice_id);

-- No foreign key: the history outlives a deleted draft.
create table if not exists invoice_events (
  id         uuid primary key default gen_random_uuid(),
  invoice_id uuid not null,
  action     text not null,
  actor      text,
  detail     jsonb,
  created_at timestamptz not null default now()
);
create index if not exists invoice_events_invoice_idx on invoice_events (invoice_id, created_at desc);

-- Default-deny: routes use the service key, and the anon key ships to the browser.
alter table invoice_settings enable row level security;
alter table invoices enable row level security;
alter table invoice_payments enable row level security;
alter table invoice_events enable row level security;

create or replace function invoices_lock_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Invoice % is issued and cannot be deleted. Void it instead.', old.number;
    end if;
    return old;
  end if;

  if old.status = 'draft' then
    if new.status in ('paid','void') then
      raise exception 'A draft invoice must be issued first.';
    end if;
    return new;
  end if;

  if new.status = 'draft' then
    raise exception 'An issued invoice cannot return to draft.';
  end if;
  if old.status = 'void' and new.status <> 'void' then
    raise exception 'A voided invoice cannot be reopened.';
  end if;

  if new.number              is distinct from old.number
  or new.source              is distinct from old.source
  or new.trading_as          is distinct from old.trading_as
  or new.issue_date          is distinct from old.issue_date
  or new.buyer_name          is distinct from old.buyer_name
  or new.buyer_abn           is distinct from old.buyer_abn
  or new.buyer_address       is distinct from old.buyer_address
  or new.reference           is distinct from old.reference
  or new.notes               is distinct from old.notes
  or new.lines               is distinct from old.lines
  or new.amounts_include_gst is distinct from old.amounts_include_gst
  or new.subtotal_cents      is distinct from old.subtotal_cents
  or new.gst_cents           is distinct from old.gst_cents
  or new.total_cents         is distinct from old.total_cents then
    raise exception 'Invoice % is issued and locked. Void it and issue a new one.', old.number;
  end if;
  return new;
end $$;

drop trigger if exists invoices_lock_guard on invoices;
create trigger invoices_lock_guard before update or delete on invoices
  for each row execute function invoices_lock_guard();

create or replace function invoice_events_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'invoice_events is append-only';
end $$;

drop trigger if exists invoice_events_append_only on invoice_events;
create trigger invoice_events_append_only before update or delete on invoice_events
  for each row execute function invoice_events_append_only();

-- Issue a draft: takes the next free number under a row lock, so two people
-- issuing at once can't get the same one. Skips numbers already imported.
create or replace function issue_invoice(p_id uuid, p_actor text, p_today date) returns int
language plpgsql as $$
declare
  v_number int;
  v_status text;
begin
  select status into v_status from invoices where id = p_id for update;
  if v_status is null then
    raise exception 'Invoice not found';
  end if;
  if v_status <> 'draft' then
    raise exception 'Invoice has already been issued';
  end if;

  select next_number into v_number from invoice_settings where id = 1 for update;
  while exists (select 1 from invoices where number = v_number) loop
    v_number := v_number + 1;
  end loop;
  update invoice_settings set next_number = v_number + 1, updated_at = now() where id = 1;

  update invoices
     set number = v_number,
         status = 'issued',
         issue_date = coalesce(issue_date, p_today),
         issued_at = now(),
         issued_by = p_actor,
         updated_at = now()
   where id = p_id;
  return v_number;
end $$;

revoke all on function issue_invoice(uuid, text, date) from public, anon, authenticated;
