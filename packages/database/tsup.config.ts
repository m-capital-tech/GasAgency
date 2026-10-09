import { defineConfig } from "tsup";

export default defineConfig({
  entry: { migrate: "scripts/migrate.ts", "grant-runtime": "scripts/grant-runtime.ts" },
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  external: ["pg"],
});
