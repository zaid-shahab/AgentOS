import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/webhook/:path*",
        destination: `${process.env.ENGINE_URL || "http://localhost:4000"}/webhook/:path*`,
      },
    ];
  },
};

export default nextConfig;
