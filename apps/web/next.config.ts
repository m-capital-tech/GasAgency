import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@gassetu/shared", "@gassetu/ui-tokens"],
  reactStrictMode: true,
};

export default nextConfig;
