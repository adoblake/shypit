-- Administrator: apply to an existing Shypit schema before using package tracking.
begin;
alter table public.workspaces drop constraint valid_workspace_data;
alter table public.workspaces add constraint valid_workspace_data check (
  jsonb_typeof(data) = 'object' and data ?& array['shipments','loads','jobs'] and
  jsonb_typeof(data->'shipments') = 'array' and jsonb_array_length(data->'shipments') > 0 and
  jsonb_typeof(data->'loads') = 'array' and jsonb_array_length(data->'loads') > 0 and
  jsonb_typeof(data->'jobs') = 'array' and (not (data ? 'packages') or jsonb_typeof(data->'packages') = 'array')
 );
create or replace function public.check_workspace_update() returns trigger language plpgsql set search_path='' as $$
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
revoke all on function public.check_workspace_update() from public,anon,authenticated;
commit;
