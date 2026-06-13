/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native module; keep it external to the server bundle
  // so Next doesn't try to bundle the .node binary. (In Next 14.2 this lives
  // under `experimental`; it was promoted to top-level in Next 15.)
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
};

export default nextConfig;
