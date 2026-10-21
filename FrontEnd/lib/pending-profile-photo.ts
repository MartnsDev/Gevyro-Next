/** Foto opcional aguarda confirmação de e-mail. Nunca armazena senha ou token. */
const DB = "gevyro-next-pending-profile";
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("photos");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error(
          "Não foi possível preparar a foto. Tente novamente ou cadastre sem foto e envie pelo perfil.",
        ),
      );
  });
}
export async function savePendingPhoto(email: string, file?: File) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024)
    throw new Error("A foto deve ter no máximo 5 MB.");
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("photos", "readwrite");
      tx.objectStore("photos").put(
        { file, expires: Date.now() + 24 * 60 * 60 * 1000 },
        email.trim().toLowerCase(),
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function uploadPendingPhoto(email: string): Promise<void> {
  if (!("indexedDB" in window)) return;
  const db = await database();
  const key = email.trim().toLowerCase();
  try {
    const pending = await new Promise<
      { file: File; expires: number } | undefined
    >((resolve, reject) => {
      const request = db.transaction("photos").objectStore("photos").get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!pending) return;
    if (pending.expires > Date.now()) {
      const body = new FormData();
      body.append("foto", pending.file);
      const response = await fetch("/api/v1/configuracoes/perfil/foto", {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      if (!response.ok)
        throw new Error(
          "Sua sessão foi autenticada, mas a foto ainda não pôde ser enviada. Ela foi mantida para uma nova tentativa.",
        );
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("photos", "readwrite");
      tx.objectStore("photos").delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
