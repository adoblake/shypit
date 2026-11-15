-- Administrator: apply to an existing Shypit schema so workspaces can start empty.
-- Earlier schemas required at least one shipment and one load, which forced
-- every real workspace to carry sample data. Fresh projects already include this.
begin;
alter table public.workspaces drop constraint valid_workspace_data;
alter table public.workspaces add constraint valid_workspace_data check (
  jsonb_typeof(data) = 'object' and data ?& array['shipments','loads','jobs'] and
  jsonb_typeof(data->'shipments') = 'array' and
  jsonb_typeof(data->'loads') = 'array' and
  jsonb_typeof(data->'jobs') = 'array' and (not (data ? 'packages') or jsonb_typeof(data->'packages') = 'array')
 );
commit;
