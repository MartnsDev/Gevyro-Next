import { fileURLToPath } from "node:url";
const projectRoot = fileURLToPath(new URL(".", import.meta.url));
// O Gevyro Next usa suas próprias Route Handlers, nunca a API Java original.
const configuredApiUrl = "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  distDir: process.env.GEVYRO_VALIDATE_BUILD === "1" ? ".next-validation" : ".next",
  outputFileTracingRoot: projectRoot,
  turbopack: { root: projectRoot },
  // Compartilha o mesmo endereço com todos os clientes HTTP da interface.
  env: {
    NEXT_PUBLIC_API_URL: configuredApiUrl,
  },
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
  images: {
    unoptimized: true,
    qualities: [75, 95],
    remotePatterns: [
      // Foto do Google
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      // Backend Railway
      {
        protocol: "https",
        hostname: "api.gevyro.com.br",
      },
      // Cloudinary — fotos de upload
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/dashboard/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive, noimageindex",
          },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          {
            key: "Referrer-Policy",
            value: "no-referrer",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), payment=(self \"https://www.mercadopago.com.br\")",
          },

        ],
      },
    ];
  },
};

export default nextConfig;
