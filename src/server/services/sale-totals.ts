import { cents, decimal } from "./money";

export const paymentMethods = ["DINHEIRO", "PIX", "CARTAO_DEBITO", "CARTAO_CREDITO", "BOLETO", "TRANSFERENCIA", "OUTRO"] as const;
type PaymentMethod = typeof paymentMethods[number];

/** Apenas snapshots autorizados e carregados do banco podem fornecer preços. */
export interface SaleTotalsInput {
  items: ReadonlyArray<{ unitPrice: string; quantity: number }>;
  paymentMethod: PaymentMethod;
  secondPaymentMethod?: PaymentMethod;
  secondPaymentAmount?: string;
  discount?: string;
  received?: string;
}

/** Equivalência dos cálculos de VendaServiceImpl.registrarVenda + validações do DTO.
 * Não registra venda, não autoriza acesso e não substitui uma transação no banco.
 */
export function calculateSaleTotals(input: SaleTotalsInput) {
  if (!input.items.length) throw new Error("Nenhum item enviado");
  if (!paymentMethods.includes(input.paymentMethod)) throw new Error("Forma de pagamento inválida");
  let total = 0n;
  for (const item of input.items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 2147483647) {
      throw new Error("Quantidade inválida");
    }
    const price = cents(item.unitPrice);
    if (price < 0n) throw new Error("Preço de venda não pode ser negativo");
    total += price * BigInt(item.quantity);
  }
  if (total <= 0n) throw new Error("A venda precisa ter valor maior que zero.");
  const discount = cents(input.discount ?? "0");
  if (discount < 0n) throw new Error("Desconto não pode ser negativo");
  if (discount >= total) throw new Error("O desconto deve ser menor que o subtotal da venda.");
  const final = total - discount;
  const second = cents(input.secondPaymentAmount ?? "0");
  if (input.secondPaymentMethod !== undefined) {
    if (!paymentMethods.includes(input.secondPaymentMethod)) throw new Error("Forma de pagamento inválida");
    if (input.secondPaymentMethod === input.paymentMethod) throw new Error("As formas do pagamento dividido devem ser diferentes.");
    if (second <= 0n || second >= final) throw new Error("O segundo pagamento deve ser maior que zero e menor que o total da venda.");
  } else if (second !== 0n) {
    throw new Error("Informe a segunda forma de pagamento para o valor dividido.");
  }
  const received = input.received === undefined ? 0n : cents(input.received);
  // O Java calcula o troco sobre o valor final completo, inclusive no pagamento
  // misto e sem restringir a DINHEIRO. Preservar até decisão explícita do produto.
  return {
    total: decimal(total), discount: decimal(discount), final: decimal(final),
    received: received > 0n ? decimal(received) : null,
    change: received > 0n ? decimal(received > final ? received - final : 0n) : null,
  };
}
