import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Pacotes nativos/Node de servidor não devem ser empacotados pelo Turbopack em contextos incompatíveis.
  serverExternalPackages: [
    "playwright",
    "@prisma/client",
    "ioredis",
    "@azure/storage-blob",
    "@azure/service-bus",
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
