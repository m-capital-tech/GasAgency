# ERRORS.md — things that took >2 attempts

## pnpm 11 ignores build scripts (esbuild) and exits 1
- ❌ `.npmrc` flags, `onlyBuiltDependencies` in `pnpm-workspace.yaml` (pnpm 10 syntax) — still `ERR_PNPM_IGNORED_BUILDS`.
- ✅ pnpm 11 syntax: `allowBuilds:` map in `pnpm-workspace.yaml` (`esbuild: true`, etc.).
- Remember: `pnpm --filter x run` triggers a deps-status check that re-runs install, so the ignored-builds error surfaces on *every* command until fixed.

## pnpm 11 ignored `.npmrc` `node-linker=hoisted`
- ❌ `.npmrc` with `node-linker=hoisted` — pnpm 11 reported `node-linker: undefined` and installed with isolated symlinks (bad for Metro/Expo).
- ✅ Put settings in `pnpm-workspace.yaml`: `nodeLinker: hoisted`, `autoInstallPeers: true`, `strictPeerDependencies: false`. Delete `.npmrc`. Reinstall from scratch (`rm -rf node_modules apps/*/node_modules packages/*/node_modules`).

## Metro: "Failed to get SHA-1 for …/node_modules/react-native/node_modules/@react-native/js-polyfills/console.js"
- Cause: `node_modules` was reinstalled (paths changed) while Metro was already running with a cached file map.
- ✅ `npx expo start --clear` (restart Metro with a cleared cache).

## Leaflet tiles show "API KEY REQUIRED"
- ❌ `basemaps.cartocdn.com/light_all` — CARTO now requires a key.
- ✅ `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (no key; fine for local demos).

## Turbo 2 strips env vars from `pnpm demo`
- ❌ `EXPO_PORT=8091 pnpm demo` still started Expo on 8081.
- ✅ `globalPassThroughEnv: ["EXPO_PORT", "PORT", "EXPO_PUBLIC_*", "NEXT_PUBLIC_*"]` in `turbo.json`.
