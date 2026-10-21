import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  const client = await createAuthClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) return new NextResponse(null, { status: 401, headers });
  const { data: profile } = await client
    .from("usuarios")
    .select("foto_upload")
    .eq("auth_user_id", user.id)
    .single();
  if (!profile?.foto_upload?.startsWith(`${user.id}/`))
    return new NextResponse(null, { status: 404, headers });
  const { data, error: downloadError } = await client.storage
    .from("profile-photos")
    .download(profile.foto_upload);
  if (downloadError || !data)
    return new NextResponse(null, { status: 404, headers });
  return new NextResponse(data, {
    headers: {
      "Content-Type": data.type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
