import { applicationOrigin } from "@/server/auth/request-security";
import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const hash = url.searchParams.get("token_hash");
  let success = false;
  if (code || hash) {
    try {
      const client = await createAuthClient();
      const { error } = hash
        ? await client.auth.verifyOtp({ token_hash: hash, type: "signup" })
        : await client.auth.exchangeCodeForSession(code!);
      success = !error;
      await client.auth.signOut({ scope: "local" });
    } catch {
      success = false;
    }
  }
  const response = NextResponse.redirect(
    new URL(
      `/confirmar-email?status=${success ? "sucesso" : "invalido"}`,
      applicationOrigin(request),
    ),
  );
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
