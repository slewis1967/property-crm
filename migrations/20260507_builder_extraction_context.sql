-- Per-builder extraction context. extraction_notes is free-form
-- instructions to the AI extractor (e.g. "lot column is 2nd, ignore
-- display home rows"). sample_pdf_url points to a representative
-- stocklist uploaded to Supabase Storage; sample_pdf_text caches the
-- pdfplumber output so the aggregator doesn't re-OCR every cron run.

ALTER TABLE builders ADD COLUMN IF NOT EXISTS extraction_notes        TEXT;
ALTER TABLE builders ADD COLUMN IF NOT EXISTS sample_pdf_url          TEXT;
ALTER TABLE builders ADD COLUMN IF NOT EXISTS sample_pdf_text         TEXT;
ALTER TABLE builders ADD COLUMN IF NOT EXISTS sample_pdf_uploaded_at  TIMESTAMPTZ;
