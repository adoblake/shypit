-- Only for an existing Shypit schema with the old one-membership-per-user key.
-- The new initial schema already includes this change.
begin;
alter table public.memberships drop constraint memberships_pkey;
alter table public.memberships add primary key(user_id,workspace_id);
commit;
