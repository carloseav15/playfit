import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const appRoot = dirname(fileURLToPath(import.meta.url));
const fullCoverage = process.env.FULL_COVERAGE === "1";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(appRoot, "src"),
    },
  },
  test: {
    environment: "happy-dom",
    setupFiles: ["./vitest.setup.ts"],
    exclude: ["e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: fullCoverage ? "./coverage-full" : "./coverage",
      // Runtime logic is the default quality gate; UI presentation is covered
      // through headless E2E and axe audits.
      include: fullCoverage ? undefined : ["src/app/api/**/*.ts", "src/lib/**/*.ts"],
    },
  },
});
