-- Demo data for the "system" help videos: Paid Accounts, Settings, Approval
-- Queue, Sequences and the Archive pages. Everything here is made up.
-- Safe to re-run: it removes its own rows and puts them back, so a scenario
-- that edits or deletes something can be recorded again.

-- ── Paid Accounts ───────────────────────────────────────────────────────────
-- Only this group uses these two tables, so they are reset in full.
delete from paid_service_alerts;
delete from paid_services;

insert into paid_services
  (id, name, category, purpose, criticality, status, vendor_url, plan, cost, currency, billing_cycle,
   next_due_date, last_paid_on, auto_renew, payment_method, card_expiry,
   balance_remaining, balance_unit, low_balance_threshold, alert_lead_days, created_by)
values
  ('5e000000-0000-4000-8000-000000000001','Example Hosting Co','infrastructure','Runs the website. The site goes offline without it.','critical','active','https://billing.example.com/hosting','Business',89,'AUD','monthly',
   current_date - 1, current_date - 31, false,'Visa ••4821','2028-05', null,null,null,7,'help-demo'),
  ('5e000000-0000-4000-8000-000000000002','Example Domain Names','domains','Keeps the web address registered.','important','active','https://billing.example.com/domains','Standard',45,'AUD','annual',
   current_date + 5, current_date - 360, true,'Visa ••4821','2028-05', null,null,null,7,'help-demo'),
  ('5e000000-0000-4000-8000-000000000003','Example SMS Credits','comms','Text message reminders to clients.','important','active','https://billing.example.com/sms','Pay as you go',50,'AUD','prepaid',
   null, current_date - 40, false,'Visa ••4821','2028-05', 12,'AUD',25,7,'help-demo'),
  ('5e000000-0000-4000-8000-000000000004','Example Accounting App','finance','Invoices and bookkeeping.','important','active','https://billing.example.com/accounts','Team',65,'AUD','monthly',
   current_date + 20, current_date - 10, true,'Mastercard ••7730','2028-11', null,null,null,7,'help-demo'),
  ('5e000000-0000-4000-8000-000000000005','Example Design Tools','marketing','Flyers and social media artwork.','optional','active','https://billing.example.com/design','Pro',30,'AUD','monthly',
   current_date + 14, current_date - 16, true,'Mastercard ••7730','2028-11', null,null,null,7,'help-demo'),
  ('5e000000-0000-4000-8000-000000000006','Example Maps Data','data','Suburb maps on property reports.','important','active','https://billing.example.com/maps','Standard',240,'AUD','quarterly',
   current_date + 40, current_date - 50, true,'Visa ••4821','2028-05', null,null,null,14,'help-demo'),
  ('5e000000-0000-4000-8000-000000000007','Example Old Fax Line','comms','No longer used.','optional','active','https://billing.example.com/fax','Basic',15,'AUD','monthly',
   current_date + 25, current_date - 5, true,'Visa ••4821','2028-05', null,null,null,7,'help-demo');

insert into paid_service_alerts (id, kind, severity, message, dry_run, created_at)
values ('5e000000-0000-4000-8000-0000000000a1','run','info','3 accounts flagged', true, now() - interval '3 hours');

-- ── Settings ────────────────────────────────────────────────────────────────
delete from email_user_aliases where user_email in ('alex.morgan@example.com','sam.taylor@example.com');
insert into email_user_aliases (user_email, display_name, aliases, active, signature) values
  ('alex.morgan@example.com','Alex Morgan','{}',true,
   '{"name":"Alex Morgan","title":"Property Strategist","email":"alex.morgan@example.com","phone":"0491 570 201","web":"example.com","disclaimer":"General information only."}'),
  ('sam.taylor@example.com','Sam Taylor','{}',true,
   '{"name":"Sam Taylor","title":"Client Services","email":"sam.taylor@example.com","phone":"0491 570 202","web":"example.com","disclaimer":"General information only."}');

delete from app_settings where key in ('brokers','ai_instructions');
insert into app_settings (key, value, updated_by) values
  ('brokers', '{"brokers":[
     {"id":"5e000000-0000-4000-8000-0000000000b1","name":"Jordan Ellis","email":"jordan.ellis@example.com","company":"Example Home Loans","reference":"EHL-1042","notes":null,"active":true},
     {"id":"5e000000-0000-4000-8000-0000000000b2","name":"Priya Shah","email":"priya.shah@example.com","company":"Sample Finance Group","reference":null,"notes":null,"active":true}
   ]}', 'help-demo');

-- Take the demo property type back out, if an earlier recording added it.
update app_settings
   set value = jsonb_set(value, '{types}',
         coalesce((select jsonb_agg(t) from jsonb_array_elements(value->'types') t where t->>'name' <> 'Granny Flat'), '[]'::jsonb))
 where key = 'property_types';

-- ── Approval Queue history ──────────────────────────────────────────────────
-- The demo database has no content_approvals table (the live one is created
-- outside this repo), so the history list would always be empty. This makes a
-- minimal stand-in with the four columns the page reads.
create table if not exists content_approvals (
  id text primary key,
  content_type text,
  action text not null,
  actioned_at timestamptz default now()
);
delete from content_approvals where id like 'demo-%';
insert into content_approvals (id, content_type, action, actioned_at) values
  ('demo-post-118','facebook post','approved',           now() - interval '2 hours'),
  ('demo-post-117','facebook post','rejected',           now() - interval '1 day'),
  ('demo-post-116','instagram post','approved',          now() - interval '2 days'),
  ('demo-post-115','facebook post','revision_requested', now() - interval '3 days'),
  ('demo-post-114','facebook post','approved',           now() - interval '4 days'),
  ('demo-post-113','instagram post','approved',          now() - interval '6 days');
notify pgrst, 'reload schema';

-- ── Sequences ───────────────────────────────────────────────────────────────
delete from sequences where slug in ('demo-new-enquiry-welcome','demo-no-answer-follow-up');  -- cascades
insert into sequences (id, slug, name, description, is_active, auto_enrol_tag, channel) values
  ('5e000000-0000-4000-8000-0000000000c1','demo-new-enquiry-welcome','New enquiry welcome','Three friendly emails over a week for someone who has just enquired.',true,'new-enquiry','email'),
  ('5e000000-0000-4000-8000-0000000000c2','demo-no-answer-follow-up','No answer follow up','A text and two emails for people we could not reach by phone.',true,null,'mixed');

insert into sequence_enrollments (id, sequence_id, contact_id, status, current_step_position, next_step_due_at, started_at) values
  ('5e000000-0000-4000-8000-0000000000d1','5e000000-0000-4000-8000-0000000000c1','d0000000-0000-4000-8000-000000000001','active',1, now() + interval '3 hours',  now() - interval '2 days'),
  ('5e000000-0000-4000-8000-0000000000d2','5e000000-0000-4000-8000-0000000000c1','d0000000-0000-4000-8000-000000000004','active',2, now() + interval '1 day',    now() - interval '5 days'),
  ('5e000000-0000-4000-8000-0000000000d3','5e000000-0000-4000-8000-0000000000c1','d0000000-0000-4000-8000-000000000010','completed',3, now(),                    now() - interval '12 days'),
  ('5e000000-0000-4000-8000-0000000000d4','5e000000-0000-4000-8000-0000000000c1','d0000000-0000-4000-8000-000000000007','paused',1, now() + interval '9 days',   now() - interval '3 days'),
  ('5e000000-0000-4000-8000-0000000000d5','5e000000-0000-4000-8000-0000000000c2','d0000000-0000-4000-8000-000000000002','active',0, now() + interval '6 hours',  now() - interval '1 day'),
  ('5e000000-0000-4000-8000-0000000000d6','5e000000-0000-4000-8000-0000000000c2','d0000000-0000-4000-8000-000000000006','active',1, now() + interval '2 days',   now() - interval '4 days'),
  ('5e000000-0000-4000-8000-0000000000d7','5e000000-0000-4000-8000-0000000000c2','d0000000-0000-4000-8000-000000000012','failed',1, now(),                      now() - interval '6 days'),
  ('5e000000-0000-4000-8000-0000000000d8','5e000000-0000-4000-8000-0000000000c2','d0000000-0000-4000-8000-000000000009','completed',3, now(),                    now() - interval '15 days');

insert into sequence_step_runs (id, enrollment_id, step_position, step_type, status, provider, error, run_at) values
  ('5e000000-0000-4000-8000-0000000000e1','5e000000-0000-4000-8000-0000000000d1',1,'email','sent','email',null, now() - interval '50 minutes'),
  ('5e000000-0000-4000-8000-0000000000e2','5e000000-0000-4000-8000-0000000000d5',1,'sms','sent','sms',null,     now() - interval '4 hours'),
  ('5e000000-0000-4000-8000-0000000000e3','5e000000-0000-4000-8000-0000000000d7',2,'email','failed','email','Email address bounced', now() - interval '1 day'),
  ('5e000000-0000-4000-8000-0000000000e4','5e000000-0000-4000-8000-0000000000d2',2,'email','sent','email',null, now() - interval '1 day 3 hours'),
  ('5e000000-0000-4000-8000-0000000000e5','5e000000-0000-4000-8000-0000000000d6',1,'sms','skipped','sms',null,  now() - interval '2 days'),
  ('5e000000-0000-4000-8000-0000000000e6','5e000000-0000-4000-8000-0000000000d3',3,'email','sent','email',null, now() - interval '5 days'),
  ('5e000000-0000-4000-8000-0000000000e7','5e000000-0000-4000-8000-0000000000d8',3,'email','sent','email',null, now() - interval '8 days');

-- ── Archive (records kept from the previous CRM) ────────────────────────────
-- The archive contacts reuse the shared cast's ids, so the name links on the
-- archive pages open the matching demo contact.
delete from ghl_archive_media_files   where id like 'demo-%';
delete from ghl_archive_tasks         where id like 'demo-%';
delete from ghl_archive_notes         where id like 'demo-%';
delete from ghl_archive_conversations where id like 'demo-%';
delete from ghl_archive_contacts      where id like 'd0000000-0000-4000-8000-%';

insert into ghl_archive_contacts (id, contact_name, first_name, last_name, email) values
  ('d0000000-0000-4000-8000-000000000001','Olivia Bennett','Olivia','Bennett','olivia.bennett@example.com'),
  ('d0000000-0000-4000-8000-000000000002','Liam Nguyen','Liam','Nguyen','liam.nguyen@example.com'),
  ('d0000000-0000-4000-8000-000000000003','Charlotte Walker','Charlotte','Walker','charlotte.walker@example.com'),
  ('d0000000-0000-4000-8000-000000000005','Amelia Thompson','Amelia','Thompson','amelia.thompson@example.com'),
  ('d0000000-0000-4000-8000-000000000006','Jack Harris','Jack','Harris','jack.harris@example.com'),
  ('d0000000-0000-4000-8000-000000000009','Mia Anderson','Mia','Anderson','mia.anderson@example.com'),
  ('d0000000-0000-4000-8000-000000000012','Henry Wilson','Henry','Wilson','henry.wilson@example.com');

insert into ghl_archive_conversations (id, contact_id, type, unread_count, last_message_body, last_message_type, last_message_date) values
  ('demo-conv-1','d0000000-0000-4000-8000-000000000001','TYPE_EMAIL',0,'Thanks Olivia, I have attached the brochure for the house and land package we talked about.','Email', now() - interval '70 days'),
  ('demo-conv-2','d0000000-0000-4000-8000-000000000002','TYPE_SMS',1,'Hi, can we move our call to Thursday afternoon?','SMS', now() - interval '82 days'),
  ('demo-conv-3','d0000000-0000-4000-8000-000000000003','TYPE_EMAIL',0,'Your accountant has sent through the paperwork. We will be in touch next week.','Email', now() - interval '95 days'),
  ('demo-conv-4','d0000000-0000-4000-8000-000000000005','TYPE_SMS',0,'Reminder: your appointment is at 10am tomorrow.','SMS', now() - interval '101 days'),
  ('demo-conv-5','d0000000-0000-4000-8000-000000000006','TYPE_EMAIL',0,'Here is the brochure and the rental estimate for the duplex.','Email', now() - interval '120 days'),
  ('demo-conv-6','d0000000-0000-4000-8000-000000000009','TYPE_CALL',0,'Missed call. Left a voicemail.','Call', now() - interval '133 days'),
  ('demo-conv-7','d0000000-0000-4000-8000-000000000012','TYPE_EMAIL',2,'Could you send me the floor plan again please?','Email', now() - interval '150 days');

insert into ghl_archive_notes (id, contact_id, body, pinned, date_added) values
  ('demo-note-1','d0000000-0000-4000-8000-000000000001',
   E'Spoke with Olivia. She has finance pre-approval and wants four bedrooms close to a school.\nMar 4, 2026 10:15 AM\nCreated by: Alex Morgan\nSent the pre-approval checklist by email.\nMar 6, 2026 2:40 PM\nCreated by: Sam Taylor',
   true, now() - interval '200 days'),
  ('demo-note-2','d0000000-0000-4000-8000-000000000002',
   E'Liam is comparing two dual occupancy designs. Call back after his pre-approval comes through.\nFeb 18, 2026 9:05 AM\nCreated by: Alex Morgan',
   false, now() - interval '230 days'),
  ('demo-note-3','d0000000-0000-4000-8000-000000000005',
   E'Amelia has listed her current home for sale. Wants a single storey.\nFeb 2, 2026 11:30 AM\nCreated by: Sam Taylor',
   false, now() - interval '245 days'),
  ('demo-note-4','d0000000-0000-4000-8000-000000000009',
   E'Mia asked about pre-approval for a third property. Referred to the broker.\nJan 21, 2026 3:10 PM\nCreated by: Alex Morgan',
   false, now() - interval '260 days'),
  ('demo-note-5','d0000000-0000-4000-8000-000000000012',
   E'Henry is downsizing from acreage. No rush, follow up in autumn.\nJan 9, 2026 1:00 PM\nCreated by: Sam Taylor',
   false, now() - interval '272 days');

insert into ghl_archive_tasks (id, contact_id, title, body, due_date, completed, date_added) values
  ('demo-task-1','d0000000-0000-4000-8000-000000000001','Send contract to Olivia','Email the signed copy once the builder returns it.', now() - interval '190 days', true,  now() - interval '197 days'),
  ('demo-task-2','d0000000-0000-4000-8000-000000000002','Call Liam about finance','Check whether pre-approval has come through.',   now() - interval '180 days', false, now() - interval '188 days'),
  ('demo-task-3','d0000000-0000-4000-8000-000000000003','Book site visit for Charlotte','Saturday morning suits her best.',         now() - interval '210 days', true,  now() - interval '215 days'),
  ('demo-task-4','d0000000-0000-4000-8000-000000000005','Follow up on contract changes','Amelia asked for a later settlement date.', now() - interval '170 days', false, now() - interval '176 days'),
  ('demo-task-5','d0000000-0000-4000-8000-000000000006','Send rental estimate to Jack',null,                                         now() - interval '225 days', true,  now() - interval '229 days'),
  ('demo-task-6','d0000000-0000-4000-8000-000000000009','Review contract with Mia','Go through the special conditions.',            now() - interval '160 days', false, now() - interval '166 days'),
  ('demo-task-7','d0000000-0000-4000-8000-000000000012','Post brochure pack to Henry',null,                                          now() - interval '240 days', true,  now() - interval '244 days');

insert into ghl_archive_media_files (id, name, url, path_local, size, download_status, download_error, extracted_at) values
  ('demo-file-1','Bennett - signed contract.pdf',        null,'archive/files/bennett-signed-contract.pdf',        1843200,'ok',null, now() - interval '120 days'),
  ('demo-file-2','Nguyen - drivers licence.jpg',         null,'archive/files/nguyen-drivers-licence.jpg',          412300,'ok',null, now() - interval '120 days'),
  ('demo-file-3','Walker - contract of sale.pdf',        null,'archive/files/walker-contract-of-sale.pdf',        2210000,'ok',null, now() - interval '120 days'),
  ('demo-file-4','House and land brochure.pdf',          null,'archive/files/house-and-land-brochure.pdf',        5320000,'ok',null, now() - interval '121 days'),
  ('demo-file-5','Thompson - floor plan.png',            null,null,                                                 880000,'failed','File was no longer available to copy', now() - interval '121 days'),
  ('demo-file-6','Harris - rental estimate.pdf',         null,'archive/files/harris-rental-estimate.pdf',          301000,'ok',null, now() - interval '121 days'),
  ('demo-file-7','Open home flyer.jpg',                  null,null,                                                 650000,'failed','File was no longer available to copy', now() - interval '122 days'),
  ('demo-file-8','Old walkthrough video.mp4',            null,null,                                              148000000,'skipped',null, now() - interval '122 days'),
  ('demo-file-9','Anderson - contract variation.pdf',    null,'archive/files/anderson-contract-variation.pdf',     540000,'ok',null, now() - interval '122 days'),
  ('demo-file-10','Wilson - passport.jpg',               null,'archive/files/wilson-passport.jpg',                 390000,'ok',null, now() - interval '123 days');
