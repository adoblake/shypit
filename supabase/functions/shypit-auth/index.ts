import { makeAuthHandler } from "./core.mjs";
const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Missing server configuration: " + name);
  return value;
};
Deno.serve(
  makeAuthHandler({
    supabaseUrl: required("SUPABASE_URL"),
    serviceKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    publicKey: required("SUPABASE_ANON_KEY"),
    siteUrl:
      Deno.env.get("SHYPIT_SITE_URL") || "https://adoblake.github.io/shypit/",
  }),
);
