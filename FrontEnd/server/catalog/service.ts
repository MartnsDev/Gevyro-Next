import { z } from "zod";
export const idInput = z.coerce
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
const text = (length: number) => z.string().max(length).nullish();
const money = z
  .union([z.string(), z.number().finite()])
  .transform(String)
  .refine(
    (value) => /^\d{1,8}(?:\.\d{1,2})?$/.test(value),
    "Use valor não negativo com até duas casas decimais",
  );
export const productInput = z
  .object({
    empresaId: idInput.optional(),
    nome: z.string().trim().min(1).max(120),
    categoria: text(80),
    descricao: text(500),
    unidade: text(60),
    codigoBarras: text(60),
    preco: money,
    precoCusto: money.nullish(),
    quantidadeEstoque: z.number().int().min(0).max(2147483647),
    estoqueMinimo: z.number().int().min(0).max(2147483647).optional(),
    ativo: z.boolean().optional(),
  })
  .strict();
export const customerInput = z
  .object({
    empresaId: idInput.optional(),
    nome: text(255),
    email: z
      .union([z.string().trim().email().max(254), z.literal("")])
      .nullish(),
    telefone: text(30),
    cpf: text(14),
    cnpj: text(18),
    contato: text(255),
    observacoes: text(1000),
    tipo: z
      .string()
      .toUpperCase()
      .pipe(z.enum(["CLIENTE", "FORNECEDOR"]))
      .optional(),
  })
  .strict();
export const productColumns =
  "id,empresa_id,usuario_id,nome,categoria,descricao,unidade,codigo_barras,preco,preco_custo,lucro_unitario,margem_lucro,quantidade_estoque,estoque_minimo,ativo,data_criacao";
export const customerColumns =
  "id,empresa_id,nome,email,telefone,cpf,cnpj,contato,observacoes,tipo,ativo";
export function productResponse(p: Record<string, any>) {
  return {
    id: p.id,
    empresaId: p.empresa_id,
    nome: p.nome,
    categoria: p.categoria,
    descricao: p.descricao,
    unidade: p.unidade,
    codigoBarras: p.codigo_barras,
    preco: p.preco,
    precoCusto: p.preco_custo,
    lucroUnitario: p.lucro_unitario,
    margemLucro: p.margem_lucro,
    usuarioId: p.usuario_id,
    quantidadeEstoque: p.quantidade_estoque,
    estoqueMinimo: p.estoque_minimo,
    ativo: p.ativo,
    dataCriacao: p.data_criacao,
  };
}
export function customerResponse(c: Record<string, any>) {
  const { empresa_id, ...fields } = c;
  return { ...fields, empresaId: empresa_id };
}
