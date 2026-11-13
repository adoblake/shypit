// Runs only in an explicitly dispatched GitHub Actions job with a management token.
// No token, raw email address, auth configuration, or SQL result is printed.
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
export async function activationSql(keys, existing) {
  if (
    !Array.isArray(keys) ||
    keys.length !== 2 ||
    new Set(keys).size !== 2 ||
    keys.some((key) => !/^\w{64}$/.test(key) || !/^[a-f0-9]+$/.test(key))
  )
    throw Error("Two distinct approved invitation keys are required.");
  const args = [
    "scripts/provision-founders.mjs",
    keys[0],
    keys[1],
    existing ? "--existing" : "--fresh",
    "--hashed",
  ];
  return execFileSync(process.execPath, args, { encoding: "utf8" });
}
export function authConfigPatch(current) {
  const site = "https://adoblake.github.io/shypit/";
  const proposed = {
    site_url: site,
    jwt_exp: 900,
    disable_signup: true,
    mailer_subjects_invite: "Create your Shypit password",
    mailer_subjects_recovery: "Reset your Shypit password",
    mailer_templates_invite: `<h2>Welcome to Shypit</h2><p>You have approved access to the private preview.</p><p><a href="${site}?flow=setup&type=invite&token_hash={{ .TokenHash }}">Create your password</a></p>`,
    mailer_templates_recovery: `<h2>Reset your Shypit password</h2><p><a href="${site}?flow=reset&type=recovery&token_hash={{ .TokenHash }}">Choose a new password</a></p><p>If you did not request this, ignore this email.</p>`,
  };
  const customSender = Boolean(current.smtp_host);
  const patch = Object.fromEntries(
    Object.entries(proposed).filter(
      ([key]) =>
        Object.hasOwn(current, key) &&
        (!key.startsWith("mailer_") || customSender),
    ),
  );
  if (Object.hasOwn(current, "uri_allow_list")) {
    const entries = Array.isArray(current.uri_allow_list)
      ? current.uri_allow_list
      : typeof current.uri_allow_list === "string"
        ? current.uri_allow_list.split(",")
        : [];
    const merged = [
      ...new Set([...entries.map((s) => s.trim()).filter(Boolean), site]),
    ];
    patch.uri_allow_list = Array.isArray(current.uri_allow_list)
      ? merged
      : merged.join(",");
  }
  return patch;
}
async function run() {
  const token = execFileSync(
    "python3",
    [
      "-c",
      'import sys; sys.path.insert(0,"scripts"); from auth_deploy_credentials import normalized_token; print(normalized_token())',
    ],
    { encoding: "utf8" },
  ).trim();
  if (!token) throw Error("Secure deployment credential is missing.");
  const keys = JSON.parse(process.env.SHYPIT_INVITATION_KEYS || "[]");
  const root = "https://api.supabase.com/v1/projects/mzztaucyapmwlnuiljsv";
  async function call(path, body, method = body ? "POST" : "GET") {
    const response = await fetch(root + path, {
      method,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(60000),
    });
    const result = await response.json();
    if (!response.ok) {
      const missing =
        result?.error?.missing_permissions?.filter((x) =>
          /^[a-z_]+$/.test(x),
        ) || [];
      let detail = typeof result?.message === "string" ? result.message : "";
      detail = detail
        .replaceAll(token, "[redacted]")
        .replace(/sbp_[A-Za-z0-9_-]+/g, "[redacted]")
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email redacted]")
        .slice(0, 700);
      throw Error(
        "Supabase " +
          path +
          " rejected (HTTP " +
          response.status +
          ")." +
          (missing.length
            ? " Required permission: " + missing.join(", ")
            : "") +
          (detail ? " " + detail : ""),
      );
    }
    return result;
  }
  const metadata = await call("/database/query", {
    query: "select to_regclass('public.memberships') is not null as installed;",
  });
  if (!Array.isArray(metadata) || typeof metadata[0]?.installed !== "boolean")
    throw Error("Unexpected database status response. No schema changes made.");
  const query = await activationSql(keys, metadata[0].installed);
  await call("/database/query", { query });
  console.log(
    "Authentication database installed; two approved preview invitations provisioned. Existing workspaces preserved.",
  );
  const current = await call("/config/auth");
  const patch = authConfigPatch(current);
  if (Object.keys(patch).length) {
    await call("/config/auth", patch, "PATCH");
    console.log(
      "Supported password setup/recovery settings configured. Existing redirect entries preserved.",
    );
  }
  if (!current.smtp_host)
    console.log(
      "Default email templates retained; the app supports their secure callback links.",
    );
  const smtp = Object.hasOwn(current, "smtp_host")
    ? Boolean(current.smtp_host)
    : null;
  console.log(
    "Custom SMTP configuration present: " +
      (smtp === null ? "unknown" : smtp ? "yes" : "no"),
  );
  console.log("No invitation or recovery messages were sent by activation.");
}
if (process.argv[1]?.endsWith("activate-auth-database.mjs"))
  run().catch((error) => {
    console.error(
      "::error title=Authentication database activation::" + error.message,
    );
    process.exitCode = 1;
  });
