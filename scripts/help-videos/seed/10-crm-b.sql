-- Demo data for the crm-b help videos (Shared Folder, Contacts, Calendar,
-- Appointments, Inbox, Broadcast, Tasks, Feedback, Video calls).
-- Everything here is made up. Safe to re-run: each block deletes its own rows
-- (and anything a scenario created) and inserts them again, so dates stay
-- relative to today and every scenario can be recorded again.
-- Needs seed/00-core.sql (the 12 shared contacts) to be applied first.

begin;

-- ───────────────────────────────────────────── Contacts made by scenarios
-- contacts-add-new adds Sophie Turner; contacts-bulk-upload imports four people.
delete from contacts where lower(email) in (
  'sophie.turner@example.com',
  'ava.mitchell@example.com',
  'oscar.reid@example.com',
  'ruby.campbell@example.com',
  'leo.fraser@example.com'
);
-- contacts-update-and-email edits Noah Patel's note and timeframe; put them back.
update contacts
   set notes = 'Saving a deposit. Follow up in the new year.', timeframe = '6-12 months'
 where id = 'd0000000-0000-4000-8000-000000000004';

-- ─────────────────────────────────────────────────────────── Shared Folder
-- The section belongs to this group alone, so the whole table is reset.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shared-folder', 'shared-folder', false, 2::bigint * 1024 * 1024 * 1024, null)
on conflict (id) do nothing;

delete from shared_folder_items;
insert into shared_folder_items (id, parent_id, kind, name, storage_path, mime_type, size_bytes, status, created_by, created_at, updated_at) values
('cb0f0000-0000-4000-8000-000000000001', null, 'folder', 'Builder price lists', null, null, null, 'ready', 'demo@example.com', now() - interval '40 days', now() - interval '3 days'),
('cb0f0000-0000-4000-8000-000000000002', null, 'folder', 'Client documents',    null, null, null, 'ready', 'demo@example.com', now() - interval '40 days', now() - interval '2 days'),
('cb0f0000-0000-4000-8000-000000000003', null, 'folder', 'Marketing',           null, null, null, 'ready', 'demo@example.com', now() - interval '35 days', now() - interval '9 days'),
('cb0f0000-0000-4000-8000-000000000004', null, 'folder', 'Templates',           null, null, null, 'ready', 'demo@example.com', now() - interval '35 days', now() - interval '12 days');
insert into shared_folder_items (id, parent_id, kind, name, storage_path, mime_type, size_bytes, status, created_by, created_at, updated_at) values
('cb0f0000-0000-4000-8000-000000000011', null, 'file', 'Office phone list.pdf',           'demo/cb0f0011.pdf', 'application/pdf', 84211,  'ready', 'demo@example.com', now() - interval '30 days', now() - interval '30 days'),
('cb0f0000-0000-4000-8000-000000000012', null, 'file', 'Old price list draft.pdf',        'demo/cb0f0012.pdf', 'application/pdf', 412870, 'ready', 'demo@example.com', now() - interval '21 days', now() - interval '21 days'),
('cb0f0000-0000-4000-8000-000000000021', 'cb0f0000-0000-4000-8000-000000000001', 'file', 'Wattlebrook Homes price list October.pdf', 'demo/cb0f0021.pdf', 'application/pdf', 1284400, 'ready', 'demo@example.com', now() - interval '3 days', now() - interval '3 days'),
('cb0f0000-0000-4000-8000-000000000022', 'cb0f0000-0000-4000-8000-000000000001', 'file', 'Kestrel Ridge Builders inclusions.pdf',    'demo/cb0f0022.pdf', 'application/pdf', 932150,  'ready', 'demo@example.com', now() - interval '8 days', now() - interval '8 days'),
('cb0f0000-0000-4000-8000-000000000023', 'cb0f0000-0000-4000-8000-000000000001', 'file', 'Wattlebrook Homes price list September.pdf', 'demo/cb0f0023.pdf', 'application/pdf', 1190020, 'ready', 'demo@example.com', now() - interval '33 days', now() - interval '33 days'),
('cb0f0000-0000-4000-8000-000000000031', 'cb0f0000-0000-4000-8000-000000000002', 'file', 'Olivia Bennett signed fact find.pdf',      'demo/cb0f0031.pdf', 'application/pdf', 256700,  'ready', 'demo@example.com', now() - interval '2 days', now() - interval '2 days'),
('cb0f0000-0000-4000-8000-000000000032', 'cb0f0000-0000-4000-8000-000000000002', 'file', 'Liam Nguyen payslips.pdf',                 'demo/cb0f0032.pdf', 'application/pdf', 518300,  'ready', 'demo@example.com', now() - interval '6 days', now() - interval '6 days'),
('cb0f0000-0000-4000-8000-000000000041', 'cb0f0000-0000-4000-8000-000000000004', 'file', 'Welcome letter template.docx',  'demo/cb0f0041.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 48200, 'ready', 'demo@example.com', now() - interval '12 days', now() - interval '12 days'),
('cb0f0000-0000-4000-8000-000000000042', 'cb0f0000-0000-4000-8000-000000000004', 'file', 'Meeting agenda template.docx',  'demo/cb0f0042.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 39800, 'ready', 'demo@example.com', now() - interval '20 days', now() - interval '20 days');

-- ─────────────────────────────────────────────── Calendar and Appointments
delete from appointments where cal_uid like 'demo-crmb-%';
insert into appointments (id, cal_uid, contact_id, contact_email, contact_name, host_email, host_name, event_title, start_time, end_time, location, status, cancel_reason, additional_notes, created_at)
select v.id::uuid, v.cal_uid, v.contact_id::uuid, v.contact_email, v.contact_name, 'demo@example.com', 'Demo Broker', v.title,
       (((now() at time zone 'Australia/Brisbane')::date + v.day_offset) + v.start_at) at time zone 'Australia/Brisbane',
       (((now() at time zone 'Australia/Brisbane')::date + v.day_offset) + v.start_at + (v.mins || ' minutes')::interval) at time zone 'Australia/Brisbane',
       v.location, v.status, v.cancel_reason, v.notes, now() - interval '5 days'
from (values
  ('cb0a0000-0000-4000-8000-000000000001','demo-crmb-01','d0000000-0000-4000-8000-000000000001','olivia.bennett@example.com','Olivia Bennett','Discovery call',                 1, time '10:00', 30, 'http://localhost:3111/join/demo-olivia', 'booked', null, 'First chat about house and land north of Brisbane.'),
  ('cb0a0000-0000-4000-8000-000000000002','demo-crmb-02','d0000000-0000-4000-8000-000000000002','liam.nguyen@example.com','Liam Nguyen','Finance review',                       2, time '14:00', 45, 'http://localhost:3111/join/demo-liam',   'booked', null, 'Go through borrowing capacity for a second investment.'),
  ('cb0a0000-0000-4000-8000-000000000003','demo-crmb-03','d0000000-0000-4000-8000-000000000009','mia.anderson@example.com','Mia Anderson','Property shortlist walkthrough',      3, time '11:30', 30, 'http://localhost:3111/join/demo-mia',    'booked', null, 'Three properties to walk through.'),
  ('cb0a0000-0000-4000-8000-000000000004','demo-crmb-04','d0000000-0000-4000-8000-000000000005','amelia.thompson@example.com','Amelia Thompson','Contract catch-up',            5, time '09:00', 60, 'Office, level 2 meeting room',           'booked', null, 'Bring the draft contract.'),
  ('cb0a0000-0000-4000-8000-000000000005','demo-crmb-05','d0000000-0000-4000-8000-000000000011','grace.lee@example.com','Grace Lee','Completed homes review',                    8, time '15:00', 30, 'http://localhost:3111/join/demo-grace',  'booked', null, null),
  ('cb0a0000-0000-4000-8000-000000000006','demo-crmb-06','d0000000-0000-4000-8000-000000000012','henry.wilson@example.com','Henry Wilson','Downsizing options',                 12, time '10:30', 45, 'Phone call',                             'booked', null, null),
  ('cb0a0000-0000-4000-8000-000000000007','demo-crmb-07','d0000000-0000-4000-8000-000000000004','noah.patel@example.com','Noah Patel','Deposit planning call',                   4, time '16:00', 30, 'http://localhost:3111/join/demo-noah',   'cancelled', 'Client asked to move to next month', null),
  ('cb0a0000-0000-4000-8000-000000000008','demo-crmb-08','d0000000-0000-4000-8000-000000000003','charlotte.walker@example.com','Charlotte Walker','Suburb report review',        -2, time '13:00', 30, 'http://localhost:3111/join/demo-charlotte','booked', null, null),
  ('cb0a0000-0000-4000-8000-000000000009','demo-crmb-09','d0000000-0000-4000-8000-000000000006','jack.harris@example.com','Jack Harris','Finance check-in',                      -6, time '17:00', 30, 'Phone call',                             'booked', null, null),
  ('cb0a0000-0000-4000-8000-000000000010','demo-crmb-10','d0000000-0000-4000-8000-000000000007','isla.robinson@example.com','Isla Robinson','First home buyer session',          -10, time '10:00', 60, 'http://localhost:3111/join/demo-isla',   'booked', null, null)
) as v(id, cal_uid, contact_id, contact_email, contact_name, title, day_offset, start_at, mins, location, status, cancel_reason, notes);

-- ─────────────────────────────────────────────────────────────────── Inbox
-- The demo user is demo@example.com (DEV_USER_EMAIL), so that is the owner.
delete from email_log where id::text like 'cb0e0000-%';
delete from email_log where owner_user_email = 'demo@example.com' and tags ?| array['inbox-reply', 'contact-detail'];
delete from email_drafts where owner_user_email = 'demo@example.com';
delete from email_folders where owner_user_email = 'demo@example.com';

insert into email_log (id, contact_id, direction, to_email, to_name, from_email, from_name, subject, body_html, body_text, status, thread_id, message_id, created_at, sent_at, owner_user_email, is_read) values
('cb0e0000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','inbound','demo@example.com','Demo Broker','olivia.bennett@example.com','Olivia Bennett','Question about the Chermside house and land package',
 '<p>Hi,</p><p>Thanks for the call yesterday. Could you tell me whether the package price includes the driveway and fencing? We would also like to know when the land is due to register.</p><p>Thanks,<br>Olivia</p>',
 'Hi, Thanks for the call yesterday. Could you tell me whether the package price includes the driveway and fencing? We would also like to know when the land is due to register. Thanks, Olivia',
 'received','demo-thread-01','<demo-01@example.com>', now() - interval '35 minutes', now() - interval '35 minutes','demo@example.com', false),
('cb0e0000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000009','inbound','demo@example.com','Demo Broker','mia.anderson@example.com','Mia Anderson','Ready to look at a third property',
 '<p>Hello,</p><p>My accountant has given me the go ahead. Can you send through anything suitable around Toowoomba or the Sunshine Coast?</p><p>Regards,<br>Mia</p>',
 'Hello, My accountant has given me the go ahead. Can you send through anything suitable around Toowoomba or the Sunshine Coast? Regards, Mia',
 'received','demo-thread-02','<demo-02@example.com>', now() - interval '2 hours', now() - interval '2 hours','demo@example.com', false),
('cb0e0000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000002','inbound','demo@example.com','Demo Broker','liam.nguyen@example.com','Liam Nguyen','Dual occupancy options',
 '<p>Hi,</p><p>Do you have any dual occupancy designs that would suit a 600 square metre block?</p><p>Liam</p>',
 'Hi, Do you have any dual occupancy designs that would suit a 600 square metre block? Liam',
 'received','demo-thread-03','<demo-03@example.com>', now() - interval '1 day 3 hours', now() - interval '1 day 3 hours','demo@example.com', true),
('cb0e0000-0000-4000-8000-000000000004','d0000000-0000-4000-8000-000000000002','outbound','liam.nguyen@example.com','Liam Nguyen','demo@example.com','Demo Broker','Re: Dual occupancy options',
 '<p>Hi Liam,</p><p>Yes, there are two designs that fit. I have attached the brochure and will call you tomorrow to talk them through.</p>',
 'Hi Liam, Yes, there are two designs that fit. I have attached the brochure and will call you tomorrow to talk them through.',
 'sent','demo-thread-03','<demo-04@example.com>', now() - interval '1 day 1 hour', now() - interval '1 day 1 hour','demo@example.com', true),
('cb0e0000-0000-4000-8000-000000000005','d0000000-0000-4000-8000-000000000005','inbound','demo@example.com','Demo Broker','amelia.thompson@example.com','Amelia Thompson','Can we move our catch-up to the afternoon?',
 '<p>Hi,</p><p>Something has come up in the morning. Would two o''clock work instead?</p><p>Amelia</p>',
 'Hi, Something has come up in the morning. Would two o''clock work instead? Amelia',
 'received','demo-thread-05','<demo-05@example.com>', now() - interval '1 day 6 hours', now() - interval '1 day 6 hours','demo@example.com', true),
('cb0e0000-0000-4000-8000-000000000006', null,'inbound','demo@example.com','Demo Broker','sales@wattlebrookhomes.example','Wattlebrook Homes','Updated price list for October',
 '<p>Good morning,</p><p>Please find our updated price list for October. Three new designs have been added and the base prices on the Banksia range have changed.</p><p>Wattlebrook Homes sales team</p>',
 'Good morning, Please find our updated price list for October. Three new designs have been added and the base prices on the Banksia range have changed. Wattlebrook Homes sales team',
 'received','demo-thread-06','<demo-06@example.com>', now() - interval '2 days', now() - interval '2 days','demo@example.com', true),
('cb0e0000-0000-4000-8000-000000000007', null,'inbound','demo@example.com','Demo Broker','news@propertydigest.example','Weekly Property Digest','This week in property: five suburbs to watch',
 '<p>Your weekly round-up of property news is here.</p>',
 'Your weekly round-up of property news is here.',
 'received','demo-thread-07','<demo-07@example.com>', now() - interval '3 days', now() - interval '3 days','demo@example.com', true),
('cb0e0000-0000-4000-8000-000000000008','d0000000-0000-4000-8000-000000000003','outbound','charlotte.walker@example.com','Charlotte Walker','demo@example.com','Demo Broker','Your suburb report for Redcliffe',
 '<p>Hi Charlotte,</p><p>Here is the suburb report we talked about. Happy to go through it on our next call.</p>',
 'Hi Charlotte, Here is the suburb report we talked about. Happy to go through it on our next call.',
 'sent','demo-thread-08','<demo-08@example.com>', now() - interval '2 days 4 hours', now() - interval '2 days 4 hours','demo@example.com', true),
('cb0e0000-0000-4000-8000-000000000009','d0000000-0000-4000-8000-000000000004','outbound','noah.patel@example.com','Noah Patel','demo@example.com','Demo Broker','Checking in on your deposit plan',
 '<p>Hi Noah,</p><p>Just checking in to see how the savings plan is going. Let me know if you would like to book a call.</p>',
 'Hi Noah, Just checking in to see how the savings plan is going. Let me know if you would like to book a call.',
 'sent','demo-thread-09','<demo-09@example.com>', now() - interval '4 days', now() - interval '4 days','demo@example.com', true);

insert into email_drafts (id, owner_user_email, to_addresses, subject, body_html, from_identity, created_at, updated_at) values
('cb0d0000-0000-4000-8000-000000000001','demo@example.com','{grace.lee@example.com}','Completed homes available this month',
 '<p>Hi Grace,</p><p>Three completed homes have come up that match what you described. I will send the details through shortly.</p>',
 'nextkey', now() - interval '1 day', now() - interval '1 day');

-- ─────────────────────────────────────────────────────────────── Broadcast
delete from sequences where slug like 'broadcast-demo-%';
insert into sequences (id, slug, name, description, is_active, channel, created_at) values
('cb0b0000-0000-4000-8000-000000000001','broadcast-demo-new-listings','Broadcast — New listings this week','Demo broadcast', true, 'email', now() - interval '12 minutes'),
('cb0b0000-0000-4000-8000-000000000002','broadcast-demo-october-update','Broadcast — October property update','Demo broadcast', true, 'email', now() - interval '6 days');
delete from sequence_steps where sequence_id in ('cb0b0000-0000-4000-8000-000000000001','cb0b0000-0000-4000-8000-000000000002');
insert into sequence_steps (sequence_id, position, step_type, delay_hours, payload) values
('cb0b0000-0000-4000-8000-000000000001', 1, 'send_email', 0, '{"subject":"New listings this week"}'),
('cb0b0000-0000-4000-8000-000000000002', 1, 'send_email', 0, '{"subject":"October property update"}');
delete from sequence_enrollments where sequence_id in ('cb0b0000-0000-4000-8000-000000000001','cb0b0000-0000-4000-8000-000000000002');
insert into sequence_enrollments (sequence_id, contact_id, status, failed_reason, enrolled_by)
select 'cb0b0000-0000-4000-8000-000000000002', id, 'completed', null, 'broadcast'
  from contacts where id::text like 'd0000000-0000-4000-8000-0000000000%';
insert into sequence_enrollments (sequence_id, contact_id, status, failed_reason, enrolled_by)
select 'cb0b0000-0000-4000-8000-000000000001', id,
       case when right(id::text, 2)::int <= 7 then 'completed' when right(id::text, 2)::int = 12 then 'failed' else 'active' end,
       case when right(id::text, 2)::int = 12 then 'Mailbox is full' else null end,
       'broadcast'
  from contacts where id::text like 'd0000000-0000-4000-8000-0000000000%';

-- ─────────────────────────────────────────────────────────────────── Tasks
delete from tasks where id::text like 'cb070000-%';
delete from tasks where source = 'tasks_page' and title in ('Send Grace Lee the completed homes list');
insert into tasks (id, contact_id, title, body, due_date, completed, source, created_at) values
('cb070000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000006','Update Jack Harris''s finance status', 'He was waiting on a letter from his lender.', now() - interval '5 days', false, 'manual', now() - interval '9 days'),
('cb070000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000001','Call Olivia Bennett about her pre-approval', null, now() - interval '2 days', false, 'manual', now() - interval '6 days'),
('cb070000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000002','Send Liam Nguyen the dual occupancy brochure', null, now(), false, 'manual', now() - interval '2 days'),
('cb070000-0000-4000-8000-000000000004','d0000000-0000-4000-8000-000000000009','Follow up Mia Anderson on the shortlist', null, now() + interval '1 day', false, 'manual', now() - interval '1 day'),
('cb070000-0000-4000-8000-000000000005','d0000000-0000-4000-8000-000000000005','Book building inspection for Amelia Thompson', null, now() + interval '5 days', false, 'manual', now() - interval '1 day'),
('cb070000-0000-4000-8000-000000000006','d0000000-0000-4000-8000-000000000010','Email suburb report to Lucas Martin', null, now() - interval '1 day', true, 'manual', now() - interval '4 days'),
('cb070000-0000-4000-8000-000000000007','d0000000-0000-4000-8000-000000000001','Call Olivia Bennett about her pre-approval (entered twice)', null, null, false, 'manual', now() - interval '6 days');

-- ──────────────────────────────────────────────────────────────── Feedback
delete from feedback where id::text like 'cb0c0000-%';
delete from feedback where title in ('Export button gives an empty file');
insert into feedback (id, type, title, details, area, priority, status, submitted_by, created_at, ai_kind, ai_severity, ai_summary, ai_analysis, agent_stage, plan) values
('cb0c0000-0000-4000-8000-000000000001','feature','Email a suburb report straight from the contact page','It would save time if I could send the report without downloading it first.','/contacts','medium','open','demo@example.com', now() - interval '2 days','feature','low','Add a button on the contact page that emails the suburb report to the client.','A plan is ready for approval.','awaiting_signoff',
 E'1. Add a Send suburb report button to the contact page.\n2. Let the user pick the suburb and check the email before it goes.\n3. Record the email in the contact''s email history.'),
('cb0c0000-0000-4000-8000-000000000002','bug','Save button does nothing on the Fact Find','I filled in the income section and clicked Save. Nothing happened and my changes were gone when I came back.','/fact-find','high','open','demo@example.com', now() - interval '1 day','bug','high','Saving the income section of the Fact Find does not keep the changes.','Reproduced. Working on a fix.','working', null),
('cb0c0000-0000-4000-8000-000000000003','other','Where do I change my email signature?','I could not find the setting.','/inbox','low','open','demo@example.com', now() - interval '3 hours', null, null, null, null,'pending', null),
('cb0c0000-0000-4000-8000-000000000004','bug','Calendar shows the wrong day for late meetings','A meeting booked for eight at night showed on the next day.','/calendar','medium','done','demo@example.com', now() - interval '9 days','bug','medium','Evening meetings appeared on the following day in the calendar.','Fixed and live.','shipped', null);

commit;
