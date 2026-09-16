# ERRORS.md — things that took >2 attempts

## pnpm 11 ignores build scripts (esbuild) and exits 1
- ❌ `.npmrc` flags, `onlyBuiltDependencies` in `pnpm-workspace.yaml` (pnpm 10 syntax) — still `ERR_PNPM_IGNORED_BUILDS`.
- ✅ pnpm 11 syntax: `allowBuilds:` map in `pnpm-workspace.yaml` (`esbuild: true`, etc.).
- Remember: `pnpm --filter x run` triggers a deps-status check that re-runs install, so the ignored-builds error surfaces on *every* command until fixed.

## pnpm 11 ignored `.npmrc` `node-linker=hoisted`
- ❌ `.npmrc` with `node-linker=hoisted` — pnpm 11 reported `node-linker: undefined` and installed with isolated symlinks (bad for Metro/Expo).
- ✅ Put settings in `pnpm-workspace.yaml`: `nodeLinker: hoisted`, `autoInstallPeers: true`, `strictPeerDependencies: false`. Delete `.npmrc`. Reinstall from scratch (`rm -rf node_modules apps/*/node_modules packages/*/node_modules`).
