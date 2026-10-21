begin;
create table public.auditoria (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references auth.users(id),
  empresa_id bigint,
  operacao text not null,
  criado_em timestamptz not null default now()
);
alter table public.auditoria enable row level security;
create policy auditoria_self on public.auditoria for select to authenticated using(usuario_id=(select auth.uid()));
revoke all on public.auditoria from anon,authenticated;
grant select on public.auditoria to authenticated;

create function public.has_active_plan() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.usuarios u where u.auth_user_id=auth.uid() and u.status_acesso='ATIVO' and
 ((u.tipo_plano='EXPERIMENTAL' and now()<=u.data_primeiro_login+interval '30 days') or
 (u.tipo_plano<>'EXPERIMENTAL' and u.data_vencimento>=(now() at time zone 'America/Sao_Paulo')::date)));
$$;
revoke all on function public.has_active_plan() from public,anon;
grant execute on function public.has_active_plan() to authenticated;

create function public.require_active_profile() returns public.usuarios
language plpgsql security definer set search_path='' as $$
declare u public.usuarios;
begin
  select * into u from public.usuarios where auth_user_id=auth.uid() for update;
  if not found then raise exception using errcode='PT401',message='NAO_AUTENTICADO'; end if;
  if u.status_acesso <> 'ATIVO' or
     (u.tipo_plano='EXPERIMENTAL' and now()>u.data_primeiro_login+interval '30 days') or
     (u.tipo_plano<>'EXPERIMENTAL' and (u.data_vencimento is null or u.data_vencimento<(now() at time zone 'America/Sao_Paulo')::date)) then
    raise exception using errcode='PT403',message='PLANO_INATIVO';
  end if;
  return u;
end;
$$;
revoke all on function public.require_active_profile() from public,anon,authenticated;

create function public.documento_valido(d text) returns boolean
language plpgsql immutable set search_path='' as $$
declare n int; s int; dig int; i int; j int; weight int;
begin
  if d is null then return true; end if;
  n=length(d);
  if d !~ '^[0-9]+$' or n not in (11,14) or d=repeat(left(d,1),n) then return false;end if;
  for j in 0..1 loop
    s=0;
    if n=11 then
      for i in 1..9+j loop s=s+substr(d,i,1)::int*(11+j-i);end loop;
      dig=(s*10)%11;if dig=10 then dig=0;end if;
      if dig<>substr(d,10+j,1)::int then return false;end if;
    else
      weight=5+j;
      for i in 1..12+j loop
        s=s+substr(d,i,1)::int*weight;weight=weight-1;if weight=1 then weight=9;end if;
      end loop;
      dig=s%11;dig=case when dig<2 then 0 else 11-dig end;
      if dig<>substr(d,13+j,1)::int then return false;end if;
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.documento_valido(text) from public,anon;

create function public.company_write(p_id bigint,p_nome text,p_documento text,p_ativo boolean,p_dados jsonb default '{}') returns public.empresas
language plpgsql security definer set search_path='' as $$
declare u public.usuarios; e public.empresas; limite int; total bigint; doc text;
begin
  u=public.require_active_profile();
  if p_nome is null or length(trim(p_nome)) not between 2 and 120 then raise exception using errcode='PT400',message='Nome fantasia deve ter entre 2 e 120 caracteres';end if;
  if length(coalesce(p_documento,''))>18 then raise exception using errcode='PT400',message='CPF/CNPJ excede o tamanho permitido';end if;
  doc=case when p_documento is null or trim(p_documento)='' then null else regexp_replace(p_documento,'[^0-9]','','g') end;
  if not public.documento_valido(doc) then raise exception using errcode='PT400',message='CPF/CNPJ inválido';end if;
  limite=case u.tipo_plano when 'EXPERIMENTAL' then 1 when 'BASICO' then 1 when 'PRO' then 5 else 99999 end;
  if p_id is null then
    -- O Java conta inclusive empresas arquivadas na criação.
    select count(*) into total from public.empresas where dono_id=u.auth_user_id;
    if total>=limite then raise exception using errcode='PT403',message='Limite de empresas atingido para o plano';end if;
    insert into public.empresas(dono_id,nome_fantasia,cnpj,tipo_plano) values(u.auth_user_id,trim(p_nome),doc,u.tipo_plano) returning * into e;
  else
    select * into e from public.empresas where id=p_id and dono_id=u.auth_user_id for update;
    if not found then raise exception using errcode='PT404',message='Empresa não encontrada';end if;
    if p_ativo is true and not e.ativa then
      select count(*) into total from public.empresas where dono_id=u.auth_user_id and ativa;
      if total>=limite then raise exception using errcode='PT403',message='Limite de empresas ativas atingido para restauração';end if;
    end if;
  end if;
  if p_id is null or doc is distinct from e.cnpj then
    e.razao_social=p_dados->>'razao_social';e.cep=p_dados->>'cep';e.logradouro=p_dados->>'logradouro';
    e.numero=p_dados->>'numero';e.bairro=p_dados->>'bairro';e.cidade=p_dados->>'cidade';e.uf=p_dados->>'uf';e.telefone=p_dados->>'telefone';
  end if;
  update public.empresas set nome_fantasia=trim(p_nome),cnpj=doc,ativa=case when p_id is null then true else coalesce(p_ativo,e.ativa) end,
    razao_social=e.razao_social,cep=e.cep,logradouro=e.logradouro,numero=e.numero,bairro=e.bairro,cidade=e.cidade,uf=e.uf,telefone=e.telefone
    where id=e.id returning * into e;
  insert into public.auditoria(usuario_id,empresa_id,operacao) values(u.auth_user_id,e.id,case when p_id is null then 'EMPRESA_CRIADA' else 'EMPRESA_ATUALIZADA' end);
  return e;
end;
$$;
revoke all on function public.company_write(bigint,text,text,boolean,jsonb) from public,anon;
grant execute on function public.company_write(bigint,text,text,boolean,jsonb) to authenticated;

create function public.company_delete(p_id bigint,p_permanente boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare e public.empresas; recente boolean;
begin
  perform public.require_active_profile();
  -- Token curto de sessão recém-reautenticada por senha; OAuth não serve como prova.
  select exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]')) amr
    where amr->>'method'='password' and (amr->>'timestamp')::numeric >= extract(epoch from now())-60) into recente;
  if not recente then raise exception using errcode='PT401',message='Confirme sua senha novamente';end if;
  select * into e from public.empresas where id=p_id and dono_id=auth.uid() for update;
  if not found then raise exception using errcode='PT404',message='Empresa não encontrada';end if;
  if p_permanente then delete from public.empresas where id=e.id;
  else update public.empresas set ativa=false where id=e.id;end if;
  insert into public.auditoria(usuario_id,empresa_id,operacao) values(auth.uid(),e.id,case when p_permanente then 'EMPRESA_EXCLUIDA' else 'EMPRESA_ARQUIVADA' end);
end;
$$;
revoke all on function public.company_delete(bigint,boolean) from public,anon;
grant execute on function public.company_delete(bigint,boolean) to authenticated;
commit;
