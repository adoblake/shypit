import { defineConfig } from "vite";
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/shypit/" : "/",
  server: { host: "0.0.0.0", allowedHosts: ["terminal.local"] },
});
