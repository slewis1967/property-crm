-- Demo data for the "Command" group help videos (War Room, Revenue, Advisor,
-- Brain, Analytics, PIA Modeller, Planning Feasibility). Everything is made up.
-- Safe to re-run: every row here has a fixed id starting c0aa0000, and the
-- file deletes its own rows (and the rows the scenarios create) before
-- inserting them again, so each recording starts from the same screen.
begin;

-- ── rows the scenarios themselves create ────────────────────────────────────
delete from revenue_deals where lot = 'Lot 12 Example Ridge Estate, Caboolture';
delete from revenue_costs where label in ('Salaries', 'Office rent', 'Software');
delete from crm_memory where title = 'Example Ridge Builders pay commission in two instalments';
-- Dismissing a recommendation on the Advisor page writes a memory of its own.
delete from crm_memory where source = 'advisor-feedback' and title like 'Dismissed advisor rec:%';
delete from pia_reports where title like 'PIA%' and (property_id::text like 'c0aa0000%' or contact_id::text like 'd0000000%' or (property_id is null and contact_id is null));
delete from feasibility_reports where address = '14 Sample Street, Kelso QLD 4815' and id::text not like 'c0aa0000%';
delete from lender_policy_field_reviews where true;

-- ── tasks (War Room "Open Tasks") ───────────────────────────────────────────
delete from tasks where id::text like 'c0aa0000%';
insert into tasks (id, contact_id, title, due_date, completed) values
('c0aa0000-0000-4000-8000-000000000201','d0000000-0000-4000-8000-000000000001','Call Olivia about her pre-approval letter', now() - interval '1 day', false),
('c0aa0000-0000-4000-8000-000000000202','d0000000-0000-4000-8000-000000000005','Send Amelia the four bedroom shortlist', now() + interval '1 day', false),
('c0aa0000-0000-4000-8000-000000000203','d0000000-0000-4000-8000-000000000009','Book a strategy call with Mia', now() + interval '2 days', false),
('c0aa0000-0000-4000-8000-000000000204','d0000000-0000-4000-8000-000000000002','Follow up Liam on finance documents', now() + interval '4 days', false),
('c0aa0000-0000-4000-8000-000000000205','d0000000-0000-4000-8000-000000000011','Email Grace the completed home brochure', now() + interval '6 days', false);

-- ── leads (War Room "Recent Leads", Analytics "Lead Intelligence") ──────────
delete from property_leads where id::text like 'c0aa0000%';
insert into property_leads (id, created_at, name, email, phone, buyer_type, state, budget, triage_score, match_status, source, notes) values
('c0aa0000-0000-4000-8000-000000000301', now() - interval '3 hours', 'Olivia Bennett','olivia.bennett@example.com','0491 570 101','First Home Buyer','QLD',650000,82,'matched','web','{"temperature":"hot"}'),
('c0aa0000-0000-4000-8000-000000000302', now() - interval '9 hours', 'Mia Anderson','mia.anderson@example.com','0491 570 109','Investor','QLD',900000,88,'matched','web','{"temperature":"hot"}'),
('c0aa0000-0000-4000-8000-000000000303', now() - interval '1 day', 'Liam Nguyen','liam.nguyen@example.com','0491 570 102','Investor','NSW',750000,74,'matched','web','{"temperature":"warm"}'),
('c0aa0000-0000-4000-8000-000000000304', now() - interval '2 days', 'Grace Lee','grace.lee@example.com','0491 570 111','Investor','QLD',680000,79,'matched','web','{"temperature":"hot"}'),
('c0aa0000-0000-4000-8000-000000000305', now() - interval '2 days', 'Isla Robinson','isla.robinson@example.com','0491 570 107','First Home Buyer','NSW',720000,63,'new','web','{"temperature":"warm"}'),
('c0aa0000-0000-4000-8000-000000000306', now() - interval '3 days', 'Charlotte Walker','charlotte.walker@example.com','0491 570 103','Investor','VIC',600000,68,'matched','web','{"temperature":"warm"}'),
('c0aa0000-0000-4000-8000-000000000307', now() - interval '4 days', 'Noah Patel','noah.patel@example.com','0491 570 104','First Home Buyer','QLD',580000,41,'new','web','{"temperature":"warm"}'),
('c0aa0000-0000-4000-8000-000000000308', now() - interval '5 days', 'Jack Harris','jack.harris@example.com','0491 570 106','Investor','WA',700000,71,'matched','web','{"temperature":"warm"}'),
('c0aa0000-0000-4000-8000-000000000309', now() - interval '6 days', 'Lucas Martin','lucas.martin@example.com','0491 570 110','Home Buyer','SA',560000,28,'new','web','{"temperature":"cold"}'),
('c0aa0000-0000-4000-8000-000000000310', now() - interval '8 days', 'Henry Wilson','henry.wilson@example.com','0491 570 112','Home Buyer','QLD',610000,36,'new','web','{"temperature":"warm"}'),
('c0aa0000-0000-4000-8000-000000000311', now() - interval '9 days', 'Amelia Thompson','amelia.thompson@example.com','0491 570 105','Home Buyer','QLD',820000,90,'matched','web','{"temperature":"hot"}'),
('c0aa0000-0000-4000-8000-000000000312', now() - interval '11 days', 'Ethan Clarke','ethan.clarke@example.com','0491 570 108','First Home Buyer','NSW',720000,52,'new','web','{"temperature":"hot"}');

-- ── stock (PIA "Pick property", War Room "Stock Pool", Analytics) ──────────
delete from pia_reports where property_id::text like 'c0aa0000%';
delete from global_stock_pool where id::text like 'c0aa0000%';
insert into global_stock_pool (id, builder_name, estate_name, lot_number, street_address, suburb, state, land_price, house_price, build_price, expected_rent_weekly, bedrooms, bathrooms, car_spaces, land_size_sqm, property_type, pipeline_status, status, updated_at) values
('c0aa0000-0000-4000-8000-000000000101','Example Ridge Builders','Example Ridge Estate','12','12 Sample Street','Caboolture','QLD',310000,352000,352000,640,4,2,2,420,'House and land','active','available', now() - interval '1 hour'),
('c0aa0000-0000-4000-8000-000000000102','Example Ridge Builders','Example Ridge Estate','27','27 Sample Street','Caboolture','QLD',318000,371000,371000,660,4,2,2,450,'House and land','active','available', now() - interval '2 hours'),
('c0aa0000-0000-4000-8000-000000000103','Acacia Demo Homes','Demo Meadows','8','8 Placeholder Parade','Logan Reserve','QLD',335000,389000,389000,690,4,2,2,400,'House and land','active','available', now() - interval '3 hours'),
('c0aa0000-0000-4000-8000-000000000104','Acacia Demo Homes','Demo Meadows','41','41 Placeholder Parade','Logan Reserve','QLD',342000,455000,455000,880,5,3,2,512,'Dual occupancy','active','available', now() - interval '4 hours'),
('c0aa0000-0000-4000-8000-000000000105','Sample Coast Developments','Sample Coast Rise','3','3 Example Crescent','Burpengary','QLD',365000,402000,402000,700,4,2,2,480,'House and land','active','available', now() - interval '5 hours'),
('c0aa0000-0000-4000-8000-000000000106','Sample Coast Developments','Sample Coast Rise','19','19 Example Crescent','Burpengary','QLD',358000,340000,340000,620,3,2,1,375,'House and land','pending_review','available', now() - interval '6 hours'),
('c0aa0000-0000-4000-8000-000000000107','Acacia Demo Homes','Demo Meadows','55','55 Placeholder Parade','Logan Reserve','QLD',330000,360000,360000,650,4,2,2,405,'House and land','pending_review','available', now() - interval '7 hours'),
('c0aa0000-0000-4000-8000-000000000108','Example Ridge Builders','Example Ridge Estate','4','4 Sample Street','Caboolture','QLD',300000,330000,330000,600,3,2,2,390,'House and land','legacy','available', now() - interval '40 days');

-- ── revenue deals and operating costs ───────────────────────────────────────
delete from revenue_deals where id::text like 'c0aa0000%';
insert into revenue_deals (id, lot, purchaser, supplier, remuneration, referrer_fee, referrer_note, stage, notes, payments, created_at) values
('c0aa0000-0000-4000-8000-000000000401','Lot 8 Demo Meadows, Logan Reserve','Mia Anderson','Acacia Demo Homes',42000,8000,'to referring accountant','active','Contract unconditional',
  jsonb_build_array(
    jsonb_build_object('label','1st','date',to_char(now() - interval '20 days','YYYY-MM-DD'),'amount',21000,'paid',true),
    jsonb_build_object('label','2nd','date',to_char(now() + interval '40 days','YYYY-MM-DD'),'amount',21000,'paid',false)), now() - interval '1 minute'),
('c0aa0000-0000-4000-8000-000000000402','Lot 3 Sample Coast Rise, Burpengary','Grace Lee','Sample Coast Developments',38000,0,null,'active',null,
  jsonb_build_array(
    jsonb_build_object('label','1st','date',to_char(now() + interval '10 days','YYYY-MM-DD'),'amount',19000,'paid',false),
    jsonb_build_object('label','2nd','date',to_char(now() + interval '75 days','YYYY-MM-DD'),'amount',19000,'paid',false)), now() - interval '2 minutes'),
('c0aa0000-0000-4000-8000-000000000403','Lot 27 Example Ridge Estate, Caboolture','Liam Nguyen','Example Ridge Builders',45000,10000,'to mortgage broker','active','Finance approved',
  jsonb_build_array(
    jsonb_build_object('label','1st','date',to_char(now() + interval '25 days','YYYY-MM-DD'),'amount',22500,'paid',false),
    jsonb_build_object('label','2nd','date',to_char(now() + interval '110 days','YYYY-MM-DD'),'amount',22500,'paid',false)), now() - interval '3 minutes'),
('c0aa0000-0000-4000-8000-000000000404','Lot 41 Demo Meadows, Logan Reserve','Charlotte Walker','Acacia Demo Homes',52000,0,null,'settled','Settled last month',
  jsonb_build_array(
    jsonb_build_object('label','1st','date',to_char(now() - interval '70 days','YYYY-MM-DD'),'amount',26000,'paid',true),
    jsonb_build_object('label','2nd','date',to_char(now() - interval '30 days','YYYY-MM-DD'),'amount',26000,'paid',true)), now() - interval '4 minutes'),
('c0aa0000-0000-4000-8000-000000000405','Lot 19 Sample Coast Rise, Burpengary','Henry Wilson','Sample Coast Developments',30000,0,null,'active','Entered twice by mistake',
  jsonb_build_array(
    jsonb_build_object('label','1st','date',to_char(now() + interval '50 days','YYYY-MM-DD'),'amount',30000,'paid',false)), now() - interval '5 minutes');

delete from revenue_costs where id::text like 'c0aa0000%';
insert into revenue_costs (id, label, monthly_amount, created_at) values
('c0aa0000-0000-4000-8000-000000000451','Marketing',2500, now() - interval '2 minutes'),
('c0aa0000-0000-4000-8000-000000000452','Insurance and licences',900, now() - interval '1 minute');

-- ── advisor recommendations ─────────────────────────────────────────────────
delete from recommendation_log where id::text like 'c0aa0000%';
insert into recommendation_log (id, kind, title, description, rationale, suggested_action, confidence, impact, status, senior_status, senior_decision_reason, risk_level, started_at, applied_at, created_at) values
('c0aa0000-0000-4000-8000-000000000501','ux_improvement','Call hot leads within one business day','Four hot leads waited more than two days for a first call last week.','Leads called on the day they enquire are far more likely to book a strategy session. The longest wait last week was three days.','Add a morning check of Lead Intake to the daily routine, and set a task for every hot lead that has not been called.',0.86,'high','pending','approved','Sensible and low risk. Agreed.','low',null,null, now() - interval '1 hour'),
('c0aa0000-0000-4000-8000-000000000502','data_quality','Fill in missing budgets on new contacts','Six contacts added this month have no budget recorded.','Without a budget, property matching cannot suggest suitable stock for these people.','Ask for a budget range on the first call and record it on the contact.',0.78,'medium','pending','approved','Agreed. Improves matching.','low',null,null, now() - interval '2 hours'),
('c0aa0000-0000-4000-8000-000000000503','ux_improvement','Send a reminder the day before each appointment','Two booked strategy calls were missed last fortnight.','A short reminder the day before reduces no-shows.','Turn on the day-before reminder for strategy calls.',0.72,'medium','pending','approved','Agreed.','low',null,null, now() - interval '3 hours'),
('c0aa0000-0000-4000-8000-000000000504','other','Post a weekly suburb snapshot on social media','Suburb posts earned the most enquiries of any content last month.','Regular local content keeps the brand in front of first home buyers.','Schedule one suburb snapshot post each Tuesday.',0.61,'low','pending','approved','Worth a trial.','low',null,null, now() - interval '4 hours'),
('c0aa0000-0000-4000-8000-000000000505','data_quality','Tidy up duplicate contacts','Three pairs of contacts share the same email address.','Duplicates split a client''s history across two records.','Merge each pair, keeping the record with the most notes.',0.8,'medium','in_progress','approved','Agreed.','low', now() - interval '2 days', null, now() - interval '6 days'),
('c0aa0000-0000-4000-8000-000000000506','ux_improvement','Add a thank you email after settlement','Settled clients are not hearing from us after handover.','A thank you note at settlement is a natural moment to ask for a referral.','Write a short thank you email and send it within a week of settlement.',0.7,'low','applied','approved','Agreed.','low', null, now() - interval '3 days', now() - interval '12 days');

-- ── brain memories ──────────────────────────────────────────────────────────
delete from crm_memory where id::text like 'c0aa0000%';
insert into crm_memory (id, slug, kind, title, body, source, tags, usefulness, usage_count, updated_at) values
('c0aa0000-0000-4000-8000-000000000601','demo-first-home-buyers-deposit','knowledge','First home buyers usually ask about the deposit first','Open the first call by explaining the deposit options. Most first home buyers want to know how much they need before they will talk about suburbs.','human','{first-home,calls}',1.5,14, now() - interval '1 hour'),
('c0aa0000-0000-4000-8000-000000000602','demo-investors-rental-yield','knowledge','Investors want the rental yield up front','Lead with the weekly rent and gross yield when you present a property to an investor. Leave the floor plan until later.','human','{investor,presenting}',1.0,9, now() - interval '2 hours'),
('c0aa0000-0000-4000-8000-000000000603','demo-follow-up-timing','learning','Tuesday morning follow up calls get the best answer rate','Calls made between nine and eleven on a Tuesday were answered more often than at any other time last quarter.','advisor','{calls,timing}',0.5,6, now() - interval '3 hours'),
('c0aa0000-0000-4000-8000-000000000604','demo-settlement-checklist','playbook','Settlement week checklist','Confirm the settlement date with the client. Check finance is unconditional. Book the handover inspection. Send the thank you email after handover.','human','{settlement,checklist}',2.0,11, now() - interval '4 hours'),
('c0aa0000-0000-4000-8000-000000000605','demo-old-office-hours','knowledge','Office is open Saturdays until noon','We take calls on Saturday mornings until twelve.','human','{office}',-0.5,2, now() - interval '5 hours'),
('c0aa0000-0000-4000-8000-000000000606','demo-olivia-prefers-text','contact_memory','Olivia Bennett prefers a text before a call','Olivia works shifts. Send a text first and she will call back on her break.','voice assistant','{contact}',0.5,3, now() - interval '6 hours'),
('c0aa0000-0000-4000-8000-000000000607','demo-stale-promo','learning','Winter promotion ends 31 August','The winter promotion has finished and should no longer be mentioned.','human','{promotion}',0,1, now() - interval '7 hours');

-- ── analytics: ingestion runs, SMS, sequences ───────────────────────────────
delete from ingestion_run where id::text like 'c0aa0000%';
insert into ingestion_run (id, builder_name, email_subject, started_at, ended_at, status, props_added, props_updated, props_to_review, ai_cost_usd) values
('c0aa0000-0000-4000-8000-000000000701','Acacia Demo Homes','Demo Meadows stock list', now() - interval '5 hours', now() - interval '5 hours' + interval '2 minutes','completed',6,14,2,0.0412),
('c0aa0000-0000-4000-8000-000000000702','Example Ridge Builders','Example Ridge price update', now() - interval '1 day', now() - interval '1 day' + interval '1 minute','completed',2,21,0,0.0368),
('c0aa0000-0000-4000-8000-000000000703','Sample Coast Developments','Sample Coast Rise release', now() - interval '2 days', now() - interval '2 days' + interval '3 minutes','completed',9,4,1,0.0527),
('c0aa0000-0000-4000-8000-000000000704','Example Ridge Builders','Example Ridge stock list', now() - interval '3 days', now() - interval '3 days' + interval '1 minute','failed',0,0,0,0.0031),
('c0aa0000-0000-4000-8000-000000000705','Acacia Demo Homes','Demo Meadows weekly update', now() - interval '5 days', now() - interval '5 days' + interval '2 minutes','completed',3,17,0,0.0389);

delete from sms_log where campaign = 'help-demo';
insert into sms_log (contact_id, phone, body, status, campaign, cost, sent_at)
select c.id, c.phone, 'Hi ' || c.first_name || ', a quick reminder about your call tomorrow.',
       case when c.id = 'd0000000-0000-4000-8000-000000000010' then 'failed' else 'sent' end,
       'help-demo', 0.0790, now() - (g || ' days')::interval
from contacts c cross join generate_series(1, 3) g
where c.id::text like 'd0000000-0000-4000-8000-0000000000%';

insert into sms_opt_outs (phone, contact_id, reason) values
('0491 570 110','d0000000-0000-4000-8000-000000000010','Replied STOP')
on conflict (phone) do nothing;

delete from sequences where id::text like 'c0aa0000%';
insert into sequences (id, slug, name, description, channel) values
('c0aa0000-0000-4000-8000-000000000801','help-demo-welcome','Welcome series (demo)','Three emails over two weeks for new enquiries.','email');
insert into sequence_enrollments (id, sequence_id, contact_id, status) values
('c0aa0000-0000-4000-8000-000000000811','c0aa0000-0000-4000-8000-000000000801','d0000000-0000-4000-8000-000000000001','active'),
('c0aa0000-0000-4000-8000-000000000812','c0aa0000-0000-4000-8000-000000000801','d0000000-0000-4000-8000-000000000002','active'),
('c0aa0000-0000-4000-8000-000000000813','c0aa0000-0000-4000-8000-000000000801','d0000000-0000-4000-8000-000000000003','active'),
('c0aa0000-0000-4000-8000-000000000814','c0aa0000-0000-4000-8000-000000000801','d0000000-0000-4000-8000-000000000004','completed'),
('c0aa0000-0000-4000-8000-000000000815','c0aa0000-0000-4000-8000-000000000801','d0000000-0000-4000-8000-000000000005','completed'),
('c0aa0000-0000-4000-8000-000000000816','c0aa0000-0000-4000-8000-000000000801','d0000000-0000-4000-8000-000000000006','paused'),
('c0aa0000-0000-4000-8000-000000000817','c0aa0000-0000-4000-8000-000000000801','d0000000-0000-4000-8000-000000000010','unsubscribed');
insert into sequence_step_runs (id, enrollment_id, step_position, step_type, status, run_at) values
('c0aa0000-0000-4000-8000-000000000821','c0aa0000-0000-4000-8000-000000000811',1,'email','sent', now() - interval '1 day'),
('c0aa0000-0000-4000-8000-000000000822','c0aa0000-0000-4000-8000-000000000812',1,'email','sent', now() - interval '2 days'),
('c0aa0000-0000-4000-8000-000000000823','c0aa0000-0000-4000-8000-000000000813',2,'email','sent', now() - interval '2 days'),
('c0aa0000-0000-4000-8000-000000000824','c0aa0000-0000-4000-8000-000000000814',3,'email','sent', now() - interval '3 days'),
('c0aa0000-0000-4000-8000-000000000825','c0aa0000-0000-4000-8000-000000000815',3,'email','sent', now() - interval '4 days'),
('c0aa0000-0000-4000-8000-000000000826','c0aa0000-0000-4000-8000-000000000816',2,'email','skipped', now() - interval '4 days'),
('c0aa0000-0000-4000-8000-000000000827','c0aa0000-0000-4000-8000-000000000817',1,'email','failed', now() - interval '5 days');

-- ── saved planning feasibility reports ──────────────────────────────────────
delete from feasibility_reports where id::text like 'c0aa0000%';
insert into feasibility_reports (id, address, title, subtitle, created_by, created_at, transcript, report) values
('c0aa0000-0000-4000-8000-000000000901','27 Placeholder Parade, Logan Reserve QLD 4133','Preliminary Planning Feasibility Assessment','27 Placeholder Parade, Logan Reserve QLD 4133','demo@example.com', now() - interval '2 days','[]'::jsonb,
 '{"title":"Preliminary Planning Feasibility Assessment","subtitle":"27 Placeholder Parade, Logan Reserve QLD 4133","meta":{"scope":"Subdivision and dual occupancy potential","statusPills":[{"label":"Subdivision: likely","tone":"good"},{"label":"Dual occupancy: possible","tone":"warn"}]},"keyStats":[{"n":"1,012 m2","l":"Lot size"},{"n":"Low density residential","l":"Zone"},{"n":"400 m2","l":"Minimum lot size"},{"n":"2 lots","l":"Likely yield"}],"sections":[{"heading":"Summary","blocks":[{"type":"p","text":"This is an illustrative demo report. The block is large enough to consider a two lot subdivision, subject to council assessment."},{"type":"callout","tone":"good","title":"Subdivision","text":"At 1,012 square metres the site exceeds twice the minimum lot size."}]},{"heading":"Planning controls","blocks":[{"type":"table","columns":["Control","Requirement","This site"],"rows":[["Minimum lot size","400 m2","1,012 m2"],["Minimum frontage","10 m","22 m"],["Overlays","Check flood mapping","None identified"]]}]},{"heading":"Next steps","blocks":[{"type":"bullets","items":["Confirm the zone and overlays with council.","Order a survey to confirm dimensions.","Speak with a town planner before any contract."]}]}],"disclaimer":"Demo content for training only. Preliminary information, not planning advice."}'::jsonb),
('c0aa0000-0000-4000-8000-000000000902','3 Example Crescent, Burpengary QLD 4505','Preliminary Planning Feasibility Assessment','3 Example Crescent, Burpengary QLD 4505','demo@example.com', now() - interval '9 days','[]'::jsonb,
 '{"title":"Preliminary Planning Feasibility Assessment","subtitle":"3 Example Crescent, Burpengary QLD 4505","meta":{"scope":"Secondary dwelling potential","statusPills":[{"label":"Secondary dwelling: possible","tone":"warn"}]},"keyStats":[{"n":"480 m2","l":"Lot size"},{"n":"General residential","l":"Zone"}],"sections":[{"heading":"Summary","blocks":[{"type":"p","text":"This is an illustrative demo report. A secondary dwelling may be possible, subject to site cover and car parking."}]}],"disclaimer":"Demo content for training only. Preliminary information, not planning advice."}'::jsonb),
('c0aa0000-0000-4000-8000-000000000903','55 Placeholder Parade, Logan Reserve QLD 4133','Preliminary Planning Feasibility Assessment','55 Placeholder Parade, Logan Reserve QLD 4133','demo@example.com', now() - interval '20 days','[]'::jsonb,
 '{"title":"Preliminary Planning Feasibility Assessment","subtitle":"55 Placeholder Parade, Logan Reserve QLD 4133","sections":[{"heading":"Summary","blocks":[{"type":"p","text":"This is an illustrative demo report that was saved by mistake."}]}],"disclaimer":"Demo content for training only."}'::jsonb);

commit;
