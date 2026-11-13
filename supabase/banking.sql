begin;
-- No bank numbers, routing numbers, tax IDs, or provider credentials belong here.
create table if not exists shypit_private.finance_managers (
 user_id uuid not null, workspace_id uuid not null,
 primary key(user_id,workspace_id),
 foreign key(user_id,workspace_id) references public.memberships(user_id,workspace_id) on delete cascade
);
create table if not exists shypit_private.banking_accounts (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 mode text not null check(mode in ('test','live')),
 provider_id text,
 setup_id text,
 last_started_at timestamptz,
 primary key(workspace_id,mode)
);
create table if not exists shypit_private.banking_audit (
 id bigint generated always as identity primary key,
 workspace_id uuid not null references public.workspaces(id),
 actor uuid not null references auth.users(id),
 action text not null check(action in ('business-setup','provider-onboarding')),
 mode text not null check(mode in ('test','live')),
 created_at timestamptz not null default now()
);
revoke all on shypit_private.finance_managers,shypit_private.banking_accounts,shypit_private.banking_audit from public,anon,authenticated;
create or replace function public.shypit_banking_access(p_workspace uuid,p_manage boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare member_role text; allowed boolean;
begin
 if not public.shypit_session_allowed() then raise exception 'Sign in required' using errcode='42501'; end if;
 select role into member_role from public.memberships where user_id=auth.uid() and workspace_id=p_workspace and active;
 if member_role is null then raise exception 'Workspace access required' using errcode='42501'; end if;
 allowed:=coalesce((public.shypit_admin_profile()->>'owner')::boolean,false) or exists(select 1 from shypit_private.finance_managers where user_id=auth.uid() and workspace_id=p_workspace);
 if p_manage then
  if not allowed then raise exception 'Finance manager required' using errcode='42501'; end if;
  if coalesce((auth.jwt()->>'iat')::bigint,0)<extract(epoch from now()-interval '5 minutes') then raise exception 'Recent sign-in required' using errcode='42501'; end if;
 end if;
 return jsonb_build_object('kind',member_role,'canManage',allowed,'userId',auth.uid());
end;$$;
create or replace function public.shypit_banking_get(p_workspace uuid,p_mode text) returns jsonb
language sql security definer set search_path='' as $$
 select to_jsonb(a)-'last_started_at' from shypit_private.banking_accounts a where workspace_id=p_workspace and mode=p_mode;
$$;
create or replace function public.shypit_banking_begin(p_workspace uuid,p_mode text,p_actor uuid,p_action text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 insert into shypit_private.banking_accounts(workspace_id,mode,last_started_at) values(p_workspace,p_mode,now())
 on conflict(workspace_id,mode) do update set last_started_at=now() where banking_accounts.last_started_at is null or banking_accounts.last_started_at<now()-interval '60 seconds';
 if not found then return false; end if;
 insert into shypit_private.banking_audit(workspace_id,actor,action,mode) values(p_workspace,p_actor,p_action,p_mode);
 return true;
end;$$;
create or replace function public.shypit_banking_save(p_workspace uuid,p_mode text,p_provider text,p_setup text default null) returns void
language sql security definer set search_path='' as $$
 insert into shypit_private.banking_accounts(workspace_id,mode,provider_id,setup_id) values(p_workspace,p_mode,p_provider,p_setup)
 on conflict(workspace_id,mode) do update set provider_id=excluded.provider_id,setup_id=coalesce(excluded.setup_id,banking_accounts.setup_id);
$$;
revoke all on function public.shypit_banking_access(uuid,boolean) from public,anon;
grant execute on function public.shypit_banking_access(uuid,boolean) to authenticated;
revoke all on function public.shypit_banking_get(uuid,text),public.shypit_banking_begin(uuid,text,uuid,text),public.shypit_banking_save(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.shypit_banking_get(uuid,text),public.shypit_banking_begin(uuid,text,uuid,text),public.shypit_banking_save(uuid,text,text,text) to service_role;
commit;
