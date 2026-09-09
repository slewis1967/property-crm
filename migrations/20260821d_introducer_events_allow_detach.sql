-- Let the append-only guard permit exactly one thing: losing its parent.
--
-- Follow-up to 20260821c, which is already applied and must not be edited.
--
-- WHAT 20260821c GOT WRONG. It changed introducer_events.client_id from
-- ON DELETE CASCADE to ON DELETE SET NULL so the audit trail would survive a
-- referral being deleted. But SET NULL is an UPDATE, and
-- introducer_events_append_only() is BEFORE UPDATE **OR DELETE** — so the
-- referral delete still aborts, now complaining about an UPDATE instead of a
-- DELETE. Moving the problem, not fixing it. Caught by running it.
--
-- THE GUARD IS STILL RIGHT, IT WAS JUST TOO BROAD BY ONE CASE. What must never
-- change is what the event SAYS: who acted, what they did, when, and the detail.
-- Which referral it hangs off is a pointer, and when that referral is deleted
-- the honest thing is for the pointer to become NULL rather than for the whole
-- delete to fail — or, worse, for the log to be erased along with it.
--
-- So the guard now allows an UPDATE that severs the parent and changes NOTHING
-- ELSE, comparing every other column explicitly. Anything else — a reworded
-- action, a different actor, a re-pointed client_id, a DELETE — still raises.
-- Listing the columns rather than trusting a shorter test is deliberate: this
-- function is the reason the table can be believed, and "only client_id
-- changed" has to mean exactly that.
--
-- Idempotent.

CREATE OR REPLACE FUNCTION introducer_events_append_only() RETURNS trigger AS $$
BEGIN
  /* The ONE permitted mutation: ON DELETE SET NULL severing a deleted
   * referral. Every other field must be untouched, and it may only go from
   * "attached" to "detached" — never the other way, which would be re-parenting
   * an event onto a referral it did not happen to. */
  IF TG_OP = 'UPDATE'
     AND OLD.client_id IS NOT NULL
     AND NEW.client_id IS NULL
     AND NEW.id            IS NOT DISTINCT FROM OLD.id
     AND NEW.introducer_id IS NOT DISTINCT FROM OLD.introducer_id
     AND NEW.actor_type    IS NOT DISTINCT FROM OLD.actor_type
     AND NEW.actor         IS NOT DISTINCT FROM OLD.actor
     AND NEW.action        IS NOT DISTINCT FROM OLD.action
     AND NEW.detail        IS NOT DISTINCT FROM OLD.detail
     AND NEW.created_at    IS NOT DISTINCT FROM OLD.created_at
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'introducer_events is append-only (attempted %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

-- The trigger itself is unchanged; only the function it calls. Recreated anyway
-- so a database that somehow lost it comes back consistent.
DROP TRIGGER IF EXISTS introducer_events_no_update ON introducer_events;
CREATE TRIGGER introducer_events_no_update
  BEFORE UPDATE OR DELETE ON introducer_events
  FOR EACH ROW EXECUTE FUNCTION introducer_events_append_only();
