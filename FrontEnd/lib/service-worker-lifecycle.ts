const RELOAD_KEY = "gevyro-next:worker-cleanup-reload";

function applicationWorker(worker: ServiceWorker | null): boolean {
  if (!worker) return false;
  const url = new URL(worker.scriptURL);
  return url.origin === window.location.origin && url.pathname === "/sw.js";
}

/** unregister não remove o controller da página já aberta: ela precisa navegar. */
export async function removeDevelopmentWorker(): Promise<void> {
  const controlled = applicationWorker(navigator.serviceWorker.controller);
  const registrations = await navigator.serviceWorker.getRegistrations();
  const removed = await Promise.all(
    registrations
      .filter((registration) =>
        [
          registration.active,
          registration.waiting,
          registration.installing,
        ].some(applicationWorker),
      )
      .map((registration) => registration.unregister()),
  );

  if (!controlled) {
    sessionStorage.removeItem(RELOAD_KEY);
    return;
  }
  // Uma única navegação por sessão evita loop caso o navegador mantenha o controller.
  if (removed.some(Boolean) && sessionStorage.getItem(RELOAD_KEY) !== "true") {
    sessionStorage.setItem(RELOAD_KEY, "true");
    window.location.reload();
  }
}
