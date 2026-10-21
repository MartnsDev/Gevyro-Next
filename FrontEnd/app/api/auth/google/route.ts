import { applicationOrigin } from "@/server/auth/request-security";
import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const origin = applicationOrigin(request);
  const client = await createAuthClient();
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/api/auth/callback`,
      skipBrowserRedirect: true,
    },
  });
  const response = NextResponse.redirect(
    error || !data.url ? new URL("/auth/login?error=oauth2", origin) : data.url,
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
