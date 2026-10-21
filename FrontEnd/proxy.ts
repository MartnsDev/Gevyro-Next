import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const production = process.env.NODE_ENV === "production";
  const path = request.nextUrl.pathname;
  const api = path.startsWith("/api/");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (production && !appUrl) {
    return NextResponse.json({ message: "Ambiente indisponível." }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
  // Never build auth redirects from an arbitrary inbound Host header in production.
  if (production && appUrl && request.headers.get("host") !== new URL(appUrl).host) {
    return NextResponse.json({ message: "Host não autorizado." }, { status: 421 });
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (api && (!Number.isFinite(length) || length < 0 || length > 6 * 1024 * 1024)) {
    return NextResponse.json({ message: "Requisição muito grande." }, { status: 413 });
  }
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = [
    "default-src 'self'", "base-uri 'self'", "object-src 'none'",
    "frame-ancestors 'none'", "form-action 'self' https://www.mercadopago.com.br",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${production ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'", "font-src 'self' data:",
    "img-src 'self' data: blob: https://lh3.googleusercontent.com https://res.cloudinary.com https://api.gevyro.com.br https://cdn.jsdelivr.net",
    `connect-src 'self'${production ? "" : " ws: wss:"}`,
    "frame-src https://www.mercadopago.com.br", "worker-src 'self' blob:",
    ...(production ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  if (api || !path.includes(".")) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
