-- Books, stage 1 hardening. Runs after 20261031_invoices.sql; safe to rerun.
--
-- Every change to an invoice's state now happens in one transaction under the
-- invoice's row lock, so the check and the change can't be separated by another
-- request. Seller and bank details are frozen onto the invoice when it's issued,
-- and changes to the settings row are written to the audit trail.

alter table invoices add column if not exists seller_snapshot jsonb;

create or replace function invoices_lock_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Invoice % is issued and cannot be deleted. Void it instead.', old.number;
    end if;
    return old;
  end if;

  if old.status = 'draft' then
    if new.status in ('paid','void') then
      raise exception 'A draft invoice must be issued first.';
    end if;
    -- issue_invoice compares this to spot an edit made after the draft was checked.
    new.updated_at := clock_timestamp();
    return new;
  end if;

  if new.status = 'draft' then
    raise exception 'An issued invoice cannot return to draft.';
  end if;
  if old.status = 'void' and new.status <> 'void' then
    raise exception 'A voided invoice cannot be reopened.';
  end if;
  if new.status = 'void' and old.status <> 'void' and new.amount_paid_cents > 0 then
    raise exception 'Remove its payments before voiding it.';
  end if;

  if new.number              is distinct from old.number
  or new.source              is distinct from old.source
  or new.trading_as          is distinct from old.trading_as
  or new.issue_date          is distinct from old.issue_date
  or new.buyer_name          is distinct from old.buyer_name
  or new.buyer_abn           is distinct from old.buyer_abn
  or new.buyer_address       is distinct from old.buyer_address
  or new.reference           is distinct from old.reference
  or new.notes               is distinct from old.notes
  or new.lines               is distinct from old.lines
  or new.amounts_include_gst is distinct from old.amounts_include_gst
  or new.subtotal_cents      is distinct from old.subtotal_cents
  or new.gst_cents           is distinct from old.gst_cents
  or new.total_cents         is distinct from old.total_cents
  or new.seller_snapshot     is distinct from old.seller_snapshot then
    raise exception 'Invoice % is issued and locked. Void it and issue a new one.', old.number;
  end if;
  return new;
end $$;

-- The settings audit. Issuing moves only next_number and leaves updated_at alone,
-- so that one change isn't logged. Any other change is, however it was made.
create or replace function invoice_settings_audit() returns trigger
language plpgsql set search_path = public as $$
declare
  v_changes jsonb;
begin
  select jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value))
    into v_changes
    from jsonb_each(to_jsonb(new)) n
    join jsonb_each(to_jsonb(old)) o using (key)
   where n.key not in ('updated_at', 'updated_by')
     and n.value is distinct from o.value
     and (n.key <> 'next_number' or new.updated_at is distinct from old.updated_at);
  if v_changes is not null then
    insert into invoice_events (invoice_id, action, actor, detail)
    values ('00000000-0000-0000-0000-000000000000', 'settings_changed', new.updated_by, v_changes);
  end if;
  return null;
end $$;

drop trigger if exists invoice_settings_audit on invoice_settings;
create trigger invoice_settings_audit after update on invoice_settings
  for each row execute function invoice_settings_audit();

drop function if exists issue_invoice(uuid, text, date);

-- The caller checked the draft as it stood at p_expected_updated_at and worked out
-- the totals from it. If the draft has moved since, nothing is issued.
create or replace function issue_invoice(
  p_id uuid,
  p_actor text,
  p_today date,
  p_expected_updated_at timestamptz,
  p_subtotal_cents bigint,
  p_gst_cents bigint,
  p_total_cents bigint
) returns int
language plpgsql set search_path = public as $$
declare
  v_invoice invoices%rowtype;
  v_settings invoice_settings%rowtype;
  v_number int;
begin
  select * into v_invoice from invoices where id = p_id for update;
  if not found then
    raise exception 'Invoice not found';
  end if;
  if v_invoice.status <> 'draft' then
    raise exception 'This invoice has already been issued.';
  end if;
  if v_invoice.updated_at is distinct from p_expected_updated_at then
    raise exception 'This draft was changed just now. Check it and issue it again.';
  end if;

  select * into v_settings from invoice_settings where id = 1 for update;
  v_number := v_settings.next_number;
  while exists (select 1 from invoices where number = v_number) loop
    v_number := v_number + 1;
  end loop;
  update invoice_settings set next_number = v_number + 1 where id = 1;

  update invoices
     set number = v_number,
         status = 'issued',
         issue_date = coalesce(issue_date, p_today),
         subtotal_cents = p_subtotal_cents,
         gst_cents = p_gst_cents,
         total_cents = p_total_cents,
         seller_snapshot = jsonb_build_object(
           'seller_name', v_settings.seller_name,
           'abn', v_settings.abn,
           'address', v_settings.address,
           'email', v_settings.email,
           'phone', v_settings.phone,
           'bank_name', v_settings.bank_name,
           'bsb', v_settings.bsb,
           'account_name', v_settings.account_name,
           'account_number', v_settings.account_number
         ),
         issued_at = now(),
         issued_by = p_actor,
         updated_at = now()
   where id = p_id;

  insert into invoice_events (invoice_id, action, actor, detail)
  values (p_id, 'issued', p_actor, jsonb_build_object('number', v_number));
  return v_number;
end $$;

create or replace function void_invoice(p_id uuid, p_actor text, p_reason text) returns void
language plpgsql set search_path = public as $$
declare
  v_status text;
begin
  select status into v_status from invoices where id = p_id for update;
  if v_status is null then
    raise exception 'Invoice not found';
  end if;
  if v_status = 'draft' then
    raise exception 'Delete a draft instead of voiding it.';
  end if;
  if v_status = 'void' then
    raise exception 'Already voided.';
  end if;
  if exists (select 1 from invoice_payments where invoice_id = p_id) then
    raise exception 'Remove its payments before voiding it.';
  end if;

  update invoices
     set status = 'void', voided_at = now(), void_reason = p_reason, updated_at = now()
   where id = p_id;
  insert into invoice_events (invoice_id, action, actor, detail)
  values (p_id, 'voided', p_actor, jsonb_build_object('reason', p_reason));
end $$;

-- Re-adds from the payments, so the invoice can't drift from them. The caller holds the lock.
create or replace function invoice_settle(p_id uuid) returns void
language plpgsql set search_path = public as $$
declare
  v_paid bigint;
  v_last date;
begin
  select coalesce(sum(amount_cents), 0), max(paid_on) into v_paid, v_last
    from invoice_payments where invoice_id = p_id;
  update invoices
     set amount_paid_cents = v_paid,
         status = case when total_cents > 0 and v_paid >= total_cents then 'paid' else 'issued' end,
         paid_at = case when total_cents > 0 and v_paid >= total_cents then v_last::timestamptz end,
         updated_at = now()
   where id = p_id;
end $$;

create or replace function record_invoice_payment(
  p_id uuid,
  p_cents bigint,
  p_paid_on date,
  p_method text,
  p_note text,
  p_actor text
) returns void
language plpgsql set search_path = public as $$
declare
  v_status text;
begin
  select status into v_status from invoices where id = p_id for update;
  if v_status is null then
    raise exception 'Invoice not found';
  end if;
  if v_status not in ('issued', 'paid') then
    raise exception 'Payments can only go against an issued invoice.';
  end if;

  insert into invoice_payments (invoice_id, amount_cents, paid_on, method, note, created_by)
  values (p_id, p_cents, p_paid_on, p_method, p_note, p_actor);
  perform invoice_settle(p_id);
  insert into invoice_events (invoice_id, action, actor, detail)
  values (p_id, 'payment_recorded', p_actor, jsonb_build_object('cents', p_cents, 'paid_on', p_paid_on));
end $$;

-- False if that payment isn't on this invoice. The history keeps what was removed.
create or replace function remove_invoice_payment(p_id uuid, p_payment_id uuid, p_actor text) returns boolean
language plpgsql set search_path = public as $$
declare
  v_payment invoice_payments%rowtype;
begin
  perform 1 from invoices where id = p_id for update;
  if not found then
    raise exception 'Invoice not found';
  end if;
  delete from invoice_payments where id = p_payment_id and invoice_id = p_id returning * into v_payment;
  if not found then
    return false;
  end if;
  perform invoice_settle(p_id);
  insert into invoice_events (invoice_id, action, actor, detail)
  values (p_id, 'payment_removed', p_actor, jsonb_build_object('cents', v_payment.amount_cents, 'paid_on', v_payment.paid_on));
  return true;
end $$;

revoke all on function issue_invoice(uuid, text, date, timestamptz, bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function void_invoice(uuid, text, text) from public, anon, authenticated;
revoke all on function invoice_settle(uuid) from public, anon, authenticated;
revoke all on function record_invoice_payment(uuid, bigint, date, text, text, text) from public, anon, authenticated;
revoke all on function remove_invoice_payment(uuid, uuid, text) from public, anon, authenticated;
