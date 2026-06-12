import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Resolve the workspace package straight to its TS source so Vitest
      // doesn't have to transform a .ts file living under node_modules.
      "@crickverse/types": fileURLToPath(new URL("../types/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
  },
});
