-- Demo rows for the "crm-a" help videos (Opportunities, Deal Analyser, Lead
-- Intake, Introducers, Partners, EOI, Fact Find, Needs Analysis, Credit
-- Authorisation, Client Documents, Preliminary Assessments).
-- Every person, firm and address here is made up. Safe to re-run: it deletes
-- its own rows (fixed ids) and inserts them again, so a recording that changes
-- or deletes something can simply be recorded again.

-- ── Deal Analyser ───────────────────────────────────────────────────────────
delete from pia_reports where results->>'deal_packet_id' in
  ('da000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000002','da000000-0000-4000-8000-000000000003');
delete from deal_packets where id in
  ('da000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000002','da000000-0000-4000-8000-000000000003');

insert into deal_packets (id, status, property_count, opportunity_id, created_at, packet) values
('da000000-0000-4000-8000-000000000001','needs_rent_input',2,null, now() - interval '1 day', $j${
  "status":"needs_rent_input","redactions":[],"client_hint":null,
  "properties":[
    {"suburb":"Ripley","address":"Lot 12 Sample Street","contract_type":"single","property_type":"House & Land",
     "specs":{"total_price":685000,"land_price":310000,"build_price":375000,"land_size_m2":420,"house_size_m2":198,"estate":"Demo Rise Estate","state":"QLD","house_design":"Example 198","bedrooms":4,"bathrooms":2,"car_spaces":2,"living_areas":2,"is_co_living":false,"key_inclusions":["Fixed price build","Landscaping","Air conditioning"],"image_paths":[]},
     "market":null,"rent_basis":{"weekly_rent":null,"per_room":false,"rooms":null,"source":null},
     "thesis_points":["Growth corridor west of Brisbane","New schools and shops planned nearby"],"verify_flags":[]},
    {"suburb":"Caboolture","address":"Lot 48 Example Court","contract_type":"single","property_type":"House & Land",
     "specs":{"total_price":712000,"land_price":335000,"build_price":377000,"land_size_m2":450,"house_size_m2":205,"estate":"Demo Fields Estate","state":"QLD","house_design":"Example 205","bedrooms":4,"bathrooms":2,"car_spaces":2,"living_areas":2,"is_co_living":false,"key_inclusions":["Fixed price build","Fencing","Stone benchtops"],"image_paths":[]},
     "market":null,"rent_basis":{"weekly_rent":640,"per_room":false,"rooms":null,"source":"email_body"},
     "thesis_points":["Train line to Brisbane","Hospital and university precinct close by"],"verify_flags":[]}
  ]}$j$::jsonb),
('da000000-0000-4000-8000-000000000002','ready',2,null, now() - interval '4 days', $j${
  "status":"ready","redactions":[],"client_hint":null,
  "properties":[
    {"suburb":"Logan Reserve","address":"Lot 7 Demo Parade","contract_type":"single","property_type":"House & Land",
     "specs":{"total_price":698000,"land_price":320000,"build_price":378000,"land_size_m2":400,"house_size_m2":195,"estate":"Sample Park Estate","state":"QLD","house_design":"Example 195","bedrooms":4,"bathrooms":2,"car_spaces":2,"living_areas":2,"is_co_living":false,"key_inclusions":["Fixed price build","Landscaping"],"image_paths":[]},
     "market":null,"rent_basis":{"weekly_rent":630,"per_room":false,"rooms":null,"source":"email_body"},
     "thesis_points":["Close to the motorway","Strong rental demand"],"verify_flags":[]},
    {"suburb":"Yarrabilba","address":"Lot 31 Example Avenue","contract_type":"single","property_type":"House & Land",
     "specs":{"total_price":672000,"land_price":298000,"build_price":374000,"land_size_m2":375,"house_size_m2":188,"estate":"Sample Green Estate","state":"QLD","house_design":"Example 188","bedrooms":4,"bathrooms":2,"car_spaces":2,"living_areas":1,"is_co_living":false,"key_inclusions":["Fixed price build","Fencing"],"image_paths":[]},
     "market":null,"rent_basis":{"weekly_rent":610,"per_room":false,"rooms":null,"source":"email_body"},
     "thesis_points":["Master planned community","New town centre under way"],"verify_flags":[]}
  ]}$j$::jsonb),
('da000000-0000-4000-8000-000000000003','ready',1,null, now() - interval '9 days', $j${
  "status":"ready","redactions":[],"client_hint":null,
  "properties":[
    {"suburb":"Pimpama","address":"Lot 3 Sample Crescent","contract_type":"single","property_type":"House & Land",
     "specs":{"total_price":745000,"land_price":360000,"build_price":385000,"land_size_m2":410,"house_size_m2":201,"estate":"Demo Waters Estate","state":"QLD","house_design":"Example 201","bedrooms":4,"bathrooms":2,"car_spaces":2,"living_areas":2,"is_co_living":false,"key_inclusions":["Fixed price build","Landscaping"],"image_paths":[]},
     "market":null,"rent_basis":{"weekly_rent":690,"per_room":false,"rooms":null,"source":"email_body"},
     "thesis_points":["Between Brisbane and the Gold Coast","Train station nearby"],"verify_flags":[]}
  ]}$j$::jsonb);

-- ── Lead Intake ─────────────────────────────────────────────────────────────
delete from property_leads where id::text like 'e1000000-0000-4000-8000-%';
insert into property_leads (id, created_at, name, email, phone, buyer_type, state, budget, triage_score, match_status, top_match_name, source, promoted_at, promoted_opportunity_id) values
('e1000000-0000-4000-8000-000000000001', now() - interval '3 hours', 'Sophie Turner-Demo', 'sophie.demo@example.com', '0491 570 121', 'first home buyer', 'QLD', 620000, 78, 'matched', 'House and land, Ripley', 'springboard', null, null),
('e1000000-0000-4000-8000-000000000002', now() - interval '8 hours', 'Oscar Demo', 'oscar.demo@example.com', '0491 570 122', 'investor', 'NSW', 700000, 66, 'matched', 'House and land, Caboolture', 'facebook', null, null),
('e1000000-0000-4000-8000-000000000003', now() - interval '1 day', 'Ruby Sample', 'ruby.sample@example.com', '0491 570 123', 'first home buyer', 'QLD', 560000, 52, 'pending', null, 'springboard', null, null),
('e1000000-0000-4000-8000-000000000004', now() - interval '2 days', 'Archie Example', 'archie.example@example.com', '0491 570 124', 'investor', 'VIC', 800000, 71, 'matched', 'Dual occupancy, Logan Reserve', 'facebook', null, null),
('e1000000-0000-4000-8000-000000000005', now() - interval '3 days', 'Zoe Placeholder', 'zoe.placeholder@example.com', '0491 570 125', 'owner occupier', 'QLD', 590000, 44, 'unmatched', null, 'website', null, null),
('e1000000-0000-4000-8000-000000000006', now() - interval '6 days', 'Noah Patel', 'noah.patel@example.com', '0491 570 104', 'first home buyer', 'QLD', 580000, 55, 'matched', 'House and land, Yarrabilba', 'website', now() - interval '5 days', 'opp-1002'),
('e1000000-0000-4000-8000-000000000007', now() - interval '9 days', 'Grace Lee', 'grace.lee@example.com', '0491 570 111', 'investor', 'QLD', 680000, 79, 'matched', 'House and land, Pimpama', 'facebook', now() - interval '8 days', 'opp-2003');

-- ── Introducers ─────────────────────────────────────────────────────────────
-- The audit tables are append-only (a trigger blocks deletes). In this demo
-- database only, switch triggers off for the one statement that clears my rows.
begin;
set local session_replication_role = replica;
delete from introducer_events where introducer_id::text like 'e2000000-0000-4000-8000-%' or client_id::text like 'e2100000-0000-4000-8000-%';
commit;
delete from introducer_info_requests where client_id::text like 'e2100000-0000-4000-8000-%';
delete from introducer_unlock_grants where client_id::text like 'e2100000-0000-4000-8000-%';
delete from introducer_clients where introducer_id::text like 'e2000000-0000-4000-8000-%';
delete from introducer_users where introducer_id::text like 'e2000000-0000-4000-8000-%';
delete from introducer_applications where email like '%@demo-introducer.example.com';
delete from introducers where id::text like 'e2000000-0000-4000-8000-%';

insert into introducers (id, firm_name, contact_name, contact_email, contact_phone, agreement_ref, agreement_signed_at, abn, status, tier, created_at) values
('e2000000-0000-4000-8000-000000000001','Harbourline Advisory (Demo)','Priya Demo','priya@harbourline.example.com','0491 570 131','DEMO-AGR-001', now() - interval '60 days','00 000 000 001','active','t1', now() - interval '60 days'),
('e2000000-0000-4000-8000-000000000002','Sample and Co Accountants','Marcus Sample','marcus@sampleandco.example.com','0491 570 132','DEMO-AGR-002', now() - interval '30 days','00 000 000 002','active','t1', now() - interval '30 days');

insert into introducer_users (id, introducer_id, email, full_name, is_primary, status, invited_at, last_login_at) values
('e2200000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','priya@harbourline.example.com','Priya Demo',true,'active', now() - interval '60 days', now() - interval '1 day'),
('e2200000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000001','tom@harbourline.example.com','Tom Example',false,'active', now() - interval '40 days', now() - interval '6 days'),
('e2200000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000002','marcus@sampleandco.example.com','Marcus Sample',true,'active', now() - interval '30 days', null);

insert into introducer_clients (id, introducer_id, submitted_by, client_ref, first_name, last_name, email, phone, dob, state, suburb, postcode, employment_status, income_band, deposit_band, purchase_intent, timeframe, buying_in, notes, consent_confirmed_at, consent_statement, status, submitted_at, stage, stage_updated_at, pack_type) values
('e2100000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e2200000-0000-4000-8000-000000000001','DEMO-R-0001','Daniel','Sample-Reid','daniel.reid@example.com','0491 570 141','1990-04-12','QLD','Springfield Lakes','4300','Full time','$90,000 – $120,000','$40,000 – $60,000','First home','1 – 3 months','Ipswich or Springfield','Renting now. Keen to move before the lease ends.', now() - interval '2 days','The client agreed to be introduced.','submitted', now() - interval '2 days','received', now() - interval '2 days','referral'),
('e2100000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000002','e2200000-0000-4000-8000-000000000003','DEMO-R-0002','Hannah','Example-Cole','hannah.cole@example.com',null,'1986-09-30','QLD','Redcliffe','4020','Self employed','$120,000 – $160,000','$60,000 – $100,000','Investment','3 – 6 months',null,null, now() - interval '1 day','The client agreed to be introduced.','submitted', now() - interval '1 day','received', now() - interval '1 day','referral'),
('e2100000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000001','e2200000-0000-4000-8000-000000000002','DEMO-R-0003','Wei','Demo-Zhang','wei.zhang@example.com','0491 570 143','1993-01-08','QLD','Coomera','4209','Full time','$60,000 – $90,000','$20,000 – $40,000','First home','6 – 12 months','Northern Gold Coast',null, now() - interval '5 days','The client agreed to be introduced.','info_requested', now() - interval '5 days','under_review', now() - interval '3 days','referral');

insert into introducer_info_requests (id, client_id, requested_by, message, fields, documents, status, created_at) values
('e2300000-0000-4000-8000-000000000001','e2100000-0000-4000-8000-000000000003','demo@example.com','Please send through a recent payslip so we can confirm income.', '{}', '{Recent payslip}', 'open', now() - interval '3 days');

-- ── Partners ────────────────────────────────────────────────────────────────
begin;
set local session_replication_role = replica;
delete from partner_events where partner_id::text like 'e3000000-0000-4000-8000-%';
commit;
delete from partners where id::text like 'e3000000-0000-4000-8000-%' or contact_email like '%@demo-partner.example.com';
delete from channel_partners where id::text like 'e3500000-0000-4000-8000-%';
delete from global_stock_pool where id::text like 'e3400000-0000-4000-8000-%';

insert into global_stock_pool (id, builder_name, estate_name, lot_number, street_address, suburb, state, property_type, bedrooms, bathrooms, car_spaces, land_size_sqm, land_price, build_price, status, pipeline_status) values
('e3400000-0000-4000-8000-000000000001','Demo Homes Pty Ltd','Sample Park Estate','7','7 Demo Parade','Logan Reserve','QLD','House & Land',4,2,2,400,320000,378000,'available','active'),
('e3400000-0000-4000-8000-000000000002','Demo Homes Pty Ltd','Sample Green Estate','31','31 Example Avenue','Yarrabilba','QLD','House & Land',4,2,2,375,298000,374000,'available','active'),
('e3400000-0000-4000-8000-000000000003','Example Builders Pty Ltd','Demo Waters Estate','3','3 Sample Crescent','Pimpama','QLD','House & Land',4,2,2,410,360000,385000,'available','active');

insert into channel_partners (id, company, channel_type, contact_name, email, phone, location, status) values
('e3500000-0000-4000-8000-000000000001','Northside Example Planners','Financial planner','Jordan Example','jordan@demo-partner.example.com','0491 570 153','Brisbane QLD','prospect');

insert into partners (id, firm_name, abn, contact_name, contact_email, contact_phone, status, agreement_ref, agreement_signed_at, tier, feature_grants, branding, created_at) values
('e3000000-0000-4000-8000-000000000001','Bayside Wealth Partners (Demo)','00 000 000 011','Sam Placeholder','sam@bayside.example.com','0491 570 151','active','DEMO-PA-001', now() - interval '45 days','basic','{}','{}', now() - interval '45 days'),
('e3000000-0000-4000-8000-000000000002','Example Mortgage Group','00 000 000 012','Alex Sample','alex@examplemortgage.example.com','0491 570 152','active','DEMO-PA-002', now() - interval '20 days','professional','{}','{}', now() - interval '20 days');

insert into partner_users (id, partner_id, email, full_name, is_primary, status, invited_at, last_login_at) values
('e3200000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','sam@bayside.example.com','Sam Placeholder',true,'active', now() - interval '45 days', now() - interval '1 day'),
('e3200000-0000-4000-8000-000000000002','e3000000-0000-4000-8000-000000000002','alex@examplemortgage.example.com','Alex Sample',true,'active', now() - interval '20 days', now() - interval '3 days');

insert into partner_clients (id, partner_id, created_by_user_id, first_name, last_name, email, phone, state, budget_max, status, consent_confirmed_at) values
('e3100000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','e3200000-0000-4000-8000-000000000001','Morgan','Demo-Fraser','morgan.fraser@example.com','0491 570 161','QLD',720000,'active', now() - interval '3 days'),
('e3100000-0000-4000-8000-000000000002','e3000000-0000-4000-8000-000000000002','e3200000-0000-4000-8000-000000000002','Casey','Example-Ward','casey.ward@example.com','0491 570 162','QLD',700000,'active', now() - interval '12 days'),
('e3100000-0000-4000-8000-000000000003','e3000000-0000-4000-8000-000000000002','e3200000-0000-4000-8000-000000000002','Riley','Sample-Khan','riley.khan@example.com','0491 570 163','QLD',760000,'active', now() - interval '25 days');

insert into partner_enquiries (id, partner_id, client_id, property_id, created_by_user_id, stage, stage_updated_at, partner_note, lot_summary, price_snapshot, referral_fee_snapshot, hold_expires_at, created_at) values
('e3300000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','e3100000-0000-4000-8000-000000000001','e3400000-0000-4000-8000-000000000001','e3200000-0000-4000-8000-000000000001','requested', now() - interval '5 hours','Client has finance pre-approval and wants to move quickly.','{"ref":"NK-D0007","bedrooms":4,"propertyType":"House & Land","suburb":"Logan Reserve","state":"QLD"}', 698000, 12000, null, now() - interval '5 hours'),
('e3300000-0000-4000-8000-000000000002','e3000000-0000-4000-8000-000000000002','e3100000-0000-4000-8000-000000000002','e3400000-0000-4000-8000-000000000002','e3200000-0000-4000-8000-000000000002','hold', now() - interval '2 days','Second property for this client.','{"ref":"NK-D0031","bedrooms":4,"propertyType":"House & Land","suburb":"Yarrabilba","state":"QLD"}', 672000, 11000, now() + interval '2 days', now() - interval '4 days'),
('e3300000-0000-4000-8000-000000000003','e3000000-0000-4000-8000-000000000002','e3100000-0000-4000-8000-000000000003','e3400000-0000-4000-8000-000000000003','e3200000-0000-4000-8000-000000000002','eoi', now() - interval '6 days',null,'{"ref":"NK-D0003","bedrooms":4,"propertyType":"House & Land","suburb":"Pimpama","state":"QLD"}', 745000, 13000, now() + interval '5 days', now() - interval '14 days');

-- ── Expressions of Interest ─────────────────────────────────────────────────
-- Also clears EOIs a recording created (blank ones, and the one typed in the video).
delete from aml_cases where id in (select aml_case_id from eois where id::text like 'e4000000-0000-4000-8000-%' and aml_case_id is not null);
delete from signature_requests where doc_type = 'eoi' and (doc_id::text like 'e4000000-0000-4000-8000-%' or doc_id in (select id from eois where summary is null or summary = 'Unnamed buyer' or summary like 'Amelia Thompson%'));
delete from compliance_document_audit where doc_id::text like 'e4000000-0000-4000-8000-%';
delete from eois where id::text like 'e4000000-0000-4000-8000-%' or summary is null or summary = 'Unnamed buyer' or summary like 'Amelia Thompson%';

insert into eois (id, summary, status, contact_id, opportunity_id, purchase_price, data, created_by, created_at, updated_at) values
('e4000000-0000-4000-8000-000000000001','Olivia Bennett — Lot 12 Sample Street, Ripley QLD','Draft','d0000000-0000-4000-8000-000000000001','opp-1001',685000, $j${
  "date":"2026-10-08","buyers":[{"fullName":"Olivia Bennett","email":"olivia.bennett@example.com","mobile":"0491 570 101"}],
  "purchasingEntity":"","buyerAddress":"14 Example Road, Chermside QLD 4032","fax":"","smsfPurchase":false,"smsfEstablished":null,"acnAbn":"","taxFileNos":"",
  "solicitor":{"name":"Example Conveyancing","attention":"Kim Demo","address":"1 Sample Lane, Brisbane QLD 4000","phone":"0491 570 171","fax":"","email":"kim@exampleconveyancing.example.com"},
  "property":{"address":"Lot 12 Sample Street, Ripley QLD","purchasePrice":685000},
  "deposit":{"total":"$34,250","initialHolding":"$1,000"},
  "finance":{"subjectToFinance":true,"financeTerm":"21","financeOther":"","settlementTerm":"other","settlementOther":"On completion"},
  "notes":"","broker":{"name":"","email":""}}$j$::jsonb, 'demo@example.com', now() - interval '1 day', now() - interval '1 day'),
('e4000000-0000-4000-8000-000000000002','Liam Nguyen — Lot 48 Example Court, Caboolture QLD','Sent','d0000000-0000-4000-8000-000000000002','opp-2001',712000, $j${
  "date":"2026-10-05","buyers":[{"fullName":"Liam Nguyen","email":"liam.nguyen@example.com","mobile":"0491 570 102"}],
  "purchasingEntity":"","buyerAddress":"8 Demo Street, Parramatta NSW 2150","fax":"","smsfPurchase":false,"smsfEstablished":null,"acnAbn":"","taxFileNos":"",
  "solicitor":{"name":"Example Conveyancing","attention":"Kim Demo","address":"1 Sample Lane, Brisbane QLD 4000","phone":"0491 570 171","fax":"","email":"kim@exampleconveyancing.example.com"},
  "property":{"address":"Lot 48 Example Court, Caboolture QLD","purchasePrice":712000},
  "deposit":{"total":"TBC","initialHolding":"$1,000"},
  "finance":{"subjectToFinance":true,"financeTerm":"21","financeOther":"","settlementTerm":"other","settlementOther":"On completion"},
  "notes":"","broker":{"name":"","email":""}}$j$::jsonb, 'demo@example.com', now() - interval '4 days', now() - interval '3 days'),
('e4000000-0000-4000-8000-000000000003','Mia Anderson — Lot 3 Sample Crescent, Pimpama QLD','Signed','d0000000-0000-4000-8000-000000000009','opp-2002',745000, $j${
  "date":"2026-09-28","buyers":[{"fullName":"Mia Anderson","email":"mia.anderson@example.com","mobile":"0491 570 109"}],
  "purchasingEntity":"","buyerAddress":"22 Sample Avenue, Toowoomba QLD 4350","fax":"","smsfPurchase":false,"smsfEstablished":null,"acnAbn":"","taxFileNos":"",
  "solicitor":{"name":"Example Conveyancing","attention":"Kim Demo","address":"1 Sample Lane, Brisbane QLD 4000","phone":"0491 570 171","fax":"","email":"kim@exampleconveyancing.example.com"},
  "property":{"address":"Lot 3 Sample Crescent, Pimpama QLD","purchasePrice":745000},
  "deposit":{"total":"$37,250","initialHolding":"$1,000"},
  "finance":{"subjectToFinance":false,"financeTerm":"","financeOther":"","settlementTerm":"other","settlementOther":"On completion"},
  "notes":"","broker":{"name":"","email":""}}$j$::jsonb, 'demo@example.com', now() - interval '11 days', now() - interval '9 days'),
('e4000000-0000-4000-8000-000000000004','Sample Duplicate — Lot 12 Sample Street, Ripley QLD','Draft',null,null,685000, $j${
  "date":"2026-10-08","buyers":[{"fullName":"Sample Duplicate","email":"sample.duplicate@example.com","mobile":"0491 570 190"}],
  "property":{"address":"Lot 12 Sample Street, Ripley QLD","purchasePrice":685000}}$j$::jsonb, 'demo@example.com', now() - interval '2 hours', now() - interval '2 hours');

-- ── Fact Find ───────────────────────────────────────────────────────────────
-- Also clears fact finds a recording created for Charlotte Walker, or left blank.
delete from signature_requests where doc_type = 'fact_find' and (doc_id::text like 'e5000000-0000-4000-8000-%' or doc_id in (select id from borrower_fact_finds where contact_id = 'd0000000-0000-4000-8000-000000000003'));
delete from compliance_document_audit where doc_id::text like 'e5000000-0000-4000-8000-%';
delete from borrower_fact_finds where id::text like 'e5000000-0000-4000-8000-%'
  or contact_id = 'd0000000-0000-4000-8000-000000000003'
  or (contact_id is null and coalesce(applicant_name,'') = '')
  or (contact_id = 'd0000000-0000-4000-8000-000000000001' and created_at > now() - interval '2 days' and id::text not like 'e5000000-%');

insert into borrower_fact_finds (id, applicant_name, status, contact_id, loan_amount, referred_by, data, created_by, created_at, updated_at) values
('e5000000-0000-4000-8000-000000000001','Bennett, Olivia','In review','d0000000-0000-4000-8000-000000000001',585000,'Website', $j${
  "referred_by":"Website",
  "loan":{"purpose":"Purchase a first home","term_months":360,"amount_required":585000,"repayment_strategy":"Principal and interest from salary","expected_settlement":"2026-12-15"},
  "applicants":[
    {"email":"olivia.bennett@example.com","title":"Ms","address":"14 Example Road, Chermside QLD","capacity":"","has_hecs":false,"postcode":"4032","occupation":"Nurse","phone_home":"0491 570 101","phone_work":"","family_name":"Bennett","given_names":"Olivia","hecs_balance":null,"annual_income":92000,"date_of_birth":"1994-03-18","drivers_licence":""},
    {"email":"","title":"","address":"","capacity":"","has_hecs":false,"postcode":"","occupation":"","phone_home":"","phone_work":"","family_name":"","given_names":"","hecs_balance":null,"annual_income":null,"date_of_birth":"","drivers_licence":""}],
  "securities":[{"use":"Owner occupied","suburb":"Ripley","zoning":"Residential","address":"Lot 12 Sample Street","postcode":"4306","ownership":"Being purchased","phone_mobile":"","phone_business":"","estimated_value":685000,"quick_valuation":false,"rental_per_week":null,"folio_identifier":"","phone_after_hours":"","valuer_contact_name":""}]
}$j$::jsonb, 'demo@example.com', now() - interval '3 days', now() - interval '1 day'),
('e5000000-0000-4000-8000-000000000002','Robinson, Isla & Clarke, Ethan','Draft','d0000000-0000-4000-8000-000000000007',648000,'Website', $j${
  "referred_by":"Website",
  "loan":{"purpose":"Purchase a first home","term_months":360,"amount_required":648000,"repayment_strategy":"","expected_settlement":""},
  "applicants":[
    {"email":"isla.robinson@example.com","title":"Ms","address":"5 Demo Place, Newcastle NSW","capacity":"","has_hecs":false,"postcode":"2300","occupation":"Accountant","phone_home":"0491 570 107","phone_work":"","family_name":"Robinson","given_names":"Isla","hecs_balance":null,"annual_income":105000,"date_of_birth":"","drivers_licence":""},
    {"email":"ethan.clarke@example.com","title":"Mr","address":"5 Demo Place, Newcastle NSW","capacity":"","has_hecs":false,"postcode":"2300","occupation":"Carpenter","phone_home":"0491 570 108","phone_work":"","family_name":"Clarke","given_names":"Ethan","hecs_balance":null,"annual_income":95000,"date_of_birth":"","drivers_licence":""}]
}$j$::jsonb, 'demo@example.com', now() - interval '6 days', now() - interval '5 days'),
('e5000000-0000-4000-8000-000000000003','Anderson, Mia','Complete','d0000000-0000-4000-8000-000000000009',670000,'Referral', $j${
  "referred_by":"Referral",
  "loan":{"purpose":"Purchase an investment property","term_months":360,"amount_required":670000,"repayment_strategy":"Rent and salary","expected_settlement":"2026-11-20"},
  "applicants":[
    {"email":"mia.anderson@example.com","title":"Dr","address":"22 Sample Avenue, Toowoomba QLD","capacity":"","has_hecs":false,"postcode":"4350","occupation":"Dentist","phone_home":"0491 570 109","phone_work":"","family_name":"Anderson","given_names":"Mia","hecs_balance":null,"annual_income":240000,"date_of_birth":"1985-07-02","drivers_licence":""},
    {"email":"","title":"","address":"","capacity":"","has_hecs":false,"postcode":"","occupation":"","phone_home":"","phone_work":"","family_name":"","given_names":"","hecs_balance":null,"annual_income":null,"date_of_birth":"","drivers_licence":""}]
}$j$::jsonb, 'demo@example.com', now() - interval '14 days', now() - interval '10 days');

-- ── Needs Analysis ──────────────────────────────────────────────────────────
-- Also clears ones a recording created (blank, typed in the video, or made from a fact find).
delete from signature_requests where doc_type = 'needs_analysis' and doc_id::text like 'e6000000-0000-4000-8000-%';
delete from compliance_document_audit where doc_id::text like 'e6000000-0000-4000-8000-%';
delete from nccp_needs_analyses where id::text like 'e6000000-0000-4000-8000-%'
  or (contact_id is null and (coalesce(applicant_name,'') = '' or applicant_name ilike '%Thompson%'))
  or (contact_id in ('d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000003') and created_at > now() - interval '2 days');

insert into nccp_needs_analyses (id, applicant_name, status, contact_id, loan_amount, data, created_by, created_at, updated_at) values
('e6000000-0000-4000-8000-000000000001','Nguyen, Liam','In review','d0000000-0000-4000-8000-000000000002',600000, $j${
  "interview_type":"phone","location":"Phone","date_time":"6 October, 10 am",
  "needs_objectives":"Buy a second investment property and keep repayments comfortable.",
  "loan_amount_sought":600000,"purchased_or_signed_cos":false,"first_home_buyer":false,
  "applicants":[{"title":"Mr","surname":"Nguyen","given_names":"Liam","dob":"1988-11-05","contact":{"email":"liam.nguyen@example.com","mobile":"0491 570 102"},"current_address":{"street":"8 Demo Street","suburb":"Parramatta","state":"NSW","postcode":"2150"}},{}]
}$j$::jsonb, 'demo@example.com', now() - interval '3 days', now() - interval '2 days'),
('e6000000-0000-4000-8000-000000000002','Robinson, Isla & Clarke, Ethan','Draft','d0000000-0000-4000-8000-000000000007',648000, $j${
  "interview_type":"face_to_face","location":"Newcastle office","date_time":"2 October, 2 pm",
  "needs_objectives":"Buy a first home together.",
  "loan_amount_sought":648000,"purchased_or_signed_cos":false,"first_home_buyer":true,
  "applicants":[{"title":"Ms","surname":"Robinson","given_names":"Isla","contact":{"email":"isla.robinson@example.com"}},{"title":"Mr","surname":"Clarke","given_names":"Ethan","contact":{"email":"ethan.clarke@example.com"}}]
}$j$::jsonb, 'demo@example.com', now() - interval '7 days', now() - interval '6 days'),
('e6000000-0000-4000-8000-000000000003','Anderson, Mia','Complete','d0000000-0000-4000-8000-000000000009',670000, $j${
  "interview_type":"face_to_face","location":"Toowoomba","date_time":"24 September, 9 am",
  "needs_objectives":"Add a third investment property.",
  "loan_amount_sought":670000,"purchased_or_signed_cos":true,"first_home_buyer":false,
  "applicants":[{"title":"Dr","surname":"Anderson","given_names":"Mia","dob":"1985-07-02","contact":{"email":"mia.anderson@example.com"}},{}]
}$j$::jsonb, 'demo@example.com', now() - interval '15 days', now() - interval '11 days');

-- ── Credit Authorisation ────────────────────────────────────────────────────
delete from signature_requests where doc_type = 'credit_authorisation' and doc_id::text like 'e7000000-0000-4000-8000-%';
delete from compliance_document_audit where doc_id::text like 'e7000000-0000-4000-8000-%';
delete from credit_authorisations where id::text like 'e7000000-0000-4000-8000-%'
  or (contact_id is null and (coalesce(names,'') = '' or names ilike '%Thompson%'))
  or (contact_id = 'd0000000-0000-4000-8000-000000000002' and created_at > now() - interval '2 days');

insert into credit_authorisations (id, names, status, contact_id, data, created_by, created_at, updated_at) values
('e7000000-0000-4000-8000-000000000001','Olivia Bennett','draft','d0000000-0000-4000-8000-000000000001', $j${"names":"Olivia Bennett","address":"14 Example Road, Chermside QLD 4032","signers":[{"name":"Olivia Bennett","email":"olivia.bennett@example.com"}],"status":"draft"}$j$::jsonb, 'demo@example.com', now() - interval '2 days', now() - interval '2 days'),
('e7000000-0000-4000-8000-000000000002','Isla Robinson and Ethan Clarke','draft','d0000000-0000-4000-8000-000000000007', $j${"names":"Isla Robinson and Ethan Clarke","address":"5 Demo Place, Newcastle NSW 2300","signers":[{"name":"Isla Robinson","email":"isla.robinson@example.com"},{"name":"Ethan Clarke","email":"ethan.clarke@example.com"}],"status":"draft"}$j$::jsonb, 'demo@example.com', now() - interval '5 days', now() - interval '5 days'),
('e7000000-0000-4000-8000-000000000003','Mia Anderson','signed','d0000000-0000-4000-8000-000000000009', $j${"names":"Mia Anderson","address":"22 Sample Avenue, Toowoomba QLD 4350","signers":[{"name":"Mia Anderson","email":"mia.anderson@example.com"}],"signatories":[{"signed":true,"date":"2026-09-26"},{"signed":false,"date":""}],"status":"signed"}$j$::jsonb, 'demo@example.com', now() - interval '14 days', now() - interval '13 days');

-- ── Preliminary Assessments ─────────────────────────────────────────────────
-- Applicant emails on the two unmatched rows deliberately differ from the
-- contact's email, so the list does not match them automatically.
delete from preliminary_assessments where id::text like 'e9000000-0000-4000-8000-%';
insert into preliminary_assessments (id, yla_ref, source_message_id, received_at, email_subject, pdf_path, pdf_filename, data, status, contact_id, matched_by, matched_at, presented_at, signing_sent_at) values
('e9000000-0000-4000-8000-000000000001','DEMO-4411','demo-pa-msg-0001', now() - interval '5 hours','Preliminary Assessment DEMO-4411','demo/DEMO-4411.pdf','Preliminary Assessment DEMO-4411.pdf', '{"applicants":[{"name":"Lucas Martin","email":"lucas.work@example.com"}],"property":"House and land, Logan Reserve QLD"}', 'Received', null, null, null, null, null),
('e9000000-0000-4000-8000-000000000002','DEMO-4398','demo-pa-msg-0002', now() - interval '1 day','Preliminary Assessment DEMO-4398','demo/DEMO-4398.pdf','Preliminary Assessment DEMO-4398.pdf', '{"applicants":[{"name":"Henry Wilson","email":"h.wilson.home@example.com"}],"property":"House and land, Pimpama QLD"}', 'Received', null, null, null, null, null),
('e9000000-0000-4000-8000-000000000003','DEMO-4372','demo-pa-msg-0003', now() - interval '2 days','Preliminary Assessment DEMO-4372','demo/DEMO-4372.pdf','Preliminary Assessment DEMO-4372.pdf', '{"applicants":[{"name":"Olivia Bennett","email":"olivia.bennett@example.com"}],"property":"Lot 12 Sample Street, Ripley QLD"}', 'Received', 'd0000000-0000-4000-8000-000000000001', 'auto:email', now() - interval '2 days', null, null),
('e9000000-0000-4000-8000-000000000004','DEMO-4350','demo-pa-msg-0004', now() - interval '4 days','Preliminary Assessment DEMO-4350','demo/DEMO-4350.pdf','Preliminary Assessment DEMO-4350.pdf', '{"applicants":[{"name":"Isla Robinson","email":"isla.robinson@example.com"},{"name":"Ethan Clarke","email":"ethan.clarke@example.com"}],"property":"House and land, Newcastle NSW"}', 'Sent for signing', 'd0000000-0000-4000-8000-000000000007', 'auto:email', now() - interval '4 days', now() - interval '3 days', now() - interval '3 days'),
('e9000000-0000-4000-8000-000000000005','DEMO-4301','demo-pa-msg-0005', now() - interval '9 days','Preliminary Assessment DEMO-4301','demo/DEMO-4301.pdf','Preliminary Assessment DEMO-4301.pdf', '{"applicants":[{"name":"Mia Anderson","email":"mia.anderson@example.com"}],"property":"Lot 3 Sample Crescent, Pimpama QLD"}', 'Signed', 'd0000000-0000-4000-8000-000000000009', 'auto:email', now() - interval '9 days', now() - interval '8 days', now() - interval '8 days');

-- ── Client Documents ────────────────────────────────────────────────────────
-- Also clears requests a recording created for Amelia Thompson.
-- The files listed are names only: nothing is stored behind them.
delete from document_requests where id::text like 'e8000000-0000-4000-8000-%' or applicant_email = 'amelia.thompson@example.com';

insert into document_requests (id, token_hash, applicant_name, applicant_email, applicant_phone, applicant_count, contact_id, opportunity_id, status, client_ref, created_by, created_at, expires_at, verification_status, verified_at, drive_folder_id, drive_folder_url, submitted_at, yla_submitted_at, submit_target) values
('e8000000-0000-4000-8000-000000000001','demo-token-hash-crm-a-0001','Olivia Bennett','olivia.bennett@example.com','0491 570 101',1,'d0000000-0000-4000-8000-000000000001','opp-1001','open','NK-DEMO-0101','demo@example.com', now() - interval '3 days', now() + interval '27 days', null, null, null, null, null, null,'yla'),
('e8000000-0000-4000-8000-000000000002','demo-token-hash-crm-a-0002','Liam Nguyen','liam.nguyen@example.com','0491 570 102',1,'d0000000-0000-4000-8000-000000000002','opp-2001','open','NK-DEMO-0102','demo@example.com', now() - interval '8 days', now() + interval '22 days', 'passed', now() - interval '1 day', 'demo-folder-0102', 'https://drive.example.com/demo-folder-0102', null, null,'yla'),
('e8000000-0000-4000-8000-000000000003','demo-token-hash-crm-a-0003','Henry Wilson','henry.wilson@example.com','0491 570 112',1,'d0000000-0000-4000-8000-000000000012','opp-1006','open','NK-DEMO-0103','demo@example.com', now() - interval '1 day', now() + interval '29 days', null, null, null, null, null, null,'yla'),
('e8000000-0000-4000-8000-000000000004','demo-token-hash-crm-a-0004','Mia Anderson','mia.anderson@example.com','0491 570 109',1,'d0000000-0000-4000-8000-000000000009','opp-2002','submitted','NK-DEMO-0104','demo@example.com', now() - interval '20 days', now() + interval '10 days', 'passed', now() - interval '15 days', 'demo-folder-0104', 'https://drive.example.com/demo-folder-0104', now() - interval '14 days', now() - interval '14 days','yla'),
('e8000000-0000-4000-8000-000000000005','demo-token-hash-crm-a-0005','Noah Patel','noah.patel@example.com','0491 570 104',1,'d0000000-0000-4000-8000-000000000004','opp-1002','open','NK-DEMO-0105','demo@example.com', now() - interval '5 days', now() + interval '25 days', null, null, null, null, null, null,'yla');

insert into client_documents (id, request_id, doc_type, applicant_index, filename, original_name, storage_path, mime_type, size_bytes, status, uploaded_at)
select ('e8100000-0000-4000-8000-' || lpad((r.n * 10 + d.n)::text, 12, '0'))::uuid,
       r.id, d.doc_type, 1,
       'NK-DEMO-010' || r.n || ' ' || r.who || ' ' || d.label || '.pdf',
       d.label || '.pdf',
       'demo/' || r.n || '/' || d.n || '.pdf',
       'application/pdf', 184000 + d.n * 1000, 'accepted',
       now() - (r.age || ' days')::interval + (d.n || ' minutes')::interval
from (values
        (1, 'e8000000-0000-4000-8000-000000000001'::uuid, 'Olivia Bennett', 4, 2),
        (2, 'e8000000-0000-4000-8000-000000000002'::uuid, 'Liam Nguyen', 7, 6),
        (4, 'e8000000-0000-4000-8000-000000000004'::uuid, 'Mia Anderson', 7, 18),
        (5, 'e8000000-0000-4000-8000-000000000005'::uuid, 'Noah Patel', 7, 3)
     ) as r(n, id, who, upto, age)
join (values
        (1, 'payslip', 'Payslip 1'),
        (2, 'payslip', 'Payslip 2'),
        (3, 'photo_id', 'Photo ID front'),
        (4, 'photo_id', 'Photo ID back'),
        (5, 'ato_income', 'ATO Income Statement 1'),
        (6, 'ato_income', 'ATO Income Statement 2'),
        (7, 'super_statement', 'Super Statement')
     ) as d(n, doc_type, label) on d.n <= r.upto;

-- ── Opportunities: clear the meeting a recording books for Olivia Bennett ────
delete from appointments where contact_id = 'd0000000-0000-4000-8000-000000000001' and event_title like 'Meeting%Olivia Bennett%';
