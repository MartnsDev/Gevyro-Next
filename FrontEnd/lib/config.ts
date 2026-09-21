// lib/config.ts
export const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "",
  appName: "Gevyro",
  tagline: "Gestão em evolução.",
  version: "1.0.0",
} as const;
