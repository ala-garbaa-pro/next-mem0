import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // LanceDB ships a native N-API binary; keep it (and the apache-arrow instance it shares with
  // the app) out of the server bundle so both resolve to the same copy in node_modules.
  serverExternalPackages: ["@lancedb/lancedb", "apache-arrow"],
};

export default nextConfig;
