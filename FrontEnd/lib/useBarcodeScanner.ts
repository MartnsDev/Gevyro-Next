import { useEffect, useRef } from "react";

type BarcodeScannerOptions = {
  enabled?: boolean;
  onScan: (codigo: string) => void;
  minLength?: number;
  timeoutMs?: number;
  maxInterKeyDelayMs?: number;
};

const EDITABLE = "input, textarea, select, [contenteditable=\"true\"]";

/** Captura leitores HID como uma sequência de teclado, sem manter input oculto focado. */
export function useBarcodeScanner({
  enabled = true,
  onScan,
  minLength = 3,
  timeoutMs = 180,
  maxInterKeyDelayMs = 80,
}: BarcodeScannerOptions) {
  const callback = useRef(onScan);
  const buffer = useRef("");
  const lastAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capturingSearch = useRef(false);
  const searchTarget = useRef<HTMLInputElement | null>(null);

  useEffect(() => { callback.current = onScan; }, [onScan]);

  useEffect(() => {
    if (!enabled) return;
    const clear = () => {
      buffer.current = "";
      lastAt.current = 0;
      capturingSearch.current = false;
      searchTarget.current = null;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
    const emit = () => {
      const codigo = buffer.current.trim();
      if (capturingSearch.current && searchTarget.current) {
        searchTarget.current.value = "";
        searchTarget.current.dispatchEvent(new Event("input", { bubbles: true }));
      }
      clear();
      if (codigo.length >= minLength) callback.current(codigo);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const isSearchField = target?.getAttribute("data-barcode-search") === "true";
      if (target?.matches(EDITABLE) && !isSearchField) return;
      const now = performance.now();
      if (event.key === "Enter") {
        if (buffer.current.length >= minLength) {
          event.preventDefault();
          event.stopPropagation();
          emit();
        } else clear();
        return;
      }
      if (event.key.length !== 1) return;
      if (lastAt.current && now - lastAt.current > maxInterKeyDelayMs) clear();
      if (isSearchField && buffer.current && !capturingSearch.current) {
        // O primeiro caractere já pode ter entrado no input. Ao confirmar
        // uma sequência rápida, limpamos o campo e assumimos a leitura HID.
        capturingSearch.current = true;
        searchTarget.current = target as HTMLInputElement;
        event.preventDefault();
        event.stopPropagation();
        searchTarget.current.value = "";
        searchTarget.current.dispatchEvent(new Event("input", { bubbles: true }));
      } else if (isSearchField && capturingSearch.current) {
        event.preventDefault();
        event.stopPropagation();
      }
      buffer.current += event.key;
      lastAt.current = now;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(emit, timeoutMs);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => { window.removeEventListener("keydown", onKeyDown, true); clear(); };
  }, [enabled, minLength, timeoutMs, maxInterKeyDelayMs]);
}
