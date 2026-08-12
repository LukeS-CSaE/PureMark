import { defineConfig } from "vitest/config";

/**
 * Test config kept separate from `vite.config.ts` so the unit tests do not pull
 * in the React / Tailwind plugin chain (they only exercise pure TS modules).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    reporters: ["verbose"],
  },
});
