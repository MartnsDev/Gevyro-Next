-- Normaliza códigos já existentes sem alterar zeros à esquerda.
UPDATE produto
SET codigo_barras = NULL
WHERE codigo_barras IS NOT NULL AND TRIM(codigo_barras) = '';

UPDATE produto
SET codigo_barras = TRIM(codigo_barras)
WHERE codigo_barras IS NOT NULL;

-- A unicidade por empresa também cobre produtos inativos; isso evita que um
-- código antigo seja reutilizado silenciosamente e preserva a auditoria.
CREATE UNIQUE INDEX uk_produto_empresa_codigo_barras
    ON produto (empresa_id, codigo_barras);
