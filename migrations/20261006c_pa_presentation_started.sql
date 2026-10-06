-- When the rep last pressed Present on a Preliminary Assessment.
--
-- Run AFTER migrations/20261006_preliminary_assessments.sql. Safe to re-run.
--
-- presentation_room says a PA was opened to a call room, but not WHEN. The
-- guest link that reaches it is the one in the client's calendar invite and
-- stays valid for the life of the booking, so without a clock anyone holding
-- that link could fetch the credit proposal for as long as the PA was unsigned.
-- Guest access (app/join/[token]/pa) requires this to be recent; see
-- GUEST_PA_WINDOW_MS in utils/pa-presentation.ts.
--
-- NULL = never presented. Safe default: an existing row is closed to guests
-- until a rep presses Present again.

alter table preliminary_assessments
  add column if not exists presentation_started_at timestamptz;

comment on column preliminary_assessments.presentation_started_at is
  'When a rep last pressed Present. Guest access to the PA requires this to be recent.';
