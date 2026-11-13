// Emits SQL for the project administrator; does not contact a service or execute it.
import { initialShipments, loads } from "../tests/fixtures/demo-data.js";
const [role, email] = process.argv.slice(2);
if (!["business", "driver"].includes(role) || !email || !email.includes("@"))
  throw Error(
    "Usage: node scripts/provision-pilot.mjs business|driver invited-email",
  );
const quote = (s) => "'" + s.replaceAll("'", "''") + "'";
const data = JSON.stringify({ shipments: initialShipments, loads, jobs: [] });
console.log(`-- Creates a private pilot workspace using SAMPLE data only.
-- Run as administrator in the Supabase SQL editor. User must already exist in Authentication → Users.
begin;
do $provision$
declare invited_user uuid; new_workspace uuid;
begin
 select id into strict invited_user from auth.users where lower(email)=lower(${quote(email)});
 insert into public.workspaces(kind,data) values (${quote(role)},${quote(data)}::jsonb) returning id into new_workspace;
 insert into public.memberships(user_id,workspace_id,role,display_name) values(invited_user,new_workspace,${quote(role)},${quote(role === "business" ? "Business workspace" : "Carrier workspace")});
end;
$provision$;
commit;`);
