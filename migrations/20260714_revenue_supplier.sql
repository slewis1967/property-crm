-- Property supplier (builder / developer / wholesaler) on each deal, so the
-- revenue tracker can be searched/filtered by who supplied the property.
alter table revenue_deals add column if not exists supplier text;

create index if not exists revenue_deals_supplier_idx on revenue_deals (supplier);
