import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.2"],
  distDir: process.env.ERP_ISOLATED_TEST === "true" ? ".next-test" : ".next",
};

export default nextConfig;
