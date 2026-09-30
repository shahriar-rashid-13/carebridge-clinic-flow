import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
      // Edge Functions import npm packages with Deno's npm: specifier.
      { find: /^npm:(@?[^@]+)@.*$/, replacement: "$1" },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/edge/**/*.test.ts"],
    env: {
      VITE_SUPABASE_URL: "http://supabase.test",
      VITE_SUPABASE_PUBLISHABLE_KEY: "test-key",
      VITE_AI_FUNCTION: "carebridge-ai-v2",
    },
  },
});
