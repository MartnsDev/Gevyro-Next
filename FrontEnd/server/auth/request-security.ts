/** Cookies de sessão exigem origem confiável nas mutações, inclusive login/logout. */
export function applicationOrigin(request: Request): string {
  if (process.env.NODE_ENV === "production") {
    const configured = process.env.NEXT_PUBLIC_APP_URL;
    if (!configured) throw new Error("APP_ORIGIN_NOT_CONFIGURED");
    return new URL(configured).origin;
  }
  return new URL(request.url).origin;
}

export function isSameOriginMutation(request: Request): boolean {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return (
    origin === applicationOrigin(request) &&
    (!fetchSite || fetchSite === "same-origin")
  );
}
