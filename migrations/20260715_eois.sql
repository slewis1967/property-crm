-- eois — Expression of Interest documents. A digital rebuild of NextKey's paper
-- EOI, prepopulated from property + opportunity/contact data, sent for e-signing,
-- with a driver's licence uploaded on the signing page.
--
-- Run in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run (idempotent). The app degrades gracefully if this table is
-- absent (list empty; saving returns a "run the migration" message).
--
-- The whole form lives in `data` jsonb (shape = utils/eoi.ts EoiData). Columns
-- beside it are denormalised for the list view. PII posture: RLS on, default-deny
-- (buyer names, contact details, purchase terms). Server routes use the service
-- key (utils/supabase.ts), which bypasses RLS. Do NOT add a permissive policy.
--
-- An EOI is a signable ComplianceDocType (doc_type = 'eoi') and reuses the
-- signature + audit infrastructure (compliance_document_audit,
-- migrations/20260712_compliance_audit.sql — which this migration widens to
-- accept 'eoi'). Make sure that migration has been applied too.

create table if not exists eois (
  id             uuid primary key default gen_random_uuid(),
  summary        text,                                  -- eoiSummary(data) — "Buyer — Property" (for the list)
  status         text not null default 'Draft',          -- Draft | Sent | Signed
  property_id    text,                                   -- soft FK → global_stock_pool.id
  opportunity_id text,                                   -- soft FK → NEXUS opportunity id
  contact_id     text,                                   -- soft FK → contacts.id
  deal_id        uuid,                                   -- soft FK → dev_opportunities.id
  purchase_price numeric,                                -- data->property->purchasePrice (for the list)
  aml_case_id    uuid,                                   -- soft FK → aml_cases.id (the "Start CDD from EOI" tie-in)
  licence_file_path  text,                               -- Supabase Storage path to the buyer's driver's licence
  licence_uploaded_at timestamptz,
  data           jsonb not null default '{}'::jsonb,     -- the full EOI (utils/eoi.ts EoiData)
  created_by     text,                                   -- CF-Access user email
  updated_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists eois_created_idx     on eois (created_at desc);
create index if not exists eois_status_idx      on eois (status);
create index if not exists eois_property_idx    on eois (property_id);
create index if not exists eois_opportunity_idx on eois (opportunity_id);
create index if not exists eois_contact_idx     on eois (contact_id);

-- Keep updated_at fresh on every change.
create or replace function set_eois_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists eois_set_updated_at on eois;
create trigger eois_set_updated_at
  before update on eois
  for each row execute function set_eois_updated_at();

-- RLS on, default-deny (server bypasses via the service key).
alter table eois enable row level security;

-- Allow 'eoi' in the shared compliance audit trail. The original
-- 20260712_compliance_audit.sql CHECK only permitted the earlier doc types, so
-- on a DB where it was already applied, 'eoi' audit inserts would fail the
-- constraint (fail-open, so the EOI history would silently not record). Widen
-- it. Idempotent and safe whether or not the audit table exists yet.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'compliance_document_audit'
  ) then
    alter table compliance_document_audit drop constraint if exists compliance_document_audit_doc_type_check;
    alter table compliance_document_audit add constraint compliance_document_audit_doc_type_check
      check (doc_type in ('fact_find','needs_analysis','credit_authorisation','aml_case','eoi'));
  end if;
end $$;

-- Allow 'eoi' as a signable doc_type on signature_requests (its CHECK from
-- 20260713_signature_requests.sql only permitted the three original docs, so
-- sending an EOI for signature would fail the insert). Idempotent.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'signature_requests'
  ) then
    alter table signature_requests drop constraint if exists signature_requests_doc_type_check;
    alter table signature_requests add constraint signature_requests_doc_type_check
      check (doc_type in ('fact_find','needs_analysis','credit_authorisation','eoi'));
  end if;
end $$;

-- Per-signer driver's licence uploaded on the EOI signing page (references an
-- object in the signing-uploads bucket below). The eois row also carries the
-- most-recent licence (columns above) for the form + AML "Start CDD" tie-in.
alter table if exists signature_requests add column if not exists licence_file_path text;
alter table if exists signature_requests add column if not exists licence_uploaded_at timestamptz;

-- Private Storage bucket for the buyer's driver's licence uploaded on the public
-- signing page. Server routes (service key) read/write it; never public. Mirrors
-- the signed-documents bucket declared in 20260713_signature_requests.sql.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signing-uploads', 'signing-uploads', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do nothing;
