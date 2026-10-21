begin;
create table public.caixas (
 id bigint generated always as identity primary key,empresa_id bigint not null references public.empresas(id),usuario_id bigint not null references public.usuarios(id),
 valor_inicial numeric(19,4) not null check(valor_inicial>=0),valor_final numeric(19,4),total_vendas numeric(19,4) not null default 0,
 data_abertura timestamptz not null default now(),data_fechamento timestamptz,status text not null default 'ABERTO' check(status in ('ABERTO','FECHADO')),
 aberto boolean not null default true,terminal_id text,aberto_por text,fechado_por text,version bigint not null default 0,
 unique(id,empresa_id),check(aberto=(status='ABERTO'))
);
create unique index caixas_one_open_company on public.caixas(empresa_id) where aberto;
create index caixas_company_date on public.caixas(empresa_id,data_abertura desc,id);
create table public.vendas (
 id bigint generated always as identity primary key,empresa_id bigint not null references public.empresas(id),usuario_id bigint not null references public.usuarios(id),
 caixa_id bigint not null,cliente_id bigint,total numeric(38,2) not null check(total>0),desconto numeric(38,2) not null default 0 check(desconto>=0 and desconto<total),
 valor_final numeric(38,2) generated always as (total-desconto) stored,valor_recebido numeric(38,2),troco numeric(38,2),
 forma_pagamento text not null check(forma_pagamento in ('DINHEIRO','PIX','CARTAO_DEBITO','CARTAO_CREDITO','BOLETO','TRANSFERENCIA','OUTRO')),
 forma_pagamento2 text check(forma_pagamento2 in ('DINHEIRO','PIX','CARTAO_DEBITO','CARTAO_CREDITO','BOLETO','TRANSFERENCIA','OUTRO')),valor_pagamento2 numeric(38,2),
 observacao varchar(500),data_venda timestamptz not null default now(),cancelada boolean not null default false,data_cancelamento timestamptz,motivo_cancelamento text,
 unique(id,empresa_id),foreign key(caixa_id,empresa_id) references public.caixas(id,empresa_id),foreign key(cliente_id,empresa_id) references public.clientes(id,empresa_id)
);
create index vendas_company_date on public.vendas(empresa_id,data_venda desc,id);
create index vendas_cash on public.vendas(caixa_id,id desc);
create table public.itens_venda (
 id bigint generated always as identity primary key,empresa_id bigint not null,venda_id bigint not null,produto_id bigint not null,
 quantidade integer not null check(quantidade>0),preco_unitario numeric(10,2) not null check(preco_unitario>=0),subtotal numeric(38,2) generated always as (preco_unitario*quantidade) stored,
 foreign key(venda_id,empresa_id) references public.vendas(id,empresa_id),foreign key(produto_id,empresa_id) references public.produto(id,empresa_id)
);
create index itens_venda_sale on public.itens_venda(venda_id,id);
create index itens_venda_product on public.itens_venda(produto_id);
create table public.vendas_idempotencia (
 usuario_id uuid not null references auth.users(id),chave uuid not null,payload_hash bytea not null,venda_id bigint not null references public.vendas(id),
 criado_em timestamptz not null default now(),primary key(usuario_id,chave)
);
alter table public.caixas enable row level security;
alter table public.vendas enable row level security;
alter table public.itens_venda enable row level security;
alter table public.vendas_idempotencia enable row level security;
create policy caixas_owner on public.caixas for select to authenticated using(exists(select 1 from public.usuarios u where u.id=usuario_id and u.auth_user_id=(select auth.uid())));
create policy vendas_owner on public.vendas for select to authenticated using(exists(select 1 from public.usuarios u where u.id=usuario_id and u.auth_user_id=(select auth.uid())));
create policy itens_owner on public.itens_venda for select to authenticated using(exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=(select auth.uid())));
revoke all on public.caixas,public.vendas,public.itens_venda,public.vendas_idempotencia from anon,authenticated;
grant select on public.caixas,public.vendas,public.itens_venda to authenticated;

create function public.sale_json(p_id bigint) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',v.id,'emailUsuario',a.email,'idCaixa',v.caixa_id,'nomeCliente',c.nome,
 'valorTotal',v.total,'desconto',v.desconto,'valorFinal',v.valor_final,'valorRecebido',v.valor_recebido,'troco',v.troco,
 'formaPagamento',v.forma_pagamento,'formaPagamento2',v.forma_pagamento2,'valorPagamento2',v.valor_pagamento2,
 'observacao',v.observacao,'dataVenda',v.data_venda,'cancelada',v.cancelada,'dataCancelamento',v.data_cancelamento,'motivoCancelamento',v.motivo_cancelamento,
 'itens',coalesce((select jsonb_agg(jsonb_build_object('idProduto',i.produto_id,'nomeProduto',p.nome,'quantidade',i.quantidade,'precoUnitario',i.preco_unitario,'subtotal',i.subtotal) order by i.id)
 from public.itens_venda i join public.produto p on p.id=i.produto_id where i.venda_id=v.id),'[]'))
 from public.vendas v join public.usuarios u on u.id=v.usuario_id join auth.users a on a.id=u.auth_user_id left join public.clientes c on c.id=v.cliente_id where v.id=p_id;
$$;
revoke all on function public.sale_json(bigint) from public,anon,authenticated;

create function public.cash_write(p_id bigint,p_body jsonb) returns public.caixas
language plpgsql security definer set search_path='' as $$
declare u public.usuarios;e public.empresas;c public.caixas;initial numeric;final numeric;
begin
 u=public.require_active_profile();
 if p_id is null then
  e=public.require_company((p_body->>'empresaId')::bigint,true);
  perform 1 from public.empresas where id=e.id for update;
  if exists(select 1 from public.caixas where empresa_id=e.id and aberto) then raise exception using errcode='PT400',message='Já existe um caixa aberto para esta empresa';end if;
  initial=(p_body->>'saldoInicial')::numeric;
  if initial is null or initial<0 or scale(initial)>4 then raise exception using errcode='PT400',message='Saldo inicial inválido';end if;
  insert into public.caixas(empresa_id,usuario_id,valor_inicial,terminal_id,aberto_por)
  values(e.id,u.id,initial,p_body->>'terminalId',u.nome) returning * into c;
 else
  select * into c from public.caixas where id=p_id and usuario_id=u.id for update;
  if not found then raise exception using errcode='PT404',message='Caixa não encontrado';end if;
  if not c.aberto then raise exception using errcode='PT400',message='Este caixa já está fechado';end if;
  final=(p_body->>'saldoFinal')::numeric;
  if final is null or scale(final)>4 then raise exception using errcode='PT400',message='Saldo final inválido';end if;
  update public.caixas set total_vendas=(select coalesce(sum(valor_final),0) from public.vendas where caixa_id=p_id and not cancelada),
  valor_final=final,data_fechamento=now(),status='FECHADO',aberto=false,fechado_por=u.nome,version=version+1 where id=c.id returning * into c;
 end if;
 insert into public.auditoria(usuario_id,empresa_id,operacao,detalhes) values(u.auth_user_id,c.empresa_id,case when p_id is null then 'CAIXA_ABERTO' else 'CAIXA_FECHADO' end,jsonb_build_object('caixaId',c.id));
 return c;
end $$;
revoke all on function public.cash_write(bigint,jsonb) from public,anon;
grant execute on function public.cash_write(bigint,jsonb) to authenticated;

create function public.sale_register(p_body jsonb,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u public.usuarios;c public.caixas;v public.vendas;p public.produto;line record;item jsonb;existing public.vendas_idempotencia;
 total numeric=0;discount numeric;final numeric;second numeric;received numeric;method text;method2 text;hash bytea;
begin
 if p_key is null then raise exception using errcode='PT400',message='Chave de idempotência obrigatória';end if;
 u=public.require_active_profile();hash=sha256(convert_to(p_body::text,'UTF8'));
 select * into existing from public.vendas_idempotencia where usuario_id=u.auth_user_id and chave=p_key;
 if found then
  if existing.payload_hash<>hash then raise exception using errcode='PT409',message='A chave já foi usada em outra venda';end if;
  return public.sale_json(existing.venda_id);
 end if;
 select * into c from public.caixas where id=(p_body->>'idCaixa')::bigint and usuario_id=u.id for update;
 if not found then raise exception using errcode='PT404',message='Caixa não encontrado';end if;
 perform public.require_company(c.empresa_id,true);
 if not c.aberto then raise exception using errcode='PT400',message='O caixa está fechado';end if;
 if p_body->>'idCliente' is not null and not exists(select 1 from public.clientes where id=(p_body->>'idCliente')::bigint and empresa_id=c.empresa_id) then
  raise exception using errcode='PT400',message='Cliente não pertence à empresa deste caixa';end if;
 if jsonb_typeof(p_body->'itens') is distinct from 'array' or jsonb_array_length(p_body->'itens')=0 then raise exception using errcode='PT400',message='Nenhum item enviado';end if;
 if jsonb_array_length(p_body->'itens')>1000 then raise exception using errcode='PT400',message='A venda excede 1000 itens';end if;
 for item in select value from jsonb_array_elements(p_body->'itens') loop
  if (item->>'quantidade')::int is null or (item->>'quantidade')::int<1 or (item->>'idProduto')::bigint is null then raise exception using errcode='PT400',message='Item inválido';end if;
 end loop;
 -- Ordem consistente de bloqueio e agregação de linhas repetidas.
 for line in select (value->>'idProduto')::bigint id,sum((value->>'quantidade')::int) qty from jsonb_array_elements(p_body->'itens') group by 1 order by 1 loop
  select * into p from public.produto where id=line.id and empresa_id=c.empresa_id for update;
  if not found then raise exception using errcode='PT404',message='Produto não encontrado nesta empresa';end if;
  if not p.ativo then raise exception using errcode='PT409',message='Produto inativo não pode ser vendido';end if;
  if p.quantidade_estoque<line.qty then raise exception using errcode='PT400',message='Estoque insuficiente';end if;
  total=total+p.preco*line.qty;
 end loop;
 if total<=0 then raise exception using errcode='PT400',message='A venda precisa ter valor maior que zero';end if;
 discount=coalesce((p_body->>'desconto')::numeric,0);final=total-discount;
 if discount<0 or discount>=total or scale(discount)>2 then raise exception using errcode='PT400',message='Desconto inválido';end if;
 method=p_body->>'formaPagamento';method2=p_body->>'formaPagamento2';second=(p_body->>'valorPagamento2')::numeric;
 if method is null or method not in ('DINHEIRO','PIX','CARTAO_DEBITO','CARTAO_CREDITO','BOLETO','TRANSFERENCIA','OUTRO') then raise exception using errcode='PT400',message='Forma de pagamento inválida';end if;
 if method2 is not null then
  if method2=method or second is null or second<=0 or second>=final or scale(second)>2 then raise exception using errcode='PT400',message='Pagamento dividido inválido';end if;
 elsif coalesce(second,0)<>0 then raise exception using errcode='PT400',message='Informe a segunda forma de pagamento';end if;
 received=(p_body->>'valorRecebido')::numeric;
 if scale(received)>2 then raise exception using errcode='PT400',message='Valor recebido inválido';end if;
 insert into public.vendas(empresa_id,usuario_id,caixa_id,cliente_id,total,desconto,forma_pagamento,forma_pagamento2,valor_pagamento2,observacao,valor_recebido,troco)
 values(c.empresa_id,u.id,c.id,(p_body->>'idCliente')::bigint,total,discount,method,method2,second,p_body->>'observacao',case when received>0 then received else null end,case when received>0 then greatest(received-final,0) else null end) returning * into v;
 for item in select value from jsonb_array_elements(p_body->'itens') loop
  select * into p from public.produto where id=(item->>'idProduto')::bigint;
  insert into public.itens_venda(empresa_id,venda_id,produto_id,quantidade,preco_unitario) values(c.empresa_id,v.id,p.id,(item->>'quantidade')::int,p.preco);
 end loop;
 for line in select produto_id,sum(quantidade)::int qty from public.itens_venda where venda_id=v.id group by produto_id order by produto_id loop
  update public.produto set quantidade_estoque=quantidade_estoque-line.qty where id=line.produto_id returning * into p;
  insert into public.estoque_movimentacoes(empresa_id,produto_id,usuario_id,quantidade,saldo,origem) values(c.empresa_id,p.id,u.auth_user_id,-line.qty,p.quantidade_estoque,'VENDA');
 end loop;
 update public.caixas set total_vendas=total_vendas+v.valor_final,version=version+1 where id=c.id;
 insert into public.vendas_idempotencia(usuario_id,chave,payload_hash,venda_id) values(u.auth_user_id,p_key,hash,v.id);
 insert into public.auditoria(usuario_id,empresa_id,operacao,detalhes) values(u.auth_user_id,c.empresa_id,'VENDA_REGISTRADA',jsonb_build_object('vendaId',v.id,'valor',v.valor_final));
 return public.sale_json(v.id);
end $$;
revoke all on function public.sale_register(jsonb,uuid) from public,anon;
grant execute on function public.sale_register(jsonb,uuid) to authenticated;

create function public.sale_change(p_id bigint,p_cancel boolean,p_text text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u public.usuarios;v public.vendas;p public.produto;line record;cash_id bigint;
begin
 u=public.require_active_profile();
 select caixa_id into cash_id from public.vendas where id=p_id and usuario_id=u.id;
 if not found then raise exception using errcode='PT404',message='Venda não encontrada';end if;
 perform 1 from public.caixas where id=cash_id for update;
 select * into v from public.vendas where id=p_id for update;
 if p_cancel then
  if v.cancelada then raise exception using errcode='PT400',message='Venda já cancelada';end if;
  for line in select produto_id,sum(quantidade)::int qty from public.itens_venda where venda_id=v.id group by produto_id order by produto_id loop
   select * into p from public.produto where id=line.produto_id for update;
   update public.produto set quantidade_estoque=quantidade_estoque+line.qty where id=p.id returning * into p;
   insert into public.estoque_movimentacoes(empresa_id,produto_id,usuario_id,quantidade,saldo,origem) values(v.empresa_id,p.id,u.auth_user_id,line.qty,p.quantidade_estoque,'CANCELAMENTO');
  end loop;
  update public.caixas set total_vendas=greatest(total_vendas-v.valor_final,0),version=version+1 where id=cash_id;
  update public.vendas set cancelada=true,data_cancelamento=now(),motivo_cancelamento=p_text where id=v.id;
 else update public.vendas set observacao=p_text where id=v.id;end if;
 insert into public.auditoria(usuario_id,empresa_id,operacao,detalhes) values(u.auth_user_id,v.empresa_id,case when p_cancel then 'VENDA_CANCELADA' else 'VENDA_OBSERVACAO' end,jsonb_build_object('vendaId',v.id));
 return public.sale_json(v.id);
end $$;
revoke all on function public.sale_change(bigint,boolean,text) from public,anon;
grant execute on function public.sale_change(bigint,boolean,text) to authenticated;

create function public.sale_read(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_active_plan() then raise exception using errcode='PT403',message='PLANO_INATIVO';end if;
 if not exists(select 1 from public.vendas v join public.usuarios u on u.id=v.usuario_id where v.id=p_id and u.auth_user_id=auth.uid()) then raise exception using errcode='PT404',message='Venda não encontrada';end if;
 return public.sale_json(p_id);
end $$;
revoke all on function public.sale_read(bigint) from public,anon;
grant execute on function public.sale_read(bigint) to authenticated;
create function public.sale_list(p_caixa bigint,p_offset int default 0,p_limit int default 500) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_active_plan() then raise exception using errcode='PT403',message='PLANO_INATIVO';end if;
 if p_offset<0 or p_limit not between 1 and 1000 then raise exception using errcode='PT400',message='Paginação inválida';end if;
 if not exists(select 1 from public.caixas c join public.usuarios u on u.id=c.usuario_id where c.id=p_caixa and u.auth_user_id=auth.uid()) then raise exception using errcode='PT404',message='Caixa não encontrado';end if;
 return coalesce((select jsonb_agg(public.sale_json(v.id) order by v.id desc) from (select id from public.vendas where caixa_id=p_caixa order by id desc limit p_limit offset p_offset) v),'[]');
end $$;
revoke all on function public.sale_list(bigint,int,int) from public,anon;
grant execute on function public.sale_list(bigint,int,int) to authenticated;

-- O agendador é chamado apenas pelo runtime servidor, nunca por usuário/browser.
create function public.cash_close_expired() returns integer
language plpgsql security definer set search_path='' as $$
declare c public.caixas;n integer=0;owner uuid;
begin
 for c in select * from public.caixas where aberto and data_abertura<=now()-interval '24 hours' order by id for update skip locked loop
  update public.caixas set total_vendas=(select coalesce(sum(valor_final),0) from public.vendas where caixa_id=c.id and not cancelada),
   aberto=false,status='FECHADO',data_fechamento=now(),valor_final=null,fechado_por='sistema',version=version+1 where id=c.id;
  select auth_user_id into owner from public.usuarios where id=c.usuario_id;
  insert into public.auditoria(usuario_id,empresa_id,operacao,detalhes) values(owner,c.empresa_id,'CAIXA_FECHADO_AUTOMATICAMENTE',jsonb_build_object('caixaId',c.id));n=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.cash_close_expired() from public,anon,authenticated;
grant execute on function public.cash_close_expired() to service_role;
commit;
