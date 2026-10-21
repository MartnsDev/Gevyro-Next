/** Uma tentativa sem confirmação conserva sua chave mesmo após recarregar/fechar a aba. */
const active = new Map<string, Promise<Response>>();
export async function fetchIdempotentSale(
  url: string,
  options: RequestInit,
): Promise<Response> {
  if (typeof options.body !== "string")
    throw new Error("Formato de venda inválido.");
  const suppliedKey = new Headers(options.headers).get("Idempotency-Key");
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${suppliedKey ?? ""}\n${options.body}`),
  );
  const fingerprint = Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const storageKey = `gevyro-next:sale-pending:${fingerprint}`;
  const existing = active.get(storageKey);
  if (existing) return (await existing).clone();
  const key =
    suppliedKey ?? localStorage.getItem(storageKey) ?? crypto.randomUUID();
  localStorage.setItem(storageKey, key);
  const pending = (async () => {
    const headers = new Headers(options.headers);
    headers.set("Idempotency-Key", key);
    const response = await fetch(url, { ...options, headers });
    if (response.ok) {
      const confirmed = await response.clone().json();
      if (confirmed && Number.isSafeInteger(confirmed.id) && confirmed.id > 0)
        localStorage.removeItem(storageKey);
    }
    return response;
  })();
  active.set(storageKey, pending);
  try {
    return (await pending).clone();
  } finally {
    active.delete(storageKey);
  }
}
