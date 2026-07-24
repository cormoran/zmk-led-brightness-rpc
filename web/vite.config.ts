import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  // The fallback base only matters for local dev/preview; CI sets VITE_BASE
  // to /<repo>/. scripts/init_module.py rewrites this "zmk-module-template"
  // token (like every other bare repo-name reference) to the real repo name.
  base: process.env.VITE_BASE ?? "/zmk-module-template/",
  plugins: [react()],
});
