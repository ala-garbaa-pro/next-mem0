import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // LanceDB ships a native N-API binary; keep it out of the server bundle.
  serverExternalPackages: ["apache-arrow"],
};

export default nextConfig;
