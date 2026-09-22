-- Normaliza códigos já existentes sem alterar zeros à esquerda.
UPDATE produto
SET codigo_barras = NULL
WHERE codigo_barras IS NOT NULL AND TRIM(codigo_barras) = '';

UPDATE produto
SET codigo_barras = TRIM(codigo_barras)
WHERE codigo_barras IS NOT NULL;

-- A unicidade por empresa também cobre produtos inativos; isso evita que um
-- código antigo seja reutilizado silenciosamente e preserva a auditoria.
-- Se a base já contiver colisões legadas, não abortamos o deploy: criamos o
-- índice de consulta e o backend continua rejeitando novas colisões até que
-- os registros antigos sejam corrigidos de forma explícita.
SET @barcode_duplicates = (
    SELECT COUNT(*)
    FROM (
        SELECT empresa_id, codigo_barras
        FROM produto
        WHERE codigo_barras IS NOT NULL
        GROUP BY empresa_id, codigo_barras
        HAVING COUNT(*) > 1
    ) AS duplicados
);
SET @barcode_index_sql = IF(
    @barcode_duplicates = 0,
    'CREATE UNIQUE INDEX uk_produto_empresa_codigo_barras ON produto (empresa_id, codigo_barras)',
    'CREATE INDEX idx_produto_empresa_codigo_barras ON produto (empresa_id, codigo_barras)'
);
PREPARE barcode_index_stmt FROM @barcode_index_sql;
EXECUTE barcode_index_stmt;
DEALLOCATE PREPARE barcode_index_stmt;
