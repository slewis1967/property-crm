-- A free-text note from the advisor to YLA, sent with the application.
--
-- YLA only ever see what is in the Drive folder and the invite email, and
-- neither had anywhere to explain something the forms can't — e.g. that the
-- rental income on a Needs Analysis is the PROJECTED rent of the investment
-- property being bought, not income the applicant already earns.
--
-- Stored per request; for a joint application the notes of every sibling
-- request are combined (utils/yla-submission-note.ts).
ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS submission_note text;

COMMENT ON COLUMN document_requests.submission_note IS
  'Advisor note to YLA. Printed in the submission email and exported to Drive as "Advisor Notes - <Surname> (<ref>).pdf".';
