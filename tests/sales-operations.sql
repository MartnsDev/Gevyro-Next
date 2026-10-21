reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select public.cash_write(null,jsonb_build_object('empresaId',(select id from public.empresas where nome_fantasia='Empresa Nova'),'saldoInicial','1.1234'));
do $$ declare body jsonb;v jsonb;replay jsonb;stock int;begin
 body=jsonb_build_object('idCaixa',(select id from public.caixas where aberto),'formaPagamento','DINHEIRO','formaPagamento2','PIX','valorPagamento2','0.20','desconto','0.10','valorRecebido','1.00',
 'itens',jsonb_build_array(jsonb_build_object('idProduto',1,'quantidade',2),jsonb_build_object('idProduto',1,'quantidade',1)));
 v=public.sale_register(body,'00000000-0000-0000-0000-000000000101');
 if (v->>'valorTotal')::numeric<>0.90 or (v->>'valorFinal')::numeric<>0.80 or (v->>'troco')::numeric<>0.20 then raise exception 'Cálculo financeiro incorreto';end if;
 if jsonb_array_length(v->'itens')<>2 then raise exception 'Linhas de itens não preservadas';end if;
 replay=public.sale_register(body,'00000000-0000-0000-0000-000000000101');
 if replay->>'id'<>v->>'id' or (select count(*) from public.vendas)<>1 or (select quantidade_estoque from public.produto where id=1)<>2 then raise exception 'Venda duplicada';end if;
 begin
  perform public.sale_register(body||'{"desconto":"0.15"}','00000000-0000-0000-0000-000000000101');raise exception 'Payload divergente aceito';
 exception when sqlstate 'PT409' then null;end;
 begin
  perform public.sale_register(body||'{"desconto":"0.90"}','00000000-0000-0000-0000-000000000102');raise exception 'Desconto inválido aceito';
 exception when sqlstate 'PT400' then null;end;
 if (select quantidade_estoque from public.produto where id=1)<>2 then raise exception 'Falha modificou estoque';end if;
 perform public.sale_change((v->>'id')::bigint,false,'Observação posterior');
 perform public.sale_change((v->>'id')::bigint,true,'Cancelamento de teste');
 if (select quantidade_estoque from public.produto where id=1)<>5 or (select total_vendas from public.caixas where aberto)<>0 then raise exception 'Cancelamento inconsistente';end if;
 begin
  perform public.sale_change((v->>'id')::bigint,true,'Cancelamento repetido');raise exception 'Cancelamento duplicado';
 exception when sqlstate 'PT400' then null;end;
 if (select quantidade_estoque from public.produto where id=1)<>5 then raise exception 'Estoque devolvido duas vezes';end if;
 perform public.product_write(1,'{}',true);
 if not exists(select 1 from public.produto where id=1 and not ativo) then raise exception 'Produto vendido foi apagado';end if;
end $$;
select public.cash_write((select id from public.caixas where aberto),'{"saldoFinal":"1.1234"}');
do $$ begin
 if (select total_vendas from public.caixas order by id desc limit 1)<>0 then raise exception 'Fechamento reintroduziu venda cancelada';end if;
 begin
  perform public.cash_close_expired();raise exception 'Agendador acessível ao cliente';
 exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$ begin
 if exists(select 1 from public.vendas) or exists(select 1 from public.itens_venda) or exists(select 1 from public.caixas) then raise exception 'Operações financeiras expostas entre empresas';end if;
 begin
  perform public.sale_read(1);raise exception 'Consulta IDOR autorizada';
 exception when sqlstate 'PT404' then null;end;
end $$;
reset role;
\echo 'PASS: venda atômica, pagamento misto, desconto/troco, idempotência, cancelamento e caixa.'
