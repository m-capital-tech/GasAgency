import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts", "src/commands/bootstrap-super-admin.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  external: ["pg"],
  noExternal: ["@platform/database", "@platform/runtime"],
});
