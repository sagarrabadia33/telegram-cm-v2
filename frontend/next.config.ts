import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mark pdf-parse as external to prevent worker bundling issues
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
