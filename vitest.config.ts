import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    poolOptions: {
      forks: {
        execArgv: ["--experimental-sqlite"],
      },
    },
  },
});
