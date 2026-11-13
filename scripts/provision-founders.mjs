// Outputs SQL for an administrator. Never accepts passwords or connects to a database.
import { readFile } from "node:fs/promises";
import { initialShipments, loads } from "../tests/fixtures/demo-data.js";
const [ownerEmail, ronaldEmail, mode = "--fresh"] = process.argv.slice(2);
if (
  !ownerEmail?.includes("@") ||
  !ronaldEmail?.includes("@") ||
  ownerEmail.toLowerCase() === ronaldEmail.toLowerCase() ||
  !["--fresh", "--existing"].includes(mode)
)
  throw Error(
    "Usage: node scripts/provision-founders.mjs owner-email ronald-email --fresh|--existing",
  );
const quote = (s) => "'" + s.replaceAll("'", "''") + "'";
const data = JSON.stringify({
  shipments: initialShipments,
  loads,
  jobs: [],
  packages: [],
});
const schema =
  mode === "--fresh"
    ? (await readFile("supabase/schema.sql", "utf8"))
        .replace(/^begin;$/m, "")
        .replace(/^commit;$/m, "")
    : "";
const migration =
  mode === "--existing"
    ? `-- Upgrade only the old one-workspace-per-user primary key, if present.
do $migration$
begin
 if exists(select 1 from pg_constraint where conrelid='public.memberships'::regclass and contype='p' and cardinality(conkey)=1) then
  alter table public.memberships drop constraint memberships_pkey;
  alter table public.memberships add primary key(user_id,workspace_id);
 end if;
end;
$migration$;`
    : "";
console.log(`-- PRIVATE account setup: review and run in Supabase SQL Editor as administrator.
-- Create both confirmed Auth users first; passwords belong only in the secure Supabase UI.
-- This file contains approved emails. Do not commit generated output to a public repository.
-- Preview workspaces contain fictional sample data. Existing preview changes are preserved.
begin;
${schema}
${migration}
do $founders$
declare owner_user uuid; ronald_user uuid;
begin
 select id into strict owner_user from auth.users where lower(email)=lower(${quote(ownerEmail)}) and email_confirmed_at is not null;
 select id into strict ronald_user from auth.users where lower(email)=lower(${quote(ronaldEmail)}) and email_confirmed_at is not null;
 insert into public.workspaces(id,kind,data) values
 ('a1111111-1111-4111-8111-111111111111','business',${quote(data)}::jsonb),
 ('b2222222-2222-4222-8222-222222222222','driver',${quote(data)}::jsonb)
 on conflict(id) do nothing;
 insert into public.memberships(user_id,workspace_id,role,display_name,active) values
 (owner_user,'a1111111-1111-4111-8111-111111111111','business','Company preview',true),
 (owner_user,'b2222222-2222-4222-8222-222222222222','driver','LLC carrier preview',true),
 (ronald_user,'a1111111-1111-4111-8111-111111111111','business','Company preview',true),
 (ronald_user,'b2222222-2222-4222-8222-222222222222','driver','LLC carrier preview',true)
 on conflict(user_id,workspace_id) do nothing;
end;
$founders$;
commit;`);
