-- Apply using the Supabase SQL editor as the project administrator.
-- No signup trigger: only administrators may create memberships and workspaces.
begin;
create table public.workspaces (
 id uuid primary key default gen_random_uuid(),
 kind text not null check (kind in ('business','driver')),
 data jsonb not null,
 unique (id,kind),
 revision bigint not null default 0,
 constraint valid_workspace_data check (
  jsonb_typeof(data) = 'object' and data ?& array['shipments','loads','jobs'] and
  jsonb_typeof(data->'shipments') = 'array' and jsonb_array_length(data->'shipments') > 0 and
  jsonb_typeof(data->'loads') = 'array' and jsonb_array_length(data->'loads') > 0 and
  jsonb_typeof(data->'jobs') = 'array' and (not (data ? 'packages') or jsonb_typeof(data->'packages') = 'array')
 )
);
create table public.memberships (
 user_id uuid not null references auth.users(id) on delete cascade,
 workspace_id uuid not null,
 role text not null check (role in ('business','driver')),
 display_name text not null,
 active boolean not null default true,
 primary key (user_id,workspace_id),
 foreign key (workspace_id,role) references public.workspaces(id,kind)
);
alter table public.workspaces enable row level security;
alter table public.workspaces force row level security;
alter table public.memberships enable row level security;
alter table public.memberships force row level security;
revoke all on public.memberships,public.workspaces from anon,authenticated;
grant select on public.memberships,public.workspaces to authenticated;
grant update(data) on public.workspaces to authenticated;
create policy own_active_membership on public.memberships for select to authenticated
 using (user_id = (select auth.uid()) and active = true);
create policy member_reads_workspace on public.workspaces for select to authenticated
 using (exists(select 1 from public.memberships m where m.user_id=(select auth.uid()) and m.active and m.workspace_id=workspaces.id));
create policy member_updates_workspace on public.workspaces for update to authenticated
 using (exists(select 1 from public.memberships m where m.user_id=(select auth.uid()) and m.active and m.workspace_id=workspaces.id))
 with check (exists(select 1 from public.memberships m where m.user_id=(select auth.uid()) and m.active and m.workspace_id=workspaces.id));
create function public.check_workspace_update() returns trigger language plpgsql set search_path='' as $$
declare member_role text;
begin
 if auth.uid() is not null then
  select role into member_role from public.memberships where user_id=auth.uid() and workspace_id=old.id and active;
  if member_role is null then raise exception 'Access denied'; end if;
  if new.id <> old.id then raise exception 'Workspace identity is immutable'; end if;
  if member_role='business' and (new.data - 'shipments' - 'packages') is distinct from (old.data - 'shipments' - 'packages') then raise exception 'Business members may only update shipments and packages'; end if;
  if member_role='driver' and (new.data - 'jobs') is distinct from (old.data - 'jobs') then raise exception 'Carrier members may only update jobs'; end if;
 end if;
 new.revision := old.revision + 1;
 return new;
end;
$$;
create trigger protect_workspace_fields before update on public.workspaces for each row execute function public.check_workspace_update();
revoke all on function public.check_workspace_update() from public,anon,authenticated;
commit;
