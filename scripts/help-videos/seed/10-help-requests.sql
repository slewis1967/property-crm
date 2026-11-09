-- Demo data for the Help requests page. Everything here is made up.
-- Needs migrations/20261010_help_requests.sql. Safe to re-run: it clears the
-- table first, including anything a recording created.
delete from help_requests;

insert into help_requests (id, question, page_path, section_label, requested_by, status, screen, draft, reviewed_by, reviewed_at, decline_reason, created_at) values
('e0000000-0000-4000-8000-000000000001',
 'How do I change a contact from one buyer type to another?', '/contacts', 'Contacts', 'alex.morgan@example.com', 'drafted',
 '{"verdict":"answer","reason":"Covered by the guide on updating a contact.","concerns":[]}',
 '{"title":"Change a contact''s buyer type","summary":"Moves a contact to a different buyer type so they show under the right list.","steps":[{"title":"Open the contact from Contacts"},{"title":"Click Edit","detail":"In the row of buttons at the top of their page."},{"title":"Choose the new buyer type and click Save"}]}',
 null, null, null, now() - interval '2 hours'),
('e0000000-0000-4000-8000-000000000002',
 'How do I clear a due diligence case without doing the screening?', '/aml', 'CDD Cases', 'alex.morgan@example.com', 'blocked',
 '{"verdict":"decline","reason":"Asks how to skip a compliance step: screening is required before a case can be cleared.","concerns":[]}',
 null, null, null, null, now() - interval '5 hours'),
('e0000000-0000-4000-8000-000000000003',
 'How do I print address labels for a mail-out?', '/contacts', 'Contacts', 'jordan.blake@example.com', 'refer',
 '{"verdict":"refer","reason":"None of the existing guides cover printing labels.","concerns":[]}',
 null, null, null, null, now() - interval '1 day'),
('e0000000-0000-4000-8000-000000000004',
 'How do I see which tasks are overdue?', '/tasks', 'Tasks', 'jordan.blake@example.com', 'published',
 '{"verdict":"answer","reason":"Covered by the Tasks guides.","concerns":[]}',
 '{"title":"See which tasks are overdue","summary":"Shows the open tasks that are past their due date.","steps":[{"title":"Open Tasks from the menu"},{"title":"Look for the due date shown in red","detail":"Overdue tasks are listed first."}]}',
 'demo@example.com', now() - interval '2 days', null, now() - interval '3 days'),
('e0000000-0000-4000-8000-000000000005',
 'How do I export every contact to my own spreadsheet at home?', '/contacts', 'Contacts', 'alex.morgan@example.com', 'declined',
 '{"verdict":"decline","reason":"Asks how to take client data out of the CRM.","concerns":[]}',
 null, 'demo@example.com', now() - interval '4 days', 'Client records stay in the CRM. Ask if you need a report for a specific job.', now() - interval '5 days');
