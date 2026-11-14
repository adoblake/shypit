begin;
create table if not exists shypit_private.market_listings (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.workspaces(id),
 request_key uuid not null, request_hash text not null,
 business_name text not null check(length(business_name) between 2 and 100),
 origin text not null, destination text not null,
 pickup date not null, delivery date not null check(delivery>=pickup),
 equipment text not null check(equipment in ('Dry van','Reefer','Flatbed','Box truck')),
 cargo text not null check(cargo in ('General merchandise','Office supplies','Building materials','Dry food products','Machinery')),
 pallets integer not null check(pallets between 1 and 100),
 weight integer not null check(weight between 1 and 100000),
 rate_cents integer check(rate_cents between 100 and 100000000),
 state text not null default 'open' check(state in ('open','booked','closed','cancelled')),
 carrier_id uuid references public.workspaces(id), accepted_offer uuid,
 created_at timestamptz not null default now(),
 unique(business_id,request_key)
);
create index if not exists market_open_index on shypit_private.market_listings(state,created_at desc);
create table if not exists shypit_private.market_details (
 listing_id uuid primary key references shypit_private.market_listings(id) on delete cascade,
 pickup_address text not null, delivery_address text not null,
 contact_name text not null, contact_email text not null, contact_phone text not null
);
create table if not exists shypit_private.market_offers (
 id uuid primary key default gen_random_uuid(),
 listing_id uuid not null references shypit_private.market_listings(id),
 carrier_id uuid not null references public.workspaces(id),
 carrier_name text not null check(length(carrier_name) between 2 and 100),
 amount_cents integer not null check(amount_cents between 100 and 100000000),
 revision integer not null default 0,
 state text not null default 'pending' check(state in ('pending','accepted','rejected','withdrawn','cancelled')),
 contact_name text not null, contact_email text not null, contact_phone text not null,
 created_at timestamptz not null default now(),
 unique(listing_id,carrier_id)
);
alter table shypit_private.market_offers add column if not exists revision integer not null default 0;
create table if not exists shypit_private.market_events (
 id bigint generated always as identity primary key,
 listing_id uuid not null references shypit_private.market_listings(id),
 workspace_id uuid not null references public.workspaces(id), actor uuid not null references auth.users(id),
 action text not null, created_at timestamptz not null default now()
);
revoke all on shypit_private.market_listings,shypit_private.market_details,shypit_private.market_offers,shypit_private.market_events from public,anon,authenticated;
create or replace function shypit_private.market_role(p_workspace uuid,p_required text default null) returns text
language plpgsql security definer set search_path='' as $$
declare result text;
begin
 if not public.shypit_session_allowed() then raise exception 'Sign in again to continue' using errcode='42501'; end if;
 select role into result from public.memberships where user_id=auth.uid() and workspace_id=p_workspace and active;
 if result is null or (p_required is not null and result<>p_required) then raise exception 'Workspace permission required' using errcode='42501'; end if;
 return result;
end;$$;
revoke all on function shypit_private.market_role(uuid,text) from public,anon,authenticated;
create or replace function public.shypit_market_list(p_workspace uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare member_role text; result jsonb;
begin
 member_role:=shypit_private.market_role(p_workspace);
 select coalesce(jsonb_agg(row_data order by created_at desc),'[]') into result from (
  select l.created_at,jsonb_build_object(
   'id',l.id,'business_name',l.business_name,'origin',l.origin,'destination',l.destination,'pickup',l.pickup,'delivery',l.delivery,
   'equipment',l.equipment,'cargo',l.cargo,'pallets',l.pallets,'weight',l.weight,'rate_cents',l.rate_cents,'state',l.state,'created_at',l.created_at,'mine',l.business_id=p_workspace,
   'private_details',case when l.business_id=p_workspace or (l.state='booked' and l.carrier_id=p_workspace) then (select to_jsonb(d)-'listing_id' from shypit_private.market_details d where d.listing_id=l.id) else null end,
   'offers',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'carrier_name',o.carrier_name,'amount_cents',o.amount_cents,'state',o.state,'revision',o.revision,'created_at',o.created_at,
    'contact',case when o.carrier_id=p_workspace or (l.state='booked' and l.accepted_offer=o.id and l.business_id=p_workspace) then jsonb_build_object('name',o.contact_name,'email',o.contact_email,'phone',o.contact_phone) else null end) order by o.created_at)
    from shypit_private.market_offers o where o.listing_id=l.id and (l.business_id=p_workspace or o.carrier_id=p_workspace)),'[]'::jsonb)
  ) as row_data from shypit_private.market_listings l
  where (member_role='business' and l.business_id=p_workspace) or (member_role='driver' and ((l.state='open' and l.pickup>=current_date-1) or l.carrier_id=p_workspace or exists(select 1 from shypit_private.market_offers o where o.listing_id=l.id and o.carrier_id=p_workspace)))
  order by case when l.business_id=p_workspace or l.carrier_id=p_workspace or exists(select 1 from shypit_private.market_offers mine where mine.listing_id=l.id and mine.carrier_id=p_workspace) then 0 else 1 end,l.created_at desc limit 100
 ) visible;
 return result;
end;$$;
create or replace function public.shypit_market_post(p_workspace uuid,p_request uuid,p_listing jsonb,p_private jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; fingerprint text; previous_hash text;
begin
 perform shypit_private.market_role(p_workspace,'business');
 if p_request is null or p_listing is null or p_private is null or length(p_listing::text)>4000 or length(p_private::text)>4000 then raise exception 'Invalid listing'; end if;
 if exists(select 1 from jsonb_object_keys(p_listing) k where k not in ('business_name','origin','destination','pickup','delivery','equipment','cargo','pallets','weight','rate_cents')) or exists(select 1 from jsonb_object_keys(p_private) k where k not in ('pickup_address','delivery_address','contact_name','contact_email','contact_phone')) then raise exception 'Unexpected listing field'; end if;
 if coalesce(p_listing->>'origin','')!~'^[A-Za-z .''-]{2,70}, [A-Z]{2}$' or coalesce(p_listing->>'destination','')!~'^[A-Za-z .''-]{2,70}, [A-Z]{2}$' then raise exception 'Use city and state only in public route fields'; end if;
 if coalesce(p_private->>'pickup_address','')='' or coalesce(p_private->>'delivery_address','')='' or length(p_private->>'pickup_address')>240 or length(p_private->>'delivery_address')>240 or coalesce(length(p_private->>'contact_name'),0) not between 2 and 100 or coalesce(p_private->>'contact_email','')!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_private->>'contact_email')>254 or coalesce(length(p_private->>'contact_phone'),0) not between 7 and 30 then raise exception 'Pickup, delivery and contact details are required'; end if;
 if (p_listing->>'pickup')::date<current_date-1 or (p_listing->>'pickup')::date>current_date+730 then raise exception 'Choose an upcoming pickup date'; end if;
 fingerprint:=encode(sha256(convert_to((p_listing||p_private)::text,'UTF8')),'hex');
 select id,request_hash into result,previous_hash from shypit_private.market_listings where business_id=p_workspace and request_key=p_request;
 if result is not null then if previous_hash<>fingerprint then raise exception 'This submission was already used. Refresh before posting again'; end if; return result;end if;
 -- Serialize posting per business, including duplicate requests and the open-post limit.
 perform 1 from public.workspaces where id=p_workspace for update;
 select id,request_hash into result,previous_hash from shypit_private.market_listings where business_id=p_workspace and request_key=p_request;
 if result is not null then if previous_hash<>fingerprint then raise exception 'This submission was already used. Refresh before posting again'; end if; return result;end if;
 if (select count(*) from shypit_private.market_listings where business_id=p_workspace and state='open')>=50 then raise exception 'Close an existing post before adding another'; end if;
 insert into shypit_private.market_listings(business_id,request_key,request_hash,business_name,origin,destination,pickup,delivery,equipment,cargo,pallets,weight,rate_cents)
 values(p_workspace,p_request,fingerprint,p_listing->>'business_name',p_listing->>'origin',p_listing->>'destination',(p_listing->>'pickup')::date,(p_listing->>'delivery')::date,p_listing->>'equipment',p_listing->>'cargo',(p_listing->>'pallets')::integer,(p_listing->>'weight')::integer,(p_listing->>'rate_cents')::integer) returning id into result;
 insert into shypit_private.market_details values(result,p_private->>'pickup_address',p_private->>'delivery_address',p_private->>'contact_name',p_private->>'contact_email',p_private->>'contact_phone');
 insert into shypit_private.market_events(listing_id,workspace_id,actor,action) values(result,p_workspace,auth.uid(),'posted');
 return result;
end;$$;
create or replace function public.shypit_market_offer(p_workspace uuid,p_listing uuid,p_name text,p_amount integer,p_contact jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare listing shypit_private.market_listings; result uuid;
begin
 perform shypit_private.market_role(p_workspace,'driver');
 select * into listing from shypit_private.market_listings where id=p_listing for update;
 if listing.id is null or listing.state<>'open' or listing.pickup<current_date-1 then raise exception 'This load is no longer available'; end if;
 if p_contact is null or length(p_contact::text)>2000 or exists(select 1 from jsonb_object_keys(p_contact) k where k not in ('name','email','phone')) or coalesce(length(p_contact->>'name'),0) not between 2 and 100 or coalesce(p_contact->>'email','')!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_contact->>'email')>254 or coalesce(length(p_contact->>'phone'),0) not between 7 and 30 then raise exception 'Carrier contact details are required'; end if;
 insert into shypit_private.market_offers(listing_id,carrier_id,carrier_name,amount_cents,contact_name,contact_email,contact_phone)
 values(p_listing,p_workspace,p_name,coalesce(listing.rate_cents,p_amount),p_contact->>'name',p_contact->>'email',p_contact->>'phone')
 on conflict(listing_id,carrier_id) do update set carrier_name=excluded.carrier_name,amount_cents=excluded.amount_cents,contact_name=excluded.contact_name,contact_email=excluded.contact_email,contact_phone=excluded.contact_phone,state='pending',revision=market_offers.revision+1,created_at=now()
 returning id into result;
 insert into shypit_private.market_events(listing_id,workspace_id,actor,action) values(p_listing,p_workspace,auth.uid(),'offer-submitted');return result;
end;$$;
drop function if exists public.shypit_market_accept(uuid,uuid);
create or replace function public.shypit_market_accept(p_workspace uuid,p_offer uuid,p_revision integer) returns void
language plpgsql security definer set search_path='' as $$
declare listing shypit_private.market_listings; offer shypit_private.market_offers;
begin
 perform shypit_private.market_role(p_workspace,'business');
 select * into offer from shypit_private.market_offers where id=p_offer;
 select * into listing from shypit_private.market_listings where id=offer.listing_id for update;
 -- Re-read under the listing lock; withdrawals and competing acceptances use the same lock.
 select * into offer from shypit_private.market_offers where id=p_offer;
 if listing.id is null or listing.business_id<>p_workspace or listing.state<>'open' or offer.state<>'pending' or p_revision is null or offer.revision<>p_revision or listing.pickup<current_date-1 then raise exception 'Booking is no longer available'; end if;
 if not exists(select 1 from public.memberships where workspace_id=offer.carrier_id and role='driver' and active) then raise exception 'Carrier access is no longer active';end if;
 update shypit_private.market_listings set state='booked',carrier_id=offer.carrier_id,accepted_offer=offer.id where id=listing.id;
 update shypit_private.market_offers set state=case when id=offer.id then 'accepted' else 'rejected' end where listing_id=listing.id and state='pending';
 insert into shypit_private.market_events(listing_id,workspace_id,actor,action) values(listing.id,p_workspace,auth.uid(),'booked');
end;$$;
create or replace function public.shypit_market_withdraw(p_workspace uuid,p_offer uuid) returns void
language plpgsql security definer set search_path='' as $$
declare listing_id uuid;
begin
 perform shypit_private.market_role(p_workspace,'driver');
 select o.listing_id into listing_id from shypit_private.market_offers o where o.id=p_offer and o.carrier_id=p_workspace;
 perform 1 from shypit_private.market_listings where id=listing_id and state='open' for update;
 if not found then raise exception 'Request cannot be withdrawn';end if;
 update shypit_private.market_offers set state='withdrawn' where id=p_offer and carrier_id=p_workspace and state='pending';
 if not found then raise exception 'Request cannot be withdrawn';end if;
 insert into shypit_private.market_events(listing_id,workspace_id,actor,action) values(listing_id,p_workspace,auth.uid(),'withdrawn');
end;$$;
drop function if exists public.shypit_market_close(uuid,uuid);
create or replace function public.shypit_market_close(p_workspace uuid,p_listing uuid,p_expected_state text) returns void
language plpgsql security definer set search_path='' as $$
declare listing shypit_private.market_listings;
begin
 perform shypit_private.market_role(p_workspace,'business');
 select * into listing from shypit_private.market_listings where id=p_listing for update;
 if listing.id is null or listing.business_id<>p_workspace or listing.state not in ('open','booked') or p_expected_state is null or listing.state<>p_expected_state then raise exception 'Post cannot be closed'; end if;
 update shypit_private.market_listings set state=case when state='booked' then 'cancelled' else 'closed' end where id=p_listing;
 update shypit_private.market_offers set state=case when state='accepted' then 'cancelled' else 'rejected' end where listing_id=p_listing and state in ('pending','accepted');
 insert into shypit_private.market_events(listing_id,workspace_id,actor,action) values(p_listing,p_workspace,auth.uid(),'closed');
end;$$;
revoke all on function public.shypit_market_list(uuid),public.shypit_market_post(uuid,uuid,jsonb,jsonb),public.shypit_market_offer(uuid,uuid,text,integer,jsonb),public.shypit_market_accept(uuid,uuid,integer),public.shypit_market_withdraw(uuid,uuid),public.shypit_market_close(uuid,uuid,text) from public,anon;
grant execute on function public.shypit_market_list(uuid),public.shypit_market_post(uuid,uuid,jsonb,jsonb),public.shypit_market_offer(uuid,uuid,text,integer,jsonb),public.shypit_market_accept(uuid,uuid,integer),public.shypit_market_withdraw(uuid,uuid),public.shypit_market_close(uuid,uuid,text) to authenticated;
commit;
