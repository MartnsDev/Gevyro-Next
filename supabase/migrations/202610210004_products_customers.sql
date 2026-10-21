begin;
alter table public.auditoria add column detalhes jsonb not null default '{}';
create function public.require_company(p_id bigint,p_active boolean default true) returns public.empresas
language plpgsql security definer set search_path='' as $$
declare e public.empresas;
begin
 select * into e from public.empresas where id=p_id and dono_id=auth.uid();
 if not found then raise exception using errcode='PT404',message='Empresa não encontrada';end if;
 if p_active and not e.ativa then raise exception using errcode='PT409',message='Esta empresa está arquivada';end if;
 return e;
end $$;
revoke all on function public.require_company(bigint,boolean) from public,anon,authenticated;

create table public.produto (
 id bigint generated always as identity primary key,
 empresa_id bigint not null references public.empresas(id),
 usuario_id bigint not null references public.usuarios(id),
 nome varchar(120) not null check(length(trim(nome))>0),categoria varchar(80),descricao varchar(500),unidade varchar(60),codigo_barras varchar(60),
 preco numeric(10,2) not null check(preco>=0),preco_custo numeric(10,2) check(preco_custo>=0),
 lucro_unitario numeric(10,2) generated always as (preco-preco_custo) stored,
 margem_lucro numeric generated always as (round(round((preco-preco_custo)/nullif(preco,0),4)*100,2)) stored,
 quantidade_estoque integer not null check(quantidade_estoque>=0),estoque_minimo integer not null default 0 check(estoque_minimo>=0),
 ativo boolean not null default true,data_criacao timestamptz not null default now(),
 unique(id,empresa_id),unique(empresa_id,codigo_barras)
);
create index produto_company_name on public.produto(empresa_id,nome,id);
create index produto_company_active on public.produto(empresa_id,ativo,id);
create table public.estoque_movimentacoes (
 id bigint generated always as identity primary key,empresa_id bigint not null references public.empresas(id),
 produto_id bigint references public.produto(id) on delete set null,usuario_id uuid not null references auth.users(id),
 quantidade integer not null,saldo integer not null check(saldo>=0),origem text not null,criado_em timestamptz not null default now()
);
create index estoque_mov_company_date on public.estoque_movimentacoes(empresa_id,criado_em desc,id);
create table public.clientes (
 id bigint generated always as identity primary key,empresa_id bigint not null references public.empresas(id),usuario_id bigint not null references public.usuarios(id),
 nome varchar(255) not null,email varchar(254),telefone varchar(30),cpf varchar(14),cnpj varchar(18),contato varchar(255),observacoes varchar(1000),
 ativo boolean not null default true,tipo text not null default 'CLIENTE' check(tipo in ('CLIENTE','FORNECEDOR')),
 unique(id,empresa_id)
);
create unique index clientes_unique_active_email on public.clientes(empresa_id,tipo,lower(email)) where ativo and email is not null;
create index clientes_company_active_name on public.clientes(empresa_id,ativo,tipo,nome,id);
alter table public.produto enable row level security;
alter table public.clientes enable row level security;
alter table public.estoque_movimentacoes enable row level security;
create policy produto_owner on public.produto for select to authenticated using(exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=(select auth.uid())));
create policy clientes_owner on public.clientes for select to authenticated using(exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=(select auth.uid())));
create policy estoque_owner on public.estoque_movimentacoes for select to authenticated using(exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=(select auth.uid())));
revoke all on public.produto,public.clientes,public.estoque_movimentacoes from anon,authenticated;
grant select on public.produto,public.clientes,public.estoque_movimentacoes to authenticated;

create function public.product_write(p_id bigint,p_body jsonb,p_delete boolean default false) returns public.produto
language plpgsql security definer set search_path='' as $$
declare u public.usuarios;e public.empresas;p public.produto;old_stock int;limite int;total bigint;linked boolean=false;dest bigint;stock int;price numeric;
begin
 u=public.require_active_profile();
 if p_id is not null then
   select * into p from public.produto where id=p_id for update;
   if not found or p.usuario_id<>u.id then raise exception using errcode='PT404',message='Produto não encontrado';end if;
 end if;
 if p_delete then
   if p_id is null then raise exception using errcode='PT400',message='Informe o produto';end if;
   if to_regclass('public.itens_venda') is not null then
     select exists(select 1 from public.itens_venda where produto_id=p_id) into linked;
   end if;
   if linked then update public.produto set ativo=false where id=p_id returning * into p;
   else delete from public.produto where id=p_id;end if;
   insert into public.auditoria(usuario_id,empresa_id,operacao,detalhes) values(u.auth_user_id,p.empresa_id,'PRODUTO_EXCLUIDO',jsonb_build_object('produtoId',p_id,'arquivado',linked));
   return p;
 end if;
 dest=coalesce((p_body->>'empresaId')::bigint,p.empresa_id);e=public.require_company(dest,true);
 if p_body->>'nome' is null or trim(p_body->>'nome')='' then raise exception using errcode='PT400',message='Nome é obrigatório';end if;
 stock=(p_body->>'quantidadeEstoque')::int;price=(p_body->>'preco')::numeric;
 if stock is null or price is null or stock<0 or price<0 then raise exception using errcode='PT400',message='Preço e estoque são obrigatórios e não negativos';end if;
 if scale(price)>2 or scale((p_body->>'precoCusto')::numeric)>2 then raise exception using errcode='PT400',message='Use valores com até duas casas decimais';end if;
 limite=case u.tipo_plano when 'EXPERIMENTAL' then 300 when 'BASICO' then 500 else 999999 end;
 if p_id is null or (coalesce((p_body->>'ativo')::boolean,true) and (not p.ativo or dest<>p.empresa_id)) then
   select count(*) into total from public.produto where empresa_id=dest and ativo;
   if limite<999999 and total>=limite then raise exception using errcode='PT403',message='Limite de produtos atingido para o plano';end if;
 end if;
 old_stock=coalesce(p.quantidade_estoque,0);
 if p_id is null then
   insert into public.produto(empresa_id,usuario_id,nome,preco,quantidade_estoque)
   values(dest,u.id,p_body->>'nome',price,stock) returning * into p;
 end if;
 update public.produto set empresa_id=dest,nome=p_body->>'nome',categoria=p_body->>'categoria',descricao=p_body->>'descricao',unidade=p_body->>'unidade',
 codigo_barras=nullif(trim(p_body->>'codigoBarras'),''),preco=price,preco_custo=(p_body->>'precoCusto')::numeric,
 quantidade_estoque=stock,estoque_minimo=coalesce((p_body->>'estoqueMinimo')::int,0),ativo=coalesce((p_body->>'ativo')::boolean,true)
 where id=p.id returning * into p;
 if stock<>old_stock then insert into public.estoque_movimentacoes(empresa_id,produto_id,usuario_id,quantidade,saldo,origem)
 values(dest,p.id,u.auth_user_id,stock-old_stock,stock,case when p_id is null then 'CADASTRO' else 'AJUSTE' end);end if;
 insert into public.auditoria(usuario_id,empresa_id,operacao,detalhes) values(u.auth_user_id,dest,case when p_id is null then 'PRODUTO_CRIADO' else 'PRODUTO_ATUALIZADO' end,jsonb_build_object('produtoId',p.id));
 return p;
end $$;
revoke all on function public.product_write(bigint,jsonb,boolean) from public,anon;
grant execute on function public.product_write(bigint,jsonb,boolean) to authenticated;

create function public.customer_write(p_id bigint,p_body jsonb,p_delete boolean default false) returns public.clientes
language plpgsql security definer set search_path='' as $$
declare u public.usuarios;c public.clientes;kind text;mail text;e public.empresas;
begin
 u=public.require_active_profile();
 if p_id is not null then
   select * into c from public.clientes where id=p_id for update;
   if not found or c.usuario_id<>u.id then raise exception using errcode='PT404',message='Cliente não encontrado';end if;
 end if;
 if p_delete then
   if p_id is null then raise exception using errcode='PT400',message='Informe o cliente';end if;
   update public.clientes set ativo=false where id=c.id returning * into c;
 else
   if p_id is null then
     if p_body->>'nome' is null or trim(p_body->>'nome')='' then raise exception using errcode='PT400',message='Nome é obrigatório';end if;
     e=public.require_company((p_body->>'empresaId')::bigint,false);
     insert into public.clientes(empresa_id,usuario_id,nome) values(e.id,u.id,p_body->>'nome') returning * into c;
   end if;
   kind=coalesce(nullif(upper(p_body->>'tipo'),''),c.tipo);
   mail=case when p_body->>'email' is null then c.email else nullif(lower(trim(p_body->>'email')),'') end;
   if mail is not null and mail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception using errcode='PT400',message='E-mail inválido';end if;
   update public.clientes set nome=coalesce(p_body->>'nome',c.nome),email=mail,telefone=coalesce(p_body->>'telefone',c.telefone),
     cpf=coalesce(p_body->>'cpf',c.cpf),cnpj=coalesce(p_body->>'cnpj',c.cnpj),contato=coalesce(p_body->>'contato',c.contato),
     observacoes=coalesce(p_body->>'observacoes',c.observacoes),tipo=kind where id=c.id returning * into c;
 end if;
 insert into public.auditoria(usuario_id,empresa_id,operacao,detalhes) values(u.auth_user_id,c.empresa_id,case when p_delete then 'CLIENTE_ARQUIVADO' when p_id is null then 'CLIENTE_CRIADO' else 'CLIENTE_ATUALIZADO' end,jsonb_build_object('clienteId',c.id));
 return c;
end $$;
revoke all on function public.customer_write(bigint,jsonb,boolean) from public,anon;
grant execute on function public.customer_write(bigint,jsonb,boolean) to authenticated;
commit;
