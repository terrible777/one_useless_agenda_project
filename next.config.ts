import type { NextConfig } from "next";

const useNextServer = process.env.VERCEL === "1" || process.env.AGENDA_BUILD_TARGET === "server";

const nextConfig: NextConfig = {
  output: useNextServer ? undefined : "export",
};

export default nextConfig;
