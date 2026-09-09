-- Income reconciliation state on document_requests.
--
-- Sits alongside the verification columns (20260722_yla_verification.sql) and
-- follows the same shape: the sweep records its verdict here so the CRM can
-- show which applications need attention without re-reading every PDF.
--
-- `income_evidence` is the cache that makes the sweep affordable. Extracting
-- the numbers from one application's payslips and income statements is ~7 model
-- calls; re-checking whether those payslips have since gone stale is date
-- arithmetic. Keeping the extraction means the two-hourly sweep only pays for
-- applications whose DOCUMENTS changed, while staleness still surfaces on its
-- own as payslips age past the threshold.
--
-- Written to every sibling row of an application, like drive_folder_url — the
-- reconciliation is application-level, and denormalising it lets any single
-- request row answer "does this file need attention?" without a join.
--
-- Idempotent.

ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS income_status        text;         -- null | 'pass' | 'attention'
ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS income_summary       text;
ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS income_findings      jsonb;        -- Finding[]
ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS income_applicants    jsonb;        -- ApplicantIncomeView[]
ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS income_evidence      jsonb;        -- IncomeEvidence[] (extraction cache)
-- When the PDFs were last READ (the expensive step).
ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS income_extracted_at  timestamptz;
-- When the findings were last COMPUTED from that evidence (cheap; runs often).
ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS income_evaluated_at  timestamptz;

-- The sweep's working query: applications needing attention, oldest evaluation
-- first, so a backlog drains in a predictable order rather than starving.
CREATE INDEX IF NOT EXISTS document_requests_income_idx
  ON document_requests (income_status, income_evaluated_at);
