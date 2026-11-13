-- Apply after schema.sql. Private authentication state, not a public RPC counter.
begin;
create schema if not exists shypit_private;
revoke all on schema shypit_private from public,anon,authenticated;
create table if not exists shypit_private.auth_limits (
 email_key text not null,
 action text not null check(action in ('sign-in','password-complete','setup-request','reset-request','email-help')),
 failures integer not null default 0,
 pending integer not null default 0,
 window_started timestamptz not null default now(),
 locked_until timestamptz,
 primary key(email_key,action)
);
create table if not exists shypit_private.auth_reservations (
 id uuid primary key default gen_random_uuid(),email_key text not null,action text not null,created_at timestamptz not null default now(),finished boolean not null default false
);
create table if not exists shypit_private.session_permits (
 session_id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,email_key text not null,expires_at timestamptz not null
);
create table if not exists shypit_private.preview_invitations (
 email_key text not null,workspace_id uuid not null references public.workspaces(id),role text not null check(role in ('business','driver')),display_name text not null,active boolean not null default true,
 primary key(email_key,workspace_id),foreign key(workspace_id,role) references public.workspaces(id,kind)
);
create table if not exists shypit_private.access_help (
 id uuid primary key default gen_random_uuid(),email_key text not null,full_name text not null,organization text not null,contact_email text not null,created_at timestamptz not null default now()
);
revoke all on all tables in schema shypit_private from public,anon,authenticated;

create table if not exists shypit_private.recovery_receipts(token_key text primary key,used_at timestamptz not null default now());
revoke all on shypit_private.recovery_receipts from public,anon,authenticated;
create or replace function public.shypit_consume_recovery(p_token_key text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 insert into shypit_private.recovery_receipts(token_key) values(p_token_key) on conflict do nothing;
 return found;
end;$$;
revoke all on function public.shypit_consume_recovery(text) from public,anon,authenticated;
grant execute on function public.shypit_consume_recovery(text) to service_role;
create or replace function public.shypit_auth_health() returns boolean language sql security definer set search_path='' as $$
 select to_regclass('shypit_private.auth_limits') is not null and to_regclass('shypit_private.session_permits') is not null and to_regclass('shypit_private.preview_invitations') is not null and to_regclass('shypit_private.access_help') is not null;
$$;
revoke all on function public.shypit_auth_health() from public,anon,authenticated;
grant execute on function public.shypit_auth_health() to service_role;
create or replace function public.shypit_auth_begin(p_email_key text,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r shypit_private.auth_limits; reservation uuid; is_request boolean; expired_count integer; global_lock timestamptz;
begin
 if p_email_key !~ '^[a-f0-9]{64}$' or p_action not in ('sign-in','password-complete','setup-request','reset-request','email-help') then raise exception 'Invalid request'; end if;
 select max(locked_until) into global_lock from shypit_private.auth_limits where email_key=p_email_key and action in ('sign-in','password-complete') and locked_until>now();
 if global_lock is not null then return jsonb_build_object('allowed',false,'locked_until',global_lock);end if;
 insert into shypit_private.auth_limits(email_key,action) values(p_email_key,p_action) on conflict do nothing;
 select * into r from shypit_private.auth_limits where email_key=p_email_key and action=p_action for update;
 if r.locked_until>now() then return jsonb_build_object('allowed',false,'locked_until',r.locked_until); end if;
 if r.window_started<=now()-interval '24 hours' or r.locked_until<=now() then
  update shypit_private.auth_limits set failures=0,pending=0,locked_until=null,window_started=now() where email_key=p_email_key and action=p_action;
  update shypit_private.auth_reservations set finished=true where email_key=p_email_key and action=p_action and not finished;
  r.failures:=0;r.pending:=0;
 end if;
 -- Abandoned reservations expire as failures; a disconnected client must not restore its budget.
 with expired as(update shypit_private.auth_reservations set finished=true where email_key=p_email_key and action=p_action and not finished and created_at<=now()-interval '2 minutes' returning id) select count(*) into expired_count from expired;
 if expired_count>0 then
  update shypit_private.auth_limits l set failures=l.failures+expired_count,pending=greatest(0,l.pending-expired_count) where email_key=p_email_key and action=p_action;
  select * into r from shypit_private.auth_limits where email_key=p_email_key and action=p_action;
 end if;
 if r.failures+r.pending>=10 then
  update shypit_private.auth_limits set locked_until=now()+interval '24 hours' where email_key=p_email_key and action=p_action returning * into r;
  return jsonb_build_object('allowed',false,'locked_until',r.locked_until);
 end if;
 is_request:=p_action in ('setup-request','reset-request','email-help');
 insert into shypit_private.auth_reservations(email_key,action,finished) values(p_email_key,p_action,is_request) returning id into reservation;
 if is_request then
  update shypit_private.auth_limits set failures=failures+1,locked_until=case when failures+1>=10 then now()+interval '24 hours' else null end where email_key=p_email_key and action=p_action;
 else
  update shypit_private.auth_limits set pending=pending+1 where email_key=p_email_key and action=p_action;
 end if;
 return jsonb_build_object('allowed',true,'reservation',reservation);
end;$$;

create or replace function public.shypit_auth_finish(p_reservation uuid,p_success boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a shypit_private.auth_reservations;r shypit_private.auth_limits;global_lock timestamptz;
begin
 select * into a from shypit_private.auth_reservations where id=p_reservation;
 if not found then return jsonb_build_object('allowed',false);end if;
 select * into r from shypit_private.auth_limits where email_key=a.email_key and action=a.action for update;
 select * into a from shypit_private.auth_reservations where id=p_reservation for update;
 if a.finished then return jsonb_build_object('allowed',false);end if;
 update shypit_private.auth_reservations set finished=true where id=p_reservation;
 select max(locked_until) into global_lock from shypit_private.auth_limits where email_key=a.email_key and action in ('sign-in','password-complete') and locked_until>now();
 if p_success and global_lock is not null then
  update shypit_private.auth_limits set pending=greatest(0,pending-1) where email_key=a.email_key and action=a.action;
  return jsonb_build_object('allowed',false,'locked_until',global_lock);
 end if;
 update shypit_private.auth_limits set window_started=case when p_success then now() else window_started end,pending=greatest(0,pending-1),failures=case when p_success and (locked_until is null or locked_until<=now()) then 0 else failures+1 end,
 locked_until=case when not p_success and failures+1>=10 then now()+interval '24 hours' else locked_until end
 where email_key=a.email_key and action=a.action returning * into r;
 return jsonb_build_object('allowed',p_success and (r.locked_until is null or r.locked_until<=now()),'locked_until',r.locked_until);
end;$$;

create or replace function public.shypit_invitation_lookup(p_email_key text) returns jsonb
language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('workspace_id',workspace_id,'role',role,'display_name',display_name)),'[]'::jsonb) from shypit_private.preview_invitations where email_key=p_email_key and active;
$$;
create or replace function public.shypit_activate_invitation(p_email_key text,p_user_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 insert into public.memberships(user_id,workspace_id,role,display_name,active)
 select p_user_id,workspace_id,role,display_name,true from shypit_private.preview_invitations where email_key=p_email_key and active
 on conflict(user_id,workspace_id) do nothing;
end;$$;
create or replace function public.shypit_permit_session(p_session_id uuid,p_user_id uuid,p_email_key text,p_expires_at timestamptz) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from shypit_private.auth_limits where email_key=p_email_key and action in ('sign-in','password-complete') and locked_until>now()) then return false;end if;
 if not exists(select 1 from public.memberships where user_id=p_user_id and active) then return false;end if;
 insert into shypit_private.session_permits(session_id,user_id,email_key,expires_at) values(p_session_id,p_user_id,p_email_key,least(p_expires_at,now()+interval '15 minutes')) on conflict(session_id) do update set expires_at=excluded.expires_at;
 return true;
end;$$;
create or replace function public.shypit_record_email_help(p_email_key text,p_name text,p_organization text,p_contact text) returns void
language sql security definer set search_path='' as $$
 insert into shypit_private.access_help(email_key,full_name,organization,contact_email) values(p_email_key,left(p_name,120),left(p_organization,160),left(p_contact,254));
$$;
create or replace function public.shypit_revoke_session(p_session_id uuid,p_user_id uuid) returns void
language sql security definer set search_path='' as $$delete from shypit_private.session_permits where session_id=p_session_id and user_id=p_user_id;$$;
revoke all on function public.shypit_revoke_session(uuid,uuid) from public,anon,authenticated;
grant execute on function public.shypit_revoke_session(uuid,uuid) to service_role;
create or replace function public.shypit_session_allowed() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from shypit_private.session_permits p where p.user_id=auth.uid() and p.session_id::text=auth.jwt()->>'session_id' and p.expires_at>now()
 and not exists(select 1 from shypit_private.auth_limits l where l.email_key=p.email_key and l.action in ('sign-in','password-complete') and l.locked_until>now()));
$$;
revoke all on function public.shypit_auth_begin(text,text),public.shypit_auth_finish(uuid,boolean),public.shypit_invitation_lookup(text),public.shypit_activate_invitation(text,uuid),public.shypit_permit_session(uuid,uuid,text,timestamptz),public.shypit_record_email_help(text,text,text,text) from public,anon,authenticated;
grant execute on function public.shypit_auth_begin(text,text),public.shypit_auth_finish(uuid,boolean),public.shypit_invitation_lookup(text),public.shypit_activate_invitation(text,uuid),public.shypit_permit_session(uuid,uuid,text,timestamptz),public.shypit_record_email_help(text,text,text,text) to service_role;
revoke all on function public.shypit_session_allowed() from public,anon;
grant execute on function public.shypit_session_allowed() to authenticated;
alter policy own_active_membership on public.memberships using(user_id=(select auth.uid()) and active and (select public.shypit_session_allowed()));
alter policy member_reads_workspace on public.workspaces using((select public.shypit_session_allowed()) and exists(select 1 from public.memberships m where m.user_id=(select auth.uid()) and m.active and m.workspace_id=workspaces.id));
alter policy member_updates_workspace on public.workspaces using((select public.shypit_session_allowed()) and exists(select 1 from public.memberships m where m.user_id=(select auth.uid()) and m.active and m.workspace_id=workspaces.id)) with check((select public.shypit_session_allowed()) and exists(select 1 from public.memberships m where m.user_id=(select auth.uid()) and m.active and m.workspace_id=workspaces.id));
commit;
