import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Student photos are shrunk in the browser, but allow some headroom for form uploads.
    serverActions: { bodySizeLimit: "3mb" },
  },
};

export default nextConfig;
