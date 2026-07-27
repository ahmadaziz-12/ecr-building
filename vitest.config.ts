// Deliberately separate from vite.config.ts: that file's defineConfig comes from
// @lovable.dev/vite-tanstack-config, which wires up TanStack Start's SSR/Nitro server build. Vitest
// needs a plain jsdom React setup instead, so it gets its own minimal config rather than trying to
// coexist inside the SSR-oriented one.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
});
