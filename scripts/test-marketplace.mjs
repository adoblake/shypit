import { PGlite } from "@electric-sql/pglite";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111",
  carrier = "22222222-2222-4222-8222-222222222222",
  otherCarrier = "33333333-3333-4333-8333-333333333333",
  otherBusiness = "44444444-4444-4444-8444-444444444444";
const business = "a1111111-1111-4111-8111-111111111111",
  driver = "b2222222-2222-4222-8222-222222222222",
  driver2 = "c3333333-3333-4333-8333-333333333333",
  business2 = "d4444444-4444-4444-8444-444444444444";
try {
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid(),auth.jwt() to authenticated,anon;insert into auth.users values('${owner}','owner@example.test',now()),('${carrier}','carrier@example.test',now()),('${otherCarrier}','other-carrier@example.test',now()),('${otherBusiness}','other-business@example.test',now());`,
  );
  await db.exec(
    execFileSync(
      process.execPath,
      [
        "scripts/provision-founders.mjs",
        "owner@example.test",
        "carrier@example.test",
        "--fresh",
      ],
      { encoding: "utf8" },
    ),
  );
  await db.exec(
    `delete from public.memberships where (user_id='${owner}' and role='driver') or (user_id='${carrier}' and role='business');insert into public.workspaces(id,kind,data) select '${driver2}',kind,data from public.workspaces where id='${driver}';insert into public.workspaces(id,kind,data) select '${business2}',kind,data from public.workspaces where id='${business}';insert into public.memberships values('${otherCarrier}','${driver2}','driver','Other carrier',true),('${otherBusiness}','${business2}','business','Other business',true);`,
  );
  for (const id of [owner, carrier, otherCarrier, otherBusiness])
    await db.query(
      "select public.shypit_permit_session($1,$1,repeat('a',64),now()+interval '15 minutes')",
      [id],
    );
  async function as(id) {
    await db.exec("reset role;set role authenticated");
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
      [id, JSON.stringify({ session_id: id })],
    );
  }
  const rpc = async (name, params) => {
    const q = Object.keys(params)
      .map((k, i) => `${k} => $${i + 1}`)
      .join(",");
    return (
      await db.query(
        `select public.shypit_market_${name}(${q}) as result`,
        Object.values(params),
      )
    ).rows[0].result;
  };
  const list = (workspace) => rpc("list", { p_workspace: workspace });
  const pickup = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    delivery = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
  const data = {
    business_name: "Sample Supply LLC",
    origin: "Phoenix, AZ",
    destination: "Los Angeles, CA",
    pickup,
    delivery,
    equipment: "Dry van",
    cargo: "Office supplies",
    pallets: 8,
    weight: 6400,
    rate_cents: 96500,
  };
  const details = {
    pickup_address: "123 Private Dock",
    delivery_address: "456 Private Receiving",
    contact_name: "Sample Shipper",
    contact_email: "private-shipper@example.test",
    contact_phone: "555-010-1000",
  };
  const postArgs = {
    p_workspace: business,
    p_request: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    p_listing: JSON.stringify(data),
    p_private: JSON.stringify(details),
  };
  await db.exec("set role anon");
  await assert.rejects(list(business));
  await as(owner);
  await assert.rejects(db.query("select * from shypit_private.market_details"));
  const id = await rpc("post", postArgs);
  assert.equal(await rpc("post", postArgs), id);
  assert.equal((await list(business)).length, 1);
  await assert.rejects(
    rpc("post", {
      ...postArgs,
      p_request: "eeeeeeee-eeee-4eee-8eee-ffffffffffff",
      p_listing: JSON.stringify({ ...data, origin: "123 Private Dock, AZ" }),
    }),
  );
  await as(carrier);
  await assert.rejects(rpc("post", postArgs));
  await assert.rejects(list(business));
  let visible = await list(driver);
  assert.equal(visible[0].private_details, null);
  assert.ok(!JSON.stringify(visible).includes("Private Dock"));
  assert.ok(!JSON.stringify(visible).includes("private-shipper"));
  const contact = {
    name: "Sample Operator",
    email: "carrier-contact@example.test",
    phone: "555-010-2000",
  };
  const offer = await rpc("offer", {
    p_workspace: driver,
    p_listing: id,
    p_name: "Sample Carrier LLC",
    p_amount: 1,
    p_contact: JSON.stringify(contact),
  });
  assert.equal((await list(driver))[0].offers[0].amount_cents, 96500);
  await as(otherCarrier);
  const offer2 = await rpc("offer", {
    p_workspace: driver2,
    p_listing: id,
    p_name: "Other Carrier LLC",
    p_amount: 2,
    p_contact: JSON.stringify({
      ...contact,
      email: "other-private@example.test",
    }),
  });
  assert.equal((await list(driver2))[0].offers.length, 1);
  await as(carrier);
  visible = await list(driver);
  assert.equal(visible[0].offers.length, 1);
  assert.ok(!JSON.stringify(visible).includes("Other Carrier LLC"));
  await assert.rejects(
    rpc("withdraw", { p_workspace: driver, p_offer: offer2 }),
  );
  await rpc("withdraw", { p_workspace: driver, p_offer: offer });
  assert.equal((await list(driver))[0].offers[0].state, "withdrawn");
  await rpc("offer", {
    p_workspace: driver,
    p_listing: id,
    p_name: "Sample Carrier LLC",
    p_amount: 96500,
    p_contact: JSON.stringify(contact),
  });
  await as(otherBusiness);
  assert.equal((await list(business2)).length, 0);
  await assert.rejects(
    rpc("accept", { p_workspace: business2, p_offer: offer, p_revision: 1 }),
  );
  await assert.rejects(
    rpc("close", {
      p_workspace: business2,
      p_listing: id,
      p_expected_state: "open",
    }),
  );
  await as(owner);
  visible = await list(business);
  assert.equal(visible[0].offers.length, 2);
  assert.equal(visible[0].offers[0].contact, null);
  await assert.rejects(
    rpc("accept", { p_workspace: business, p_offer: offer, p_revision: 0 }),
  );
  await rpc("accept", { p_workspace: business, p_offer: offer, p_revision: 1 });
  await assert.rejects(
    rpc("accept", { p_workspace: business, p_offer: offer2, p_revision: 0 }),
  );
  await assert.rejects(
    rpc("close", {
      p_workspace: business,
      p_listing: id,
      p_expected_state: "open",
    }),
  );
  await as(carrier);
  visible = await list(driver);
  assert.equal(
    visible[0].private_details.pickup_address,
    details.pickup_address,
  );
  assert.equal(visible[0].state, "booked");
  await assert.rejects(
    rpc("withdraw", { p_workspace: driver, p_offer: offer }),
  );
  await as(otherCarrier);
  visible = await list(driver2);
  assert.equal(visible[0].private_details, null);
  assert.equal(visible[0].offers[0].state, "rejected");
  await assert.rejects(
    rpc("offer", {
      p_workspace: driver2,
      p_listing: id,
      p_name: "Other LLC",
      p_amount: 90000,
      p_contact: JSON.stringify(contact),
    }),
  );
  await as(owner);
  await rpc("close", {
    p_workspace: business,
    p_listing: id,
    p_expected_state: "booked",
  });
  await as(carrier);
  visible = await list(driver);
  assert.equal(visible[0].state, "cancelled");
  assert.equal(visible[0].private_details, null);
  await as(owner);
  const quoteId = await rpc("post", {
    ...postArgs,
    p_request: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    p_listing: JSON.stringify({ ...data, rate_cents: null }),
  });
  await as(carrier);
  const quoteOffer = await rpc("offer", {
    p_workspace: driver,
    p_listing: quoteId,
    p_name: "Quote Carrier LLC",
    p_amount: 90000,
    p_contact: JSON.stringify(contact),
  });
  await as(otherCarrier);
  await rpc("offer", {
    p_workspace: driver2,
    p_listing: quoteId,
    p_name: "Private Competitor LLC",
    p_amount: 98000,
    p_contact: JSON.stringify(contact),
  });
  await as(carrier);
  const quoted = (await list(driver)).find((l) => l.id === quoteId);
  assert.equal(quoted.offers.length, 1);
  assert.equal(quoted.offers[0].amount_cents, 90000);
  assert.ok(!JSON.stringify(quoted).includes("98000"));
  assert.ok(!JSON.stringify(quoted).includes("Private Competitor"));
  await as(owner);
  await rpc("accept", {
    p_workspace: business,
    p_offer: quoteOffer,
    p_revision: 0,
  });
  await as(carrier);
  assert.equal(
    (await list(driver)).find((l) => l.id === quoteId).offers[0].amount_cents,
    90000,
  );
  await db.exec("reset role");
  await db.query(
    "update public.memberships set active=false where user_id=$1",
    [carrier],
  );
  await as(carrier);
  await assert.rejects(list(driver));
  await as(owner);
  await db.exec("reset role");
  await db.query(
    "delete from shypit_private.session_permits where user_id=$1",
    [owner],
  );
  await as(owner);
  await assert.rejects(list(business));
  console.log(
    "PASS marketplace: real shared posting, idempotency, role isolation, quote privacy, fixed-price integrity, withdrawal, single booking, private detail release, cancellation and immediate access revocation",
  );
} finally {
  await db.close();
}
