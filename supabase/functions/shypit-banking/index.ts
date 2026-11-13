import { makeBankingHandler } from "./core.mjs";
Deno.serve(
  makeBankingHandler({
    supabaseUrl: Deno.env.get("SUPABASE_URL") || "",
    publicKey: Deno.env.get("SUPABASE_ANON_KEY") || "",
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    stripeKey: Deno.env.get("STRIPE_TEST_SECRET_KEY") || "",
  }),
);
