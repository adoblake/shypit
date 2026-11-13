import { defineConfig, loadEnv } from "vite";
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env };
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
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
    url: env.VITE_SUPABASE_URL || "",
    publicKey: env.VITE_SUPABASE_PUBLISHABLE_KEY || "",
    emailOtpEnabled: env.VITE_ENABLE_EMAIL_OTP === "true",
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
