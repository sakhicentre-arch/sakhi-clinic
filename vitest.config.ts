import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],
    // Keep unit/integration tests separate from Playwright E2E specs (in `/tests`).
    include: ["src/__tests__/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["tests/**", "playwright-results/**", "playwright-report/**", "dist/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "src/__tests__/",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
