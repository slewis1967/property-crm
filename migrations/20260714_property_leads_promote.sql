-- Lead-pipeline consolidation ("one flow"): mark a property_leads intake row as
-- promoted into the NEXUS opportunities pipeline, so the intake inbox can drop it
-- once it's being worked as an opportunity. Nullable columns — NEXUS writers are
-- unaffected.
alter table property_leads add column if not exists promoted_at             timestamptz;
alter table property_leads add column if not exists promoted_opportunity_id text;

create index if not exists property_leads_promoted_idx on property_leads (promoted_at);
