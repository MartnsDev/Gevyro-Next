reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select public.product_write(null,jsonb_build_object('empresaId',(select id from public.empresas where nome_fantasia='Empresa Nova'),'nome','Produto Teste','preco','0.30','precoCusto','0.10','quantidadeEstoque',5,'codigoBarras',' 000123 '));
do $$ declare p public.produto; begin
  select * into p from public.produto where nome='Produto Teste';
  if p.codigo_barras<>'000123' or p.lucro_unitario<>0.20 or p.margem_lucro<>66.67 then raise exception 'Contrato de produto incorreto';end if;
  begin
    perform public.product_write(null,jsonb_build_object('empresaId',p.empresa_id,'nome','Duplicado','preco','1.00','quantidadeEstoque',1,'codigoBarras','000123'));
    raise exception 'Código duplicado autorizado';
  exception when unique_violation then null;end;
  if (select count(*) from public.produto)<>1 then raise exception 'Falha não foi atômica';end if;
  if (select count(*) from public.estoque_movimentacoes)<>1 then raise exception 'Movimentação inconsistente';end if;
  begin
    perform public.product_write(p.id,jsonb_build_object('empresaId',2,'nome','Invasão','preco','1.00','quantidadeEstoque',1));
    raise exception 'Mudança entre empresas autorizada';
  exception when sqlstate 'PT404' then null;end;
end $$;
select public.customer_write(null,jsonb_build_object('empresaId',(select id from public.empresas where nome_fantasia='Empresa Nova'),'nome','Contato Teste','email','TEST@example.invalid','tipo','CLIENTE'));
select public.customer_write(null,jsonb_build_object('empresaId',(select id from public.empresas where nome_fantasia='Empresa Nova'),'nome','Fornecedor Teste','email','test@example.invalid','tipo','FORNECEDOR','contato','Contato','cnpj','Documento de teste'));
do $$ begin
 if (select count(*) from public.clientes)<>2 then raise exception 'Tipos cliente/fornecedor não preservados';end if;
 begin
  perform public.customer_write(null,jsonb_build_object('empresaId',(select id from public.empresas where nome_fantasia='Empresa Nova'),'nome','Duplicado','email','test@example.invalid','tipo','CLIENTE'));
  raise exception 'E-mail duplicado autorizado';
 exception when unique_violation then null;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$ begin
 if exists(select 1 from public.produto) or exists(select 1 from public.clientes) or exists(select 1 from public.estoque_movimentacoes) then raise exception 'Dados entre empresas expostos';end if;
 begin
  perform public.product_write(1,'{}',true);raise exception 'Exclusão IDOR autorizada';
 exception when sqlstate 'PT404' then null;end;
end $$;
reset role;
\echo 'PASS: catálogo, margem decimal, código único, rollback, clientes/fornecedores e isolamento.'
