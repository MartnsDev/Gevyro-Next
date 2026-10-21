/** Valores monetários entram como decimal textual e são calculados em centavos. */
export function cents(value: string): bigint {
  if (!/^-?\d{1,24}(?:\.\d{1,2})?$/.test(value)) {
    throw new Error("Valor monetário inválido; utilize decimal com até duas casas");
  }
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  const result = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -result : result;
}

export function decimal(value: bigint): string {
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}
