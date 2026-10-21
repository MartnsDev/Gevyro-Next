self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Sem interceptação de fetch: o navegador faz as requisições diretamente.
// O worker não mantém cache nem transforma falhas de rede em respostas válidas.
// A sincronização offline será implementada com confirmação explícita do servidor.
