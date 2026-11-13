import { defineConfig, loadEnv } from "vite";
import publicAuth from "./config/public-auth.json";
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env };
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || publicAuth.publicKey;
  if (key) {
    let valid = key.startsWith("sb_publishable_");
    if (!valid)
      try {
        valid =
          JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString())
            .role === "anon";
      } catch {}
    if (!valid)
      throw Error(
        "Only a Supabase publishable or legacy anon key may be used in frontend configuration.",
      );
  }
  const authConfig = JSON.stringify({
    passwordEnabled: publicAuth.passwordEnabled !== false,
    googleEnabled: publicAuth.googleEnabled === true,
    url: env.VITE_SUPABASE_URL || publicAuth.url,
    publicKey: key,
    emailOtpEnabled: env.VITE_ENABLE_EMAIL_OTP
      ? env.VITE_ENABLE_EMAIL_OTP === "true"
      : publicAuth.emailOtpEnabled,
  });
  return {
    base: "./",
    server: { host: "0.0.0.0", allowedHosts: ["terminal.local"] },
    plugins: [
      {
        name: "shypit-auth-config",
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url?.split("?")[0] !== "/auth-config.json") return next();
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store");
            res.end(authConfig);
          });
        },
        generateBundle() {
          this.emitFile({
            type: "asset",
            fileName: "auth-config.json",
            source: authConfig,
          });
        },
      },
    ],
  };
});
