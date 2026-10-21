import { applicationOrigin } from "@/server/auth/request-security";
import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  let valid = false;
  if (code && !url.searchParams.has("error")) {
    try {
      valid = !(
        await (await createAuthClient()).auth.exchangeCodeForSession(code)
      ).error;
    } catch {
      valid = false;
    }
  }
  const response = NextResponse.redirect(
    new URL(valid ? "/dashboard" : "/auth/login?error=oauth2", applicationOrigin(request)),
  );
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
