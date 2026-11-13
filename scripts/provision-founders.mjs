// Outputs SQL for an administrator. Never accepts passwords or connects to a database.
import { readFile } from "node:fs/promises";
import { initialShipments, loads } from "../tests/fixtures/demo-data.js";
const [ownerEmail, ronaldEmail, mode = "--fresh", format] =
  process.argv.slice(2);
const hashed = format === "--hashed";
if (
  !(hashed
    ? /^[a-f0-9]{64}$/.test(ownerEmail || "")
    : ownerEmail?.includes("@")) ||
  !(hashed
    ? /^[a-f0-9]{64}$/.test(ronaldEmail || "")
    : ronaldEmail?.includes("@")) ||
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
const security = (await readFile("supabase/auth-security.sql", "utf8"))
  .replace(/^begin;$/m, "")
  .replace(/^commit;$/m, "");
console.log(`-- PRIVATE setup. This allowlists the approved emails; it does not choose passwords.
-- Run as project administrator, deploy the shypit-auth Edge Function, and configure SMTP.
-- Then each founder uses Create your password and verifies their email link.
-- Keep this generated file out of the public repository.
begin;
${schema}
${migration}
${security}
insert into public.workspaces(id,kind,data) values
 ('a1111111-1111-4111-8111-111111111111','business',${quote(data)}::jsonb),
 ('b2222222-2222-4222-8222-222222222222','driver',${quote(data)}::jsonb)
on conflict(id) do nothing;
insert into shypit_private.preview_invitations(email_key,workspace_id,role,display_name,active)
select ${hashed ? "email" : "encode(sha256(convert_to(lower(email),'UTF8')),'hex')"},workspace_id,role,display_name,true from (values
 (${quote(ownerEmail)},'a1111111-1111-4111-8111-111111111111'::uuid,'business','Company preview'),
 (${quote(ownerEmail)},'b2222222-2222-4222-8222-222222222222'::uuid,'driver','LLC carrier preview'),
 (${quote(ronaldEmail)},'a1111111-1111-4111-8111-111111111111'::uuid,'business','Company preview'),
 (${quote(ronaldEmail)},'b2222222-2222-4222-8222-222222222222'::uuid,'driver','LLC carrier preview')
) v(email,workspace_id,role,display_name)
on conflict(email_key,workspace_id) do nothing;
-- Existing verified users keep their accounts. New users activate after proving email ownership.
insert into public.memberships(user_id,workspace_id,role,display_name,active)
select u.id,i.workspace_id,i.role,i.display_name,true from auth.users u join shypit_private.preview_invitations i on i.email_key=encode(sha256(convert_to(lower(u.email),'UTF8')),'hex') where u.email_confirmed_at is not null and i.active
on conflict(user_id,workspace_id) do nothing;
commit;`);
