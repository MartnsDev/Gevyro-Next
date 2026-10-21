export const dynamic = "force-dynamic";

/** Liveness only: no credentials, database metadata or customer data. */
export function GET() {
  return Response.json({ status: "ok" }, {
    headers: { "Cache-Control": "no-store" },
  });
}
