-- preliminary_assessments — the Preliminary Assessment (PA) that comes BACK from
-- Your Loan Assist, held ready to present to the applicants on a video call and
-- then sent to them for electronic signature.
--
-- Run this in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run (IF NOT EXISTS guards throughout).
--
-- One row per YLA email. YLA re-issues a PA after a reassessment under the same
-- "our ref", so a reference can have several rows; the newest unsigned one is
-- the live one and the older ones are marked Superseded (see utils/pa-match.ts).
--
-- Rows are written by the mailbox feeder (NEXUS elvis_pa_intake.py, service
-- key), which reads the PA email, stores the PDF in the private
-- `preliminary-assessments` bucket and parses the PDF into `data`:
--
--   data = {
--     "applicants":      [{ "name": "...", "email": "..." }, ...],
--     "signature_lines": [{ "name": "...", "page": 3, "x": 49, "y": 92, "width": 205 }, ...],
--     "page_count":      4,
--     "property":        "Lyndhurst VIC 3975",
--     "email_from":      "support@yourloanassist.com.au"
--   }
--
-- signature_lines are in PDF points with a bottom-left origin (the pdf-lib
-- convention); `page` is 0-based. They locate the printed signature rule for
-- each applicant on YLA's Proposal Disclosure Document so the signed copy
-- carries each signature on its own line.
--
-- The e-signature engine reads `id, data` and writes `status` on this table like
-- any other signable document (utils/sign-doc-render.ts TABLE).

create table if not exists preliminary_assessments (
  id                  uuid primary key default gen_random_uuid(),
  yla_ref             text not null,
  source_message_id   text not null unique,       -- the email's Message-ID — one row per email
  received_at         timestamptz not null,       -- the email's own Date
  email_subject       text,
  pdf_path            text not null,              -- path in the `preliminary-assessments` bucket
  pdf_filename        text,
  video_url           text,                       -- YLA's "Watch Video Presentation" link
  data                jsonb not null default '{}'::jsonb,
  status              text not null default 'Received'
                        check (status in ('Received','Presented','Sent for signing','Signed','Superseded')),

  -- Which client this PA belongs to. NULL = not matched yet; a rep matches it by
  -- hand on /preliminary-assessments. The call room is derived from contact_id.
  contact_id          uuid references public.contacts(id) on delete set null,
  document_request_id uuid,
  matched_by          text,                       -- 'auto:email' or the rep's CF Access email
  matched_at          timestamptz,

  -- The presentation itself.
  presented_at        timestamptz,                -- rep finished presenting the PA on the call
  presented_by        text,
  presentation_room   text,
  video_shown_at      timestamptz,                -- the YLA video step was put on the applicants' screen
  video_confirmed_at  timestamptz,                -- someone confirmed the video was watched
  video_confirmed_by  text,                       -- 'guest:<name>' or the rep's CF Access email
  signing_sent_at     timestamptz,                -- signature requests emailed
  signing_error       text,                       -- last send failure, shown to the rep

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists preliminary_assessments_contact_idx on preliminary_assessments (contact_id);
create index if not exists preliminary_assessments_ref_idx     on preliminary_assessments (yla_ref);
create index if not exists preliminary_assessments_status_idx  on preliminary_assessments (status);

-- Holds applicant names, emails and a full credit proposal. Server routes use the
-- service key, which bypasses RLS. Default-deny: do not add a permissive policy.
alter table preliminary_assessments enable row level security;

-- Private bucket for the PA PDFs as YLA sent them. Reached only through server
-- routes (staff: CF Access; applicants: the signed call link or signing token).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'preliminary-assessments',
  'preliminary-assessments',
  false,
  10 * 1024 * 1024,
  array['application/pdf']
)
on conflict (id) do nothing;
