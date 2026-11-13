-- Platform administration: only verified, permitted sessions; no direct table grants.
begin;
create table if not exists shypit_private.admin_grants (
 email_key text primary key check(email_key ~ '^[a-f0-9]{64}$'),
 owner boolean not null default false,
 capabilities text[] not null default '{}'
  check(capabilities <@ array['stats','operations','access','audit','testing']::text[]),
 active boolean not null default true
);
create table if not exists shypit_private.admin_audit (
 id bigint generated always as identity primary key,
 actor uuid not null, action text not null, target text not null,
 details jsonb not null default '{}', created_at timestamptz not null default now()
);
revoke all on shypit_private.admin_grants,shypit_private.admin_audit from public,anon,authenticated;
create or replace function public.shypit_admin_profile() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('owner',g.owner,'capabilities',case when g.owner then array['stats','operations','access','audit','testing']::text[] else g.capabilities end)
 from shypit_private.admin_grants g join auth.users u on g.email_key=encode(sha256(convert_to(lower(u.email),'UTF8')),'hex')
 where u.id=auth.uid() and u.email_confirmed_at is not null and g.active and (g.owner or cardinality(g.capabilities)>0) and public.shypit_session_allowed();
$$;
create or replace function public.shypit_admin_read(p_section text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare profile jsonb; result jsonb;
begin
 profile:=public.shypit_admin_profile();
 if profile is null or not (profile->'capabilities' ? p_section) then raise exception 'Admin permission required' using errcode='42501'; end if;
 case p_section
 when 'stats' then
  select jsonb_build_object('workspaces',count(*),'shipments',coalesce(sum(jsonb_array_length(data->'shipments')) filter(where kind='business'),0),'jobs',coalesce(sum(jsonb_array_length(data->'jobs')) filter(where kind='driver'),0),'packages',coalesce(sum(jsonb_array_length(coalesce(data->'packages','[]'::jsonb))) filter(where kind='business'),0),'active_memberships',(select count(*) from public.memberships where active)) into result from public.workspaces;
 when 'operations' then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'revision',revision,'data',data) order by kind,id),'[]') into result from public.workspaces;
 when 'access' then
  select jsonb_build_object('users',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'email',u.email,'owner',coalesce(g.owner,false),'active',coalesce(g.active,false),'capabilities',coalesce(g.capabilities,'{}'::text[])) order by u.email) from auth.users u left join shypit_private.admin_grants g on g.email_key=encode(sha256(convert_to(lower(u.email),'UTF8')),'hex') where u.email_confirmed_at is not null and (g.email_key is not null or exists(select 1 from public.memberships m where m.user_id=u.id))),'[]'::jsonb),'memberships',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object('finance_manager',exists(select 1 from shypit_private.finance_managers f where f.user_id=m.user_id and f.workspace_id=m.workspace_id))) from public.memberships m),'[]'::jsonb)) into result;
 when 'audit' then
  select coalesce(jsonb_agg(to_jsonb(a) order by a.id desc),'[]') into result from (select * from shypit_private.admin_audit order by id desc limit 100) a;
 when 'testing' then
  result:=jsonb_build_object('environment','Private pilot','live_dispatch',false,'payments',false,'secure_file_uploads',false);
 else raise exception 'Unknown section';
 end case;
 return result;
end;
$$;
create or replace function public.shypit_admin_change(p_action text,p_target uuid,p_options jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare profile jsonb; target_key text; old_grant shypit_private.admin_grants; caps text[]; before_value jsonb;
begin
 profile:=public.shypit_admin_profile();
 -- Only founders may delegate or revoke access, including other admins with read access.
 if profile is null or not (profile->>'owner')::boolean then raise exception 'Owner permission required' using errcode='42501'; end if;
 if p_target=auth.uid() then raise exception 'Cannot change your own access'; end if;
 -- Serialize all owner changes to prevent conflicting grants or revocations.
 perform pg_advisory_xact_lock(8192331);
 select encode(sha256(convert_to(lower(email),'UTF8')),'hex') into target_key from auth.users where id=p_target and email_confirmed_at is not null;
 if target_key is null then raise exception 'Verified account required'; end if;
 select * into old_grant from shypit_private.admin_grants where email_key=target_key;
 if old_grant.owner then raise exception 'Founder accounts are protected'; end if;
 if p_action='admin-access' then
  if (p_options->>'active')::boolean and not exists(select 1 from public.memberships where user_id=p_target and active) then raise exception 'Active workspace membership required'; end if;
  if jsonb_typeof(p_options->'capabilities') is distinct from 'array' or jsonb_typeof(p_options->'active') is distinct from 'boolean' then raise exception 'Invalid access settings'; end if;
  select coalesce(array_agg(distinct value),'{}'::text[]) into caps from jsonb_array_elements_text(p_options->'capabilities');
  if not caps <@ array['stats','operations','access','audit','testing']::text[] then raise exception 'Unknown permission'; end if;
  before_value:=to_jsonb(old_grant)-'email_key';
  insert into shypit_private.admin_grants(email_key,capabilities,active) values(target_key,caps,(p_options->>'active')::boolean)
  on conflict(email_key) do update set capabilities=excluded.capabilities,active=excluded.active;
 elsif p_action='membership-access' then
  if jsonb_typeof(p_options->'active') is distinct from 'boolean' then raise exception 'Invalid membership settings'; end if;
  select to_jsonb(m) into before_value from public.memberships m where user_id=p_target and workspace_id=(p_options->>'workspace_id')::uuid;
  if before_value is null then raise exception 'Membership not found'; end if;
  update public.memberships set active=(p_options->>'active')::boolean where user_id=p_target and workspace_id=(p_options->>'workspace_id')::uuid;
  -- Persist revocation in invitation too; a later login must not restore access.
  update shypit_private.preview_invitations set active=(p_options->>'active')::boolean where email_key=target_key and workspace_id=(p_options->>'workspace_id')::uuid;
 elsif p_action='finance-access' then
  if jsonb_typeof(p_options->'active') is distinct from 'boolean' then raise exception 'Invalid finance settings'; end if;
  if not exists(select 1 from public.memberships where user_id=p_target and workspace_id=(p_options->>'workspace_id')::uuid and active) then raise exception 'Active membership required'; end if;
  before_value:=jsonb_build_object('active',exists(select 1 from shypit_private.finance_managers where user_id=p_target and workspace_id=(p_options->>'workspace_id')::uuid));
  if (p_options->>'active')::boolean then
   insert into shypit_private.finance_managers(user_id,workspace_id) values(p_target,(p_options->>'workspace_id')::uuid) on conflict do nothing;
  else
   delete from shypit_private.finance_managers where user_id=p_target and workspace_id=(p_options->>'workspace_id')::uuid;
  end if;
 else raise exception 'Unknown action'; end if;
 insert into shypit_private.admin_audit(actor,action,target,details) values(auth.uid(),p_action,p_target::text,jsonb_build_object('before',before_value,'after',p_options));
end;
$$;
revoke all on function public.shypit_admin_profile(),public.shypit_admin_read(text),public.shypit_admin_change(text,uuid,jsonb) from public,anon;
grant execute on function public.shypit_admin_profile(),public.shypit_admin_read(text),public.shypit_admin_change(text,uuid,jsonb) to authenticated;
commit;
